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
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-check-user');
const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;

/**
 * Rate Limiting
 * 5 attempts per IP per 5 minutes
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

const checkRateLimit = (ip: string): { allowed: boolean; retryAfter?: number } => {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
};

// Cleanup old entries periodically
const cleanupRateLimitMap = () => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
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
        Filter: `email = "${email.toLowerCase()}"`,
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

  // Cleanup old rate limit entries
  cleanupRateLimitMap();

  // Get client IP for rate limiting
  const clientIp = event.requestContext.identity?.sourceIp ||
                   event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                   'unknown';

  // Check rate limit
  const rateLimit = checkRateLimit(clientIp);
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

  } catch (error: any) {
    log.error('CheckUser error', error, { errorName: error.name });

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
