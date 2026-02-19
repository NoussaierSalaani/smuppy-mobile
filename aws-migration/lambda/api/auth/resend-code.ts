/**
 * Resend Confirmation Code Lambda Handler
 * Resends the verification code to user's email
 *
 * Includes rate limiting to prevent abuse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ResendConfirmationCodeCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';

const log = createLogger('auth-resend-code');

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

    // Check rate limit (distributed via DynamoDB): 3 attempts per IP per minute
    const clientIp = event.requestContext.identity?.sourceIp ||
                     event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                     'unknown';
    const rateLimitResponse = await requireRateLimit({ prefix: 'resend-code', identifier: clientIp, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 3 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    log.setRequestId(getRequestId(event));

    // SECURITY: Always derive username from email lookup — never trust client-supplied username
    const resolvedUsername = await resolveUsername(email, username);
    if (!resolvedUsername) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Unable to resolve username' }) };
    }

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.info('Resending code for user', { username: resolvedUsername.substring(0, 2) + '***' });

    await cognitoClient.send(
      new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: resolvedUsername,
      })
    );

    log.info('Code resent successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'A new verification code has been sent to your email.',
      }),
    };

  } catch (error: unknown) {
    log.error('ResendCode error', error, { errorName: error instanceof Error ? error.name : String(error) });

    // Handle specific Cognito errors
    if (error instanceof UserNotFoundException) {
      // Return generic message to prevent email enumeration
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'If an account exists, a new verification code has been sent.',
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
          message: 'Too many attempts. Please wait a few minutes before trying again.',
        }),
      };
    }

    if (error instanceof InvalidParameterException) {
      // User might already be confirmed
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'ALREADY_CONFIRMED',
          message: 'This email has already been verified. You can sign in now.',
        }),
      };
    }

    // For any other error, return success to prevent enumeration
    log.error('Unexpected error, returning generic success', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists, a new verification code has been sent.',
      }),
    };
  }
};
