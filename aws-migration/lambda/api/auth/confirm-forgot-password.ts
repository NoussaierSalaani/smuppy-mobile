/**
 * Confirm Forgot Password Lambda Handler
 * Completes password reset with code and new password
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ListUsersCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-confirm-forgot-password');
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
        Filter: `email = "${email.toLowerCase().replace(/[^a-z0-9@.+_-]/g, '')}"`,
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

    const { email, code, newPassword, username } = JSON.parse(event.body);

    if (!email || !code || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email, code, and new password are required'
        }),
      };
    }

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
    let cognitoUsername = username;
    if (!cognitoUsername) {
      cognitoUsername = await getUsernameByEmail(email);
      if (!cognitoUsername) {
        // Fallback to generated username
        cognitoUsername = generateUsername(email);
      }
    }

    log.info('Resetting password for user', { username: cognitoUsername.substring(0, 2) + '***' });

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

  } catch (error: unknown) {
    log.error('ConfirmForgotPassword error', error, { errorName: error instanceof Error ? error.name : String(error) });

    if (error instanceof CodeMismatchException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'INVALID_CODE',
          message: 'Invalid reset code. Please check and try again.',
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
          message: 'Reset code has expired. Please request a new one.',
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
          message: 'Unable to reset password. Please try again.',
        }),
      };
    }

    if (error instanceof InvalidPasswordException) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'INVALID_PASSWORD',
          message: 'Password must be at least 8 characters with uppercase, lowercase, numbers, and a special character.',
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

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Password reset failed. Please try again.',
      }),
    };
  }
};
