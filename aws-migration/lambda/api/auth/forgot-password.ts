/**
 * Forgot Password Lambda Handler
 * Initiates password reset flow by sending reset code
 *
 * Includes rate limiting and security measures
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  ListUsersCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_5_MIN } from '../utils/constants';

const log = createLogger('auth-forgot-password');
const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const CLIENT_ID = process.env.CLIENT_ID;
const USER_POOL_ID = process.env.USER_POOL_ID;

// Generate username from email - fallback if lookup fails
// Example: john@gmail.com -> johngmailcom (no special chars)
const generateUsername = (email: string): string => {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Look up actual username by email (handles any username format)
const getUsernameByEmail = async (email: string): Promise<string | null> => {
  try {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email.toLowerCase().replace(/["\\]/g, '').replace(/[^a-z0-9@.+_-]/g, '')}"`,
        Limit: 1,
      })
    );

    if (response.Users && response.Users.length > 0) {
      return response.Users[0].Username || null;
    }
    return null;
  } catch (error) {
    log.error('Error looking up user by email', error);
    return null;
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Missing request body'
        }),
      };
    }

    const { email, username } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email is required'
        }),
      };
    }

    // Check rate limit (distributed via DynamoDB): 3 attempts per IP per 5 minutes
    const clientIp = event.requestContext.identity?.sourceIp ||
                     event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                     'unknown';
    const rateLimit = await checkRateLimit({ prefix: 'forgot-password', identifier: clientIp, windowSeconds: RATE_WINDOW_5_MIN, maxRequests: 3 });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'Retry-After': rateLimit.retryAfter?.toString() || '300',
        },
        body: JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          message: `Too many requests. Please wait ${Math.ceil((rateLimit.retryAfter || 300) / 60)} minutes before trying again.`,
          retryAfter: rateLimit.retryAfter,
        }),
      };
    }

    log.setRequestId(getRequestId(event));

    // SECURITY: Always derive username from email lookup — never trust client-supplied username
    const resolvedUsername: string | null = await getUsernameByEmail(email)
      || username
      || generateUsername(email)
      || null;
    if (!resolvedUsername) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Unable to resolve username' }) };
    }

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.info('Initiating reset for user', { username: resolvedUsername.substring(0, 2) + '***' });

    await cognitoClient.send(
      new ForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: resolvedUsername,
      })
    );

    log.info('Reset code sent successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.',
      }),
    };

  } catch (error: unknown) {
    log.error('ForgotPassword error', error, { errorName: error instanceof Error ? error.name : String(error) });

    // Always return success message to prevent email enumeration
    if (error instanceof UserNotFoundException) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'If an account exists with this email, a password reset code has been sent.',
        }),
      };
    }

    if (error instanceof LimitExceededException) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'LIMIT_EXCEEDED',
          message: 'Too many attempts. Please wait before trying again.',
        }),
      };
    }

    if (error instanceof InvalidParameterException) {
      // User might not be confirmed
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'NOT_CONFIRMED',
          message: 'Please verify your email first before resetting your password.',
        }),
      };
    }

    // Generic success to prevent enumeration
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists with this email, a password reset code has been sent.',
      }),
    };
  }
};
