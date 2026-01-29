/**
 * Check User Exists Lambda Handler
 * Checks if a user already exists in Cognito (confirmed status)
 *
 * IMPORTANT: Checks BOTH by generated username AND by email attribute
 * This handles legacy accounts with different username formats
 *
 * Returns generic message to prevent email enumeration
 * Includes rate limiting to prevent abuse (5 attempts per 5 minutes per IP)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  ListUsersCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-check-user');
const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

/**
 * Distributed Rate Limiting via DynamoDB
 * 5 attempts per IP per 5-minute window, shared across all Lambda instances.
 */
const RATE_LIMIT_WINDOW_S = 5 * 60;
const MAX_ATTEMPTS = 5;

const checkRateLimit = async (ip: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `check-user#${ip}#${Math.floor(now / RATE_LIMIT_WINDOW_S)}`;
  const windowEnd = (Math.floor(now / RATE_LIMIT_WINDOW_S) + 1) * RATE_LIMIT_WINDOW_S;

  try {
    const result = await dynamoClient.send(new UpdateItemCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: { S: windowKey } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':ttl': { N: String(windowEnd + 60) },
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
    log.error('Rate limit check failed, blocking request', error);
    return { allowed: false, retryAfter: 60 };
  }
};

// Generate unique username from email
// SECURITY: Uses full email hash to prevent collisions
// Example: john@gmail.com -> johngmailcom (no special chars)
// This MUST match client-side logic in aws-auth.ts and signup.ts
const generateUsername = (email: string): string => {
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
        Filter: `email = "${email.toLowerCase().replace(/[^a-z0-9@.+_-]/g, '')}"`,
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

    const { email } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Email is required'
        }),
      };
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cognitoUsername = generateUsername(normalizedEmail);

    log.setRequestId(getRequestId(event));
    log.info('Checking user', { username: cognitoUsername });

    // FIRST: Check by email attribute (catches legacy accounts with different username formats)
    const emailCheck = await checkUserByEmail(normalizedEmail);

    if (emailCheck.exists) {
      log.info('User found by email', { confirmed: emailCheck.confirmed, username: emailCheck.username });

      if (emailCheck.confirmed) {
        // User exists and is confirmed - generic message (anti-enumeration)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: true,
            message: 'Unable to proceed.',
          }),
        };
      } else {
        // User exists but not confirmed - allow signup (will delete and recreate)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: false,
            message: 'OK',
          }),
        };
      }
    }

    // SECOND: Also check by generated username (fallback)
    try {
      const user = await cognitoClient.send(
        new AdminGetUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: cognitoUsername,
        })
      );

      // User exists - check if confirmed
      const isConfirmed = user.UserStatus === 'CONFIRMED';

      log.info('User found by username', { confirmed: isConfirmed });

      if (isConfirmed) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: true,
            message: 'Unable to proceed.',
          }),
        };
      } else {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: true,
            confirmed: false,
            message: 'OK',
          }),
        };
      }

    } catch (error) {
      if (error instanceof UserNotFoundException) {
        // User doesn't exist by username either - can proceed with signup
        log.info('User not found, can proceed');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            exists: false,
            confirmed: false,
            message: 'OK',
          }),
        };
      }
      throw error;
    }

  } catch (error: unknown) {
    log.error('CheckUser error', error, { errorName: error instanceof Error ? error.name : String(error) });

    // Generic error - allow signup to continue (will fail later if needed)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        exists: false,
        confirmed: false,
        message: 'Unable to verify. Please continue.',
      }),
    };
  }
};
