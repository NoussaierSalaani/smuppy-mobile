/**
 * Confirm Signup Lambda Handler
 * Confirms user email verification with code
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UserNotFoundException,
  NotAuthorizedException,
  AliasExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-confirm-signup');
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

    // Generate the Cognito username (or use provided)
    const cognitoUsername = username || generateUsername(email);

    log.setRequestId(getRequestId(event));
    log.info('Confirming user', { username: cognitoUsername, code: code.substring(0, 2) + '****' });

    await cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
        ConfirmationCode: code,
      })
    );

    log.info('User confirmed successfully', { username: cognitoUsername });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Email verified successfully. You can now sign in.',
      }),
    };

  } catch (error: any) {
    log.error('ConfirmSignup error', error, { errorName: error.name });

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
