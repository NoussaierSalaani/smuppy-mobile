/**
 * Forgot Password Lambda Handler
 * Initiates password reset flow by sending reset code
 *
 * Includes rate limiting and security measures.
 * Returns success even for nonexistent users to prevent email enumeration.
 */

import {
  ForgotPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRequestId } from '../utils/logger';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';
import { createAuthHandler } from '../utils/create-auth-handler';
import { RATE_WINDOW_5_MIN } from '../utils/constants';

// Anti-enumeration: same message regardless of whether user exists
const RESET_SUCCESS_MESSAGE = 'If an account exists with this email, a password reset code has been sent.';

export const { handler } = createAuthHandler({
  loggerName: 'auth-forgot-password',
  rateLimitPrefix: 'forgot-password',
  rateLimitMax: 3,
  rateLimitWindowSeconds: RATE_WINDOW_5_MIN,
  requireFields: ['email'],
  fallbackErrorMessage: RESET_SUCCESS_MESSAGE,
  errorHandlers: {
    UserNotFoundException: (headers) => ({
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: RESET_SUCCESS_MESSAGE }),
    }),
    LimitExceededException: (headers) => ({
      statusCode: 429,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'LIMIT_EXCEEDED',
        message: 'Too many attempts. Please wait before trying again.',
      }),
    }),
    InvalidParameterException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'NOT_CONFIRMED',
        message: 'Please verify your email first before resetting your password.',
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
      body: JSON.stringify({ success: true, message: RESET_SUCCESS_MESSAGE }),
    };
  },
});
