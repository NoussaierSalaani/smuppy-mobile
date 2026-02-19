/**
 * Shared Cognito helpers for auth handlers.
 * Eliminates duplication between forgot-password.ts and resend-code.ts.
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createLogger } from './logger';

const log = createLogger('cognito-helpers');

// Validate required environment variables at module load
if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID environment variable is required');
if (!process.env.USER_POOL_ID) throw new Error('USER_POOL_ID environment variable is required');

export const CLIENT_ID = process.env.CLIENT_ID;
export const USER_POOL_ID = process.env.USER_POOL_ID;
export const cognitoClient = new CognitoIdentityProviderClient({});

/**
 * Generate username from email - fallback if lookup fails.
 * Example: john@gmail.com -> johngmailcom (no special chars)
 */
export function generateUsername(email: string): string {
  return email.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/**
 * Look up actual username by email (handles any username format).
 * Strips dangerous characters from email before Cognito filter interpolation.
 */
export async function getUsernameByEmail(email: string): Promise<string | null> {
  try {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email.toLowerCase().replaceAll(/["\\]/g, '').replaceAll(/[^a-z0-9@.+_-]/g, '')}"`,
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
}

/**
 * Resolve username from email: lookup -> client fallback -> generate.
 * Returns null only if all strategies fail.
 */
export async function resolveUsername(email: string, clientUsername?: string): Promise<string | null> {
  return await getUsernameByEmail(email)
    || clientUsername
    || generateUsername(email)
    || null;
}
