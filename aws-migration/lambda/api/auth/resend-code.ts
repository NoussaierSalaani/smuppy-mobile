/**
 * Resend Confirmation Code Lambda Handler
 * Resends the verification code to user's email
 *
 * Includes rate limiting to prevent abuse.
 * Returns success even for nonexistent users to prevent email enumeration.
 */

import {
  ResendConfirmationCodeCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRequestId } from '../utils/logger';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';
import { createAuthHandler } from '../utils/create-auth-handler';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

// Anti-enumeration: same message regardless of whether user exists
const RESEND_SUCCESS_MESSAGE = 'If an account exists, a new verification code has been sent.';

export const { handler } = createAuthHandler({
  loggerName: 'auth-resend-code',
  rateLimitPrefix: 'resend-code',
  rateLimitMax: 3,
  rateLimitWindowSeconds: RATE_WINDOW_1_MIN,
  requireFields: ['email'],
  fallbackErrorMessage: RESEND_SUCCESS_MESSAGE,
  errorHandlers: {
    UserNotFoundException: (headers) => ({
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: RESEND_SUCCESS_MESSAGE }),
    }),
    LimitExceededException: (headers) => ({
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'LIMIT_EXCEEDED',
        message: 'Too many attempts. Please wait a few minutes before trying again.',
      }),
    }),
    InvalidParameterException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'ALREADY_CONFIRMED',
        message: 'This email has already been verified. You can sign in now.',
      }),
    }),
  },
  onAction: async (body, headers, log, event) => {
    const email = body.email as string;
    const username = body.username as string | undefined;

    log.setRequestId(getRequestId(event));

    // SECURITY: Always derive username from email lookup -- never trust client-supplied username
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
  },
});
