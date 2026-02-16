/**
 * Account status middleware for moderation enforcement and deletion reactivation.
 * Checks if the authenticated user's account is active, suspended, banned, or soft-deleted.
 *
 * - active / shadow_banned → allowed (shadow ban is invisible to the user)
 * - suspended → 403 with reason + suspended_until (auto-reactivate if expired)
 * - banned → 403 permanent
 * - is_deleted within 30-day grace → auto-reactivate (re-enable Cognito, clear is_deleted)
 * - is_deleted past 30 days → 410 Gone (account permanently deleted)
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getPool } from '../../shared/db';
import { createLogger } from './logger';

const log = createLogger('account-status');
const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const GRACE_PERIOD_DAYS = 30;

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
    `SELECT id, username, full_name, avatar_url, is_verified, account_type, business_name,
            moderation_status, suspended_until, ban_reason,
            is_deleted, deleted_at, cognito_sub
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

  // Soft-deleted: check if within 30-day grace period for reactivation
  if (profile.is_deleted) {
    const deletedAt = profile.deleted_at ? new Date(profile.deleted_at) : null;
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - GRACE_PERIOD_DAYS);

    if (deletedAt && deletedAt > graceCutoff) {
      // Within grace period — reactivate the account
      await db.query(
        `UPDATE profiles
         SET is_deleted = FALSE, deleted_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [profile.id],
      );

      // Re-enable Cognito user (was disabled during soft-delete)
      if (USER_POOL_ID && profile.cognito_sub) {
        try {
          await cognitoClient.send(new AdminEnableUserCommand({
            UserPoolId: USER_POOL_ID,
            Username: profile.cognito_sub,
          }));
        } catch (cognitoErr: unknown) {
          log.error('Failed to re-enable Cognito user during reactivation', cognitoErr);
        }
      }

      log.warn('Account reactivated within grace period', {
        profileId: profile.id.substring(0, 8) + '***',
      });
      // Continue — account is now active
    } else {
      // Past grace period — account is permanently deleted (or will be by cleanup job)
      return {
        statusCode: 410,
        headers,
        body: JSON.stringify({
          message: 'This account has been permanently deleted.',
        }),
      };
    }
  }

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
