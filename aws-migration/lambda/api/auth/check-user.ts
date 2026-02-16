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
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_5_MIN } from '../utils/constants';

const log = createLogger('auth-check-user');
const cognitoClient = new CognitoIdentityProviderClient({});

// Validate required environment variables at module load
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

const USER_POOL_ID = process.env.USER_POOL_ID;

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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  // Get client IP for rate limiting
  const clientIp = event.requestContext.identity?.sourceIp ||
                   event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                   'unknown';

  // Check rate limit (distributed via DynamoDB): 5 attempts per IP per 5 minutes
  const rateLimit = await checkRateLimit({ prefix: 'check-user', identifier: clientIp, windowSeconds: RATE_WINDOW_5_MIN, maxRequests: 5 });
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
    log.info('Checking user', { username: cognitoUsername.substring(0, 2) + '***' });

    // SECURITY: Anti-enumeration — check user but return same response shape
    // to prevent attackers from determining if an email is registered.
    const emailCheck = await checkUserByEmail(normalizedEmail);

    let isConfirmed = emailCheck.confirmed;

    if (!emailCheck.exists) {
      // Fallback: check by generated username (legacy accounts)
      try {
        const user = await cognitoClient.send(
          new AdminGetUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: cognitoUsername,
          })
        );
        isConfirmed = user.UserStatus === 'CONFIRMED';
      } catch (error) {
        if (!(error instanceof UserNotFoundException)) throw error;
      }
    }

    // ANTI-ENUMERATION: Response never reveals exists/confirmed booleans.
    // confirmed=true → "proceed to login" (canSignup=false)
    // confirmed=false or not found → "proceed to signup" (canSignup=true)
    const canSignup = !isConfirmed;

    log.info('Check user result', { canSignup });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        canSignup,
        message: canSignup ? 'OK' : 'Unable to proceed.',
      }),
    };

  } catch (error: unknown) {
    log.error('CheckUser error', error, { errorName: error instanceof Error ? error.name : String(error) });

    // Generic error - allow signup to continue (will fail later if needed)
    // SECURITY: Use canSignup instead of exists/confirmed to prevent enumeration
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        canSignup: true,
        message: 'Unable to verify. Please continue.',
      }),
    };
  }
};
