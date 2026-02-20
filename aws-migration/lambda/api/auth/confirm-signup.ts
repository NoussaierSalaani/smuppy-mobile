/**
 * Confirm Signup Lambda Handler
 * Confirms user email verification with code
 */

import {
  ConfirmSignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRequestId } from '../utils/logger';
import { cognitoClient, CLIENT_ID, resolveUsername } from '../utils/cognito-helpers';
import { createAuthHandler } from '../utils/create-auth-handler';

export const { handler } = createAuthHandler({
  loggerName: 'auth-confirm-signup',
  rateLimitPrefix: 'confirm-signup',
  rateLimitMax: 10,
  rateLimitWindowSeconds: 300,
  requireFields: ['email', 'code'],
  fallbackErrorMessage: 'Verification failed. Please try again.',
  errorHandlers: {
    CodeMismatchException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'INVALID_CODE',
        message: 'Invalid verification code. Please check and try again.',
      }),
    }),
    ExpiredCodeException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'EXPIRED_CODE',
        message: 'Verification code has expired. Please request a new one.',
      }),
    }),
    UserNotFoundException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Unable to verify. Please try signing up again.',
      }),
    }),
    NotAuthorizedException: (headers) => ({
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'ALREADY_CONFIRMED',
        message: 'Email already verified. You can sign in now.',
      }),
    }),
    AliasExistsException: (headers) => ({
      // Generic message to prevent email enumeration
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        code: 'VERIFICATION_FAILED',
        message: 'Unable to verify. Please try again or contact support.',
      }),
    }),
  },
  onAction: async (body, headers, log, event) => {
    const email = body.email as string;
    const code = body.code as string;
    const username = body.username as string | undefined;

    log.setRequestId(getRequestId(event));

    // SECURITY: Always derive username from email lookup -- never trust client-supplied username
    const resolvedUsername = await resolveUsername(email, username);
    if (!resolvedUsername) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Unable to resolve username' }),
      };
    }

    log.info('Confirming user', {
      username: resolvedUsername.substring(0, 2) + '***',
      code: code.substring(0, 2) + '****',
    });

    await cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: resolvedUsername,
        ConfirmationCode: code,
      })
    );

    log.info('User confirmed successfully', {
      username: resolvedUsername.substring(0, 2) + '***',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Email verified successfully. You can now sign in.',
      }),
    };
  },
});
