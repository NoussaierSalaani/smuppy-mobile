/**
 * Confirm Forgot Password Lambda Handler
 * Completes password reset with code and new password
 */

import {
  ConfirmForgotPasswordCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRequestId } from '../utils/logger';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';
import { createAuthHandler } from '../utils/create-auth-handler';

export const { handler } = createAuthHandler({
  loggerName: 'auth-confirm-forgot-password',
  rateLimitPrefix: 'confirm-forgot-password',
  rateLimitMax: 5,
  rateLimitWindowSeconds: 60,
  requireFields: ['email', 'code', 'newPassword'],
  fallbackErrorMessage: 'Password reset failed. Please try again.',
  errorHandlers: {
    CodeMismatchException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'INVALID_CODE',
        message: 'Invalid reset code. Please check and try again.',
      }),
    }),
    ExpiredCodeException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'EXPIRED_CODE',
        message: 'Reset code has expired. Please request a new one.',
      }),
    }),
    UserNotFoundException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Unable to reset password. Please try again.',
      }),
    }),
    InvalidPasswordException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Password must be at least 8 characters with uppercase, lowercase, numbers, and a special character.',
      }),
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
  },
  onAction: async (body, headers, log, event) => {
    const email = body.email as string;
    const code = body.code as string;
    const newPassword = body.newPassword as string;
    const username = body.username as string | undefined;

    // Password validation
    if (newPassword.length < 8) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters long.',
        }),
      };
    }

    log.setRequestId(getRequestId(event));

    // Look up actual username by email (handles any username format)
    // Falls back to generated username if lookup fails
    const cognitoUsername = await resolveUsername(email, username);
    if (!cognitoUsername) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Unable to resolve username' }),
      };
    }

    log.info('Resetting password for user', {
      username: cognitoUsername.substring(0, 2) + '***',
    });

    await cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
        ConfirmationCode: code,
        Password: newPassword,
      })
    );

    log.info('Password reset successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Password has been reset successfully. You can now sign in with your new password.',
      }),
    };
  },
});
