/**
 * Confirm Forgot Password Lambda Handler
 * Completes password reset with code and new password
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  InvalidPasswordException,
  LimitExceededException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';

const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const CLIENT_ID = process.env.CLIENT_ID;

// Generate username from email - MUST match client-side logic
// Client uses: email.split('@')[0] (the part before @)
const generateUsername = (email: string): string => {
  return email.toLowerCase().split('@')[0];
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

    const cognitoUsername = username || generateUsername(email);

    console.log('[ConfirmForgotPassword] Resetting password for:', cognitoUsername);

    await cognitoClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
        ConfirmationCode: code,
        Password: newPassword,
      })
    );

    console.log('[ConfirmForgotPassword] Password reset successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Password has been reset successfully. You can now sign in with your new password.',
      }),
    };

  } catch (error: any) {
    console.error('[ConfirmForgotPassword] Error:', error.name, error.message);

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
