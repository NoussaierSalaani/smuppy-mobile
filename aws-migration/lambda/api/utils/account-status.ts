/**
 * Account status middleware for moderation enforcement.
 * Checks if the authenticated user's account is active, suspended, or banned.
 *
 * - active / shadow_banned → allowed (shadow ban is invisible to the user)
 * - suspended → 403 with reason + suspended_until
 * - banned → 403 permanent
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';

interface AccountStatusResult {
  profileId: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  accountType: string;
  businessName: string | null;
  moderationStatus: string;
}

/**
 * Check if the user's account is active and allowed to perform mutations.
 *
 * @param cognitoSub - The Cognito sub from JWT
 * @param headers - CORS headers for error responses
 * @returns The profile row if active, or an APIGatewayProxyResult error
 */
export async function requireActiveAccount(
  cognitoSub: string,
  headers: Record<string, string>,
): Promise<AccountStatusResult | APIGatewayProxyResult> {
  // Use writer pool for suspension checks — needs read-after-write consistency
  const db = await getPool();

  const result = await db.query(
    `SELECT id, username, full_name, avatar_url, is_verified, account_type, business_name, moderation_status, suspended_until, ban_reason
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
  const status: string = profile.moderation_status || 'active';

  // Suspended: check if suspension has expired
  if (status === 'suspended') {
    const suspendedUntil = profile.suspended_until
      ? new Date(profile.suspended_until)
      : null;

    // If suspension has expired, auto-reactivate
    if (suspendedUntil && suspendedUntil < new Date()) {
      await db.query(
        `UPDATE profiles
         SET moderation_status = 'active', suspended_until = NULL
         WHERE id = $1`,
        [profile.id],
      );
      // Allow the request to proceed
    } else {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          message: 'Your account is temporarily suspended.',
          moderationStatus: 'suspended',
          reason: profile.ban_reason || 'Community guidelines violation',
          suspendedUntil: profile.suspended_until,
        }),
      };
    }
  }

  // Banned: permanent block
  if (status === 'banned') {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        message: 'Your account has been permanently banned.',
        moderationStatus: 'banned',
        reason: profile.ban_reason || 'Repeated community guidelines violations',
      }),
    };
  }

  // active or shadow_banned → proceed normally
  return {
    profileId: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    isVerified: profile.is_verified,
    accountType: profile.account_type || 'personal',
    businessName: profile.business_name || null,
    moderationStatus: status,
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
