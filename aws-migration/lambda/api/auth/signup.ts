/**
 * Smart Signup Lambda Handler
 * Handles user registration with proper handling of unconfirmed users
 *
 * Logic:
 * 1. Check if user exists
 * 2. If user exists and is UNCONFIRMED -> delete and recreate with new password
 * 3. If user exists and is CONFIRMED -> return error (email already taken)
 * 4. If user doesn't exist -> create new user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
  UserNotFoundException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-signup');
const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

interface SignupRequest {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
}

// Generate unique username from email
// SECURITY: Uses full email hash to prevent collisions
// Example: john@gmail.com -> u_johngmailcom (no special chars)
// This MUST match client-side logic in aws-auth.ts
const generateUsername = (email: string): string => {
  // Remove all non-alphanumeric characters and lowercase
  const emailHash = email.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `u_${emailHash}`;
};

// Check if user exists and get their status
const checkUserStatus = async (username: string): Promise<{
  exists: boolean;
  confirmed: boolean;
}> => {
  try {
    const user = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );

    // UserStatus can be: UNCONFIRMED, CONFIRMED, ARCHIVED, UNKNOWN, RESET_REQUIRED, FORCE_CHANGE_PASSWORD
    const isConfirmed = user.UserStatus === 'CONFIRMED';

    return { exists: true, confirmed: isConfirmed };
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      return { exists: false, confirmed: false };
    }
    throw error;
  }
};

// Delete an unconfirmed user
const deleteUnconfirmedUser = async (username: string): Promise<void> => {
  log.info('Deleting unconfirmed user', { username });

  await cognitoClient.send(
    new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    })
  );

  log.info('Unconfirmed user deleted');
};

// Create a new user
const createUser = async (
  username: string,
  email: string,
  password: string,
  fullName?: string
): Promise<{ userSub: string }> => {
  log.info('Creating user', { username });

  const userAttributes = [
    { Name: 'email', Value: email },
  ];

  if (fullName) {
    userAttributes.push({ Name: 'name', Value: fullName });
  }

  const response = await cognitoClient.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: userAttributes,
    })
  );

  log.info('User created', { userSub: response.UserSub });

  return { userSub: response.UserSub! };
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

    const { email, password, username, fullName } = JSON.parse(event.body) as SignupRequest;

    // Validate required fields
    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email and password are required'
        }),
      };
    }

    // Generate the Cognito username
    const cognitoUsername = username || generateUsername(email);

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.setRequestId(getRequestId(event));
    log.info('Processing signup for user', { username: cognitoUsername.substring(0, 2) + '***' });

    // Check if user already exists
    const userStatus = await checkUserStatus(cognitoUsername);

    if (userStatus.exists) {
      if (userStatus.confirmed) {
        // User exists and is confirmed - cannot sign up again
        // Return generic error to prevent email enumeration
        log.info('User exists and is confirmed');
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Unable to create account. Please try again or login.'
          }),
        };
      } else {
        // User exists but is UNCONFIRMED - delete and recreate with new password
        log.info('User exists but is unconfirmed - will delete and recreate');
        await deleteUnconfirmedUser(cognitoUsername);
        // Small delay to ensure deletion is processed
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Create new user
    const { userSub } = await createUser(cognitoUsername, email, password, fullName);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        userSub,
        confirmationRequired: true,
        message: 'Account created. Please check your email for verification code.',
      }),
    };

  } catch (error: any) {
    log.error('Signup error', error);

    // Handle specific Cognito errors
    if (error instanceof UsernameExistsException) {
      // This shouldn't happen if our logic is correct, but handle it anyway
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Unable to create account. Please try again or login.'
        }),
      };
    }

    if (error.name === 'InvalidPasswordException' || error.message?.includes('Password')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Password must be at least 8 characters with uppercase, lowercase, numbers, and a special character.'
        }),
      };
    }

    if (error.name === 'InvalidParameterException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: error.message || 'Invalid input. Please check your information.'
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Unable to create account. Please try again.',
      }),
    };
  }
};
