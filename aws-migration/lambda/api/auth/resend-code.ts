/**
 * Resend Confirmation Code Lambda Handler
 * Resends the verification code to user's email
 *
 * Includes rate limiting to prevent abuse
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ResendConfirmationCodeCommand,
  ListUsersCommand,
  UserNotFoundException,
  LimitExceededException,
  InvalidParameterException,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-resend-code');
const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = new DynamoDBClient({});

// Validate required environment variables at module load
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const CLIENT_ID = process.env.CLIENT_ID;
const USER_POOL_ID = process.env.USER_POOL_ID;
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

/**
 * Distributed Rate Limiting via DynamoDB
 * 3 attempts per IP per 1-minute window, shared across all Lambda instances.
 * Uses DynamoDB atomic counters with TTL for automatic cleanup.
 */
const RATE_LIMIT_WINDOW_S = 60; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3;

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
        Filter: `email = "${email.toLowerCase()}"`,
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

const checkRateLimit = async (ip: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `resend-code#${ip}#${Math.floor(now / RATE_LIMIT_WINDOW_S)}`;
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

    if (count > MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = windowEnd - now;
      return { allowed: false, retryAfter };
    }

    return { allowed: true };
  } catch (error) {
    log.error('Rate limit check failed, blocking request', error);
    return { allowed: false, retryAfter: 60 };
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

    const { email, username } = JSON.parse(event.body);

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

    // Check rate limit (distributed via DynamoDB, keyed by IP)
    const clientIp = event.requestContext.identity?.sourceIp ||
                     event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                     'unknown';
    const rateLimit = await checkRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers: {
          ...headers,
          'Retry-After': rateLimit.retryAfter?.toString() || '60',
        },
        body: JSON.stringify({
          success: false,
          code: 'RATE_LIMITED',
          message: `Too many requests. Please wait ${rateLimit.retryAfter} seconds before trying again.`,
          retryAfter: rateLimit.retryAfter,
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

    // SECURITY: Log only masked identifier to prevent PII in logs
    log.info('Resending code for user', { username: cognitoUsername.substring(0, 2) + '***' });

    await cognitoClient.send(
      new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
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

  } catch (error: any) {
    log.error('ResendCode error', error, { errorName: error.name });

    // Handle specific Cognito errors
    if (error instanceof UserNotFoundException) {
      // Return generic message to prevent email enumeration
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'If an account exists, a new verification code has been sent.',
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
          message: 'Too many attempts. Please wait a few minutes before trying again.',
        }),
      };
    }

    if (error instanceof InvalidParameterException) {
      // User might already be confirmed
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          code: 'ALREADY_CONFIRMED',
          message: 'This email has already been verified. You can sign in now.',
        }),
      };
    }

    // For any other error, return success to prevent enumeration
    log.error('Unexpected error, returning generic success', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'If an account exists, a new verification code has been sent.',
      }),
    };
  }
};
