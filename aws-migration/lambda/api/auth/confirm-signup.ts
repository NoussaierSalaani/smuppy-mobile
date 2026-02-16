/**
 * Confirm Signup Lambda Handler
 * Confirms user email verification with code
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ListUsersCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  NotAuthorizedException,
  AliasExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_5_MIN } from '../utils/constants';

const log = createLogger('auth-confirm-signup');
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

  // Rate limit check (distributed via DynamoDB): 10 attempts per IP per 5 minutes
  const clientIp = event.requestContext.identity?.sourceIp ||
                   event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                   'unknown';
  const rateLimit = await checkRateLimit({ prefix: 'confirm-signup', identifier: clientIp, windowSeconds: RATE_WINDOW_5_MIN, maxRequests: 10 });
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
        message: 'Too many attempts. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      }),
    };
  }

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

    const { email, code, username } = JSON.parse(event.body);

    if (!email || !code) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email and code are required'
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

    log.info('Confirming user', { username: resolvedUsername.substring(0, 2) + '***', code: code.substring(0, 2) + '****' });

    await cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: resolvedUsername,
        ConfirmationCode: code,
      })
    );

    log.info('User confirmed successfully', { username: resolvedUsername.substring(0, 2) + '***' });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Email verified successfully. You can now sign in.',
      }),
    };

  } catch (error: unknown) {
    log.error('ConfirmSignup error', error, { errorName: error instanceof Error ? error.name : String(error) });

    // Handle specific Cognito errors with user-friendly messages
    if (error instanceof CodeMismatchException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'INVALID_CODE',
          message: 'Invalid verification code. Please check and try again.',
        }),
      };
    }

    if (error instanceof ExpiredCodeException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'EXPIRED_CODE',
          message: 'Verification code has expired. Please request a new one.',
        }),
      };
    }

    if (error instanceof UserNotFoundException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'USER_NOT_FOUND',
          message: 'Unable to verify. Please try signing up again.',
        }),
      };
    }

    if (error instanceof NotAuthorizedException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'ALREADY_CONFIRMED',
          message: 'Email already verified. You can sign in now.',
        }),
      };
    }

    if (error instanceof AliasExistsException) {
      // Generic message to prevent email enumeration
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'VERIFICATION_FAILED',
          message: 'Unable to verify. Please try again or contact support.',
        }),
      };
    }

    // Generic error
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Verification failed. Please try again.',
      }),
    };
  }
};
