/**
 * Account status middleware.
 * Verifies the authenticated user's profile exists and returns basic profile data.
 *
 * NOTE: moderation_status column is not yet deployed to the database.
 * When the moderation system is ready, re-add moderation checks here.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';

interface AccountStatusResult {
  profileId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  accountType: string;
  moderationStatus: string;
}

/**
 * Check if the user's account exists and return profile data.
 *
 * @param cognitoSub - The Cognito sub from JWT
 * @param headers - CORS headers for error responses
 * @returns The profile row if found, or an APIGatewayProxyResult error
 */
export async function requireActiveAccount(
  cognitoSub: string,
  headers: Record<string, string>,
): Promise<AccountStatusResult | APIGatewayProxyResult> {
  const db = await getReaderPool();

  const result = await db.query(
    `SELECT id, username, full_name, avatar_url, is_verified, account_type
     FROM profiles
     WHERE cognito_sub = $1`,
    [cognitoSub],
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'User profile not found' }),
    };
  }

  const profile = result.rows[0];

  return {
    profileId: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    isVerified: profile.is_verified,
    accountType: profile.account_type || 'personal',
    moderationStatus: 'active',
  };
}

/**
 * Type guard: returns true if the result is an error response.
 */
export function isAccountError(
  value: AccountStatusResult | APIGatewayProxyResult,
): value is APIGatewayProxyResult {
  return 'statusCode' in value;
}
