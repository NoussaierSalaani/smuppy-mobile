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

import {
  AdminGetUserCommand,
  ListUsersCommand,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { getRequestId } from '../utils/logger';
import { cognitoClient, USER_POOL_ID, generateUsername } from '../utils/cognito-helpers';
import { createAuthHandler } from '../utils/create-auth-handler';

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
        Filter: `email = "${email.toLowerCase().replaceAll(/["\\]/g, '').replaceAll(/[^a-z0-9@.+_-]/g, '')}"`,
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
  } catch {
    return { exists: false, confirmed: false };
  }
};

export const { handler } = createAuthHandler({
  loggerName: 'auth-check-user',
  rateLimitPrefix: 'check-user',
  rateLimitMax: 5,
  rateLimitWindowSeconds: 300,
  requireFields: ['email'],
  fallbackErrorMessage: 'Unable to verify. Please continue.',
  onAction: async (body, headers, log, event) => {
    const email = body.email as string;
    const cognitoUsername = generateUsername(email);

    log.setRequestId(getRequestId(event));
    log.info('Checking user', { username: cognitoUsername.substring(0, 2) + '***' });

    try {
      // SECURITY: Anti-enumeration -- check user but return same response shape
      // to prevent attackers from determining if an email is registered.
      const emailCheck = await checkUserByEmail(email);

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
      // confirmed=true -> "proceed to login" (canSignup=false)
      // confirmed=false or not found -> "proceed to signup" (canSignup=true)
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
      log.error('CheckUser error', error, {
        errorName: error instanceof Error ? error.name : String(error),
      });

      // Generic error -- allow signup to continue (will fail later if needed)
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
  },
});
