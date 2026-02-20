/**
 * Authentication utilities for Lambda handlers
 *
 * IMPORTANT: `getUserFromEvent()` returns `cognito_sub` as both `id` and `sub`.
 * When querying the `profiles` table, always use `WHERE cognito_sub = $1` (not `WHERE id = $1`)
 * since `profiles.id` is a separate UUID. Use `resolveProfileId()` to get the DB profile ID.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import type { Pool, PoolClient } from 'pg';

interface AuthUser {
  /** Cognito sub (NOT profile.id — use resolveProfileId() for DB queries on profiles.id) */
  id: string;
  sub: string;
  email?: string;
  username?: string;
}

/**
 * Extract authenticated user from API Gateway event
 * Works with Cognito authorizer
 *
 * WARNING: `user.id` is the Cognito `sub`, NOT `profiles.id`.
 * To query by `profiles.id`, use: `SELECT id FROM profiles WHERE cognito_sub = $1`
 */
export function getUserFromEvent(event: APIGatewayProxyEvent): AuthUser | null {
  const claims = event.requestContext.authorizer?.claims;

  if (!claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] || claims.username,
  };
}

/**
 * Require authenticated user, throw error if not authenticated
 */
export function requireUser(event: APIGatewayProxyEvent): AuthUser {
  const user = getUserFromEvent(event);

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}

/**
 * Resolve a Cognito sub to a profiles.id.
 * Returns the profile UUID or null if not found.
 */
export async function resolveProfileId(
  db: Pool | PoolClient,
  cognitoSub: string
): Promise<string | null> {
  const result = await db.query(
    'SELECT id FROM profiles WHERE cognito_sub = $1',
    [cognitoSub]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Check if a requester has access to a private profile's data.
 * Returns true if the requester is the profile owner or an accepted follower.
 * Returns false if not authenticated or not authorized.
 *
 * Usage:
 * ```
 * if (profile.is_private) {
 *   const hasAccess = await checkPrivacyAccess(db, profileId, cognitoSub);
 *   if (!hasAccess) return { statusCode: 403, ... };
 * }
 * ```
 */
export async function checkPrivacyAccess(
  db: Pool | PoolClient,
  profileId: string,
  cognitoSub: string | undefined,
): Promise<boolean> {
  if (!cognitoSub) return false;

  const requesterId = await resolveProfileId(db, cognitoSub);
  if (!requesterId) return false;

  // Owner always has access to their own profile data
  if (requesterId === profileId) return true;

  // Check if requester is an accepted follower
  const followResult = await db.query(
    `SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted') as is_follower`,
    [requesterId, profileId]
  );
  return followResult.rows[0].is_follower;
}
