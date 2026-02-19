/**
 * Forgot Password Lambda Handler
 * Initiates password reset flow by sending reset code
 *
 * Includes rate limiting and security measures
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ForgotPasswordCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_5_MIN } from '../utils/constants';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';

const log = createLogger('auth-forgot-password');

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing request body' }) };
    }

    const { email, username } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Email is required' }) };
    }

    // Check rate limit (distributed via DynamoDB): 3 attempts per IP per 5 minutes
    const clientIp = event.requestContext.identity?.sourceIp ||
                     event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                     'unknown';
    const rateLimitResponse = await requireRateLimit({ prefix: 'forgot-password', identifier: clientIp, windowSeconds: RATE_WINDOW_5_MIN, maxRequests: 3 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    log.setRequestId(getRequestId(event));

    // SECURITY: Always derive username from email lookup — never trust client-supplied username
    const resolvedUsername = await resolveUsername(email, username);
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
