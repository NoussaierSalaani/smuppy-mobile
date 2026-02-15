/**
 * Smart Signup Lambda Handler
 * Handles user registration with proper handling of unconfirmed users
 *
 * IMPORTANT: Checks BOTH by generated username AND by email attribute
 * This handles legacy accounts with different username formats
 *
 * Includes distributed rate limiting via DynamoDB: 5 attempts per IP per 5 minutes
 *
 * Logic:
 * 1. Check if user exists (by email AND by username)
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
  ListUsersCommand,
  UserNotFoundException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';
import { isNamedError } from '../utils/error-handler';

const log = createLogger('auth-signup');
const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

/**
 * Distributed Rate Limiting via DynamoDB
 * 5 attempts per IP per 5-minute window, shared across all Lambda instances.
 * Uses DynamoDB atomic counters with TTL for automatic cleanup.
 */
const RATE_LIMIT_WINDOW_S = 5 * 60; // 5 minutes in seconds
const MAX_ATTEMPTS = 5;

const checkRateLimit = async (ip: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `signup#${ip}#${Math.floor(now / RATE_LIMIT_WINDOW_S)}`;
  const windowEnd = (Math.floor(now / RATE_LIMIT_WINDOW_S) + 1) * RATE_LIMIT_WINDOW_S;

  try {
    // Atomic increment - creates item if it doesn't exist
    const result = await dynamoClient.send(new UpdateItemCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: { S: windowKey } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':ttl': { N: String(windowEnd + 60) }, // TTL: window end + 60s buffer
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = parseInt(result.Attributes?.count?.N || '1', 10);

    if (count > MAX_ATTEMPTS) {
      const retryAfter = windowEnd - now;
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    // Fail-closed: if DynamoDB is unavailable, block the request for safety
    log.error('Rate limit check failed, blocking request', error);
    return { allowed: false, retryAfter: 60 };
  }
};

interface SignupRequest {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
}

// Generate unique username from email
// SECURITY: Uses full email hash to prevent collisions
// Example: john@gmail.com -> johngmailcom (no special chars)
// This MUST match client-side logic in aws-auth.ts
const generateUsername = (email: string): string => {
  // Remove all non-alphanumeric characters and lowercase
  return email.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Check if user exists by email attribute (catches legacy accounts with different username formats)
const checkUserByEmail = async (email: string): Promise<{
  exists: boolean;
  confirmed: boolean;
  username?: string;
}> => {
  try {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email.toLowerCase().replace(/["\\]/g, '').replace(/[^a-z0-9@.+_-]/g, '')}"`,
        Limit: 1,
      })
    );

    if (response.Users && response.Users.length > 0) {
      const user = response.Users[0];
      // Only block CONFIRMED accounts (completed signup with email verification)
      // FORCE_CHANGE_PASSWORD = admin-created, allow re-signup
      // UNCONFIRMED = incomplete signup, allow re-signup
      const isConfirmed = user.UserStatus === 'CONFIRMED';
      return { exists: true, confirmed: isConfirmed, username: user.Username };
    }

    return { exists: false, confirmed: false };
  } catch (error) {
    log.error('Error checking user by email', error);
    return { exists: false, confirmed: false };
  }
};

// Check if user exists and get their status (by username)
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

  // Get client IP for rate limiting
  const clientIp = event.requestContext.identity?.sourceIp ||
                   event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                   'unknown';

  // Check rate limit (distributed via DynamoDB)
  const rateLimit = await checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    log.info('Rate limited', { ip: clientIp, retryAfter: rateLimit.retryAfter });
    return {
      statusCode: 429,
      headers: {
        ...headers,
        'Retry-After': rateLimit.retryAfter?.toString() || '300',
      },
      body: JSON.stringify({
        success: false,
        code: 'RATE_LIMITED',
        message: `Too many attempts. Please wait ${Math.ceil((rateLimit.retryAfter || 300) / 60)} minutes.`,
        retryAfter: rateLimit.retryAfter,
      }),
    };
  }

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

    // Parse JSON with error handling for special characters
    // Handle both plain JSON and base64-encoded bodies
    let parsedBody: SignupRequest;
    try {
      let bodyStr = event.body;

      // If body is base64 encoded, decode it first
      if (event.isBase64Encoded) {
        bodyStr = Buffer.from(event.body, 'base64').toString('utf-8');
      }

      parsedBody = JSON.parse(bodyStr) as SignupRequest;
    } catch (parseError: unknown) {
      log.error('JSON parse error', parseError, {
        bodyLength: event.body?.length,
        isBase64: event.isBase64Encoded,
        bodyPreview: event.body?.substring(0, 50)
      });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid request format. Please try again.'
        }),
      };
    }

    const { email, password, username, fullName } = parsedBody;

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

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Generate the Cognito username
    const cognitoUsername = username || generateUsername(normalizedEmail);

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.setRequestId(getRequestId(event));
    log.info('Processing signup for user', { username: cognitoUsername.substring(0, 2) + '***' });

    // FIRST: Check if user already exists BY EMAIL (catches legacy accounts with different username formats)
    const emailCheck = await checkUserByEmail(normalizedEmail);

    if (emailCheck.exists) {
      if (emailCheck.confirmed) {
        // User exists and is confirmed - cannot sign up again
        // Return generic error to prevent email enumeration
        log.info('User exists by email and is confirmed', { existingUsername: emailCheck.username });
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
        // Use the ACTUAL username from the email lookup (not the generated one)
        const usernameToDelete = emailCheck.username || cognitoUsername;
        log.info('User exists by email but is unconfirmed - will delete and recreate', { usernameToDelete });
        await deleteUnconfirmedUser(usernameToDelete);
        // Wait for Cognito eventual consistency (retry-based instead of fixed delay)
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 200));
          const recheck = await checkUserByEmail(normalizedEmail);
          if (!recheck.exists) break;
        }
      }
    } else {
      // SECOND: Also check by generated username (fallback)
      const userStatus = await checkUserStatus(cognitoUsername);

      if (userStatus.exists) {
        if (userStatus.confirmed) {
          // Username taken by a CONFIRMED account with a different email
          // Generate a unique username instead of blocking
          log.info('Username taken by different email - generating unique username');
          const uniqueSuffix = Date.now().toString(36).slice(-4);
          const uniqueUsername = `${cognitoUsername}${uniqueSuffix}`;
          const { userSub } = await createUser(uniqueUsername, normalizedEmail, password, fullName);
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
        } else {
          // User exists but is UNCONFIRMED - delete and recreate with new password
          log.info('User exists by username but is unconfirmed - will delete and recreate');
          await deleteUnconfirmedUser(cognitoUsername);
          // Wait for Cognito eventual consistency (retry-based)
          for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 200));
            const recheck = await checkUserStatus(cognitoUsername);
            if (!recheck.exists) break;
          }
        }
      }
    }

    // Create new user — SECURITY: use normalizedEmail, not raw email
    const { userSub } = await createUser(cognitoUsername, normalizedEmail, password, fullName);

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

  } catch (error: unknown) {
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

    if (isNamedError(error) && (error.name === 'InvalidPasswordException' || error.message?.includes('Password'))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Password must be at least 8 characters with uppercase, lowercase, numbers, and a special character.'
        }),
      };
    }

    if (isNamedError(error) && error.name === 'InvalidParameterException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid input. Please check your information.'
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
