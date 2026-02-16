/**
 * Get Suggested Profiles Lambda Handler
 * Returns profiles that the current user might want to follow
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('profiles-suggested');

// Rate limit: 30 requests per minute per IP
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // Rate limiting by IP address
    const clientIp = event.requestContext.identity?.sourceIp || 'unknown';
    const { allowed, retryAfter } = await checkRateLimit({
      prefix: 'profile-suggested',
      identifier: clientIp,
      windowSeconds: RATE_WINDOW_SECONDS,
      maxRequests: RATE_LIMIT,
    });

    if (!allowed) {
      log.warn('Rate limit exceeded for suggested', { clientIp });
      return {
        statusCode: 429,
        headers: { ...headers, 'Retry-After': String(retryAfter || RATE_WINDOW_SECONDS) },
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }
    // Get Cognito sub from authorizer
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    // Get limit from query params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '10'), 50);

    const db = await getPool();

    // Get suggested profiles:
    // 1. Users that the current user is NOT following
    // 2. Ordered by popularity (fan_count) and recency
    // 3. Exclude the current user
    // 4. Prioritize verified accounts and pro creators

    let query: string;
    let params: SqlParam[];

    // Ranked feeds use offset-encoded cursor (keyset not possible — fan_count changes)
    // Cap offset to prevent deep scanning
    const MAX_OFFSET = 500;
    const cursor = event.queryStringParameters?.cursor;
    const offset = cursor ? Math.min(parseInt(cursor, 10) || 0, MAX_OFFSET) : 0;
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

    if (cognitoSub) {
      // First, get the current user's profile ID from their cognito_sub
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );

      const currentUserId = userResult.rows[0]?.id;

      if (!currentUserId) {
        // User has no profile yet - return popular profiles
        query = `
          SELECT
            p.id,
            p.username,
            p.full_name,
            p.display_name,
            p.avatar_url,
            p.cover_url,
            p.bio,
            p.is_verified,
            p.is_private,
            p.account_type,
            p.business_name,
            p.fan_count,
            p.following_count,
            p.post_count
          FROM profiles p
          WHERE p.is_private = false AND p.onboarding_completed = true
            AND p.moderation_status NOT IN ('banned', 'shadow_banned')
          ORDER BY
            CASE WHEN p.is_verified THEN 0 ELSE 1 END,
            p.fan_count DESC,
            p.created_at DESC
          LIMIT $1 OFFSET $2
        `;
        params = [fetchLimit, offset];
      } else {
        // Authenticated: CTE pre-computes excluded IDs once instead of 3x NOT EXISTS per candidate row
        query = `
          WITH excluded_ids AS (
            SELECT following_id AS id FROM follows WHERE follower_id = $1 AND status = 'accepted'
            UNION
            SELECT blocked_id AS id FROM blocked_users WHERE blocker_id = $1
            UNION
            SELECT blocker_id AS id FROM blocked_users WHERE blocked_id = $1
          ),
          my_fans AS (
            SELECT follower_id AS id FROM follows WHERE following_id = $1 AND status = 'accepted'
          )
          SELECT
            p.id,
            p.username,
            p.full_name,
            p.display_name,
            p.avatar_url,
            p.cover_url,
            p.bio,
            p.is_verified,
            p.is_private,
            p.account_type,
            p.business_name,
            p.fan_count,
            p.following_count,
            p.post_count,
            CASE WHEN mf.id IS NOT NULL THEN true ELSE false END AS is_followed_by
          FROM profiles p
          LEFT JOIN my_fans mf ON mf.id = p.id
          WHERE p.id != $1
            AND p.is_private = false
            AND p.onboarding_completed = true
            AND p.id NOT IN (SELECT id FROM excluded_ids)
            AND p.moderation_status NOT IN ('banned', 'shadow_banned')
          ORDER BY
            CASE WHEN mf.id IS NOT NULL THEN 0 ELSE 1 END,
            CASE WHEN p.is_verified THEN 0 ELSE 1 END,
            CASE WHEN p.account_type = 'pro_creator' THEN 0
                 WHEN p.account_type = 'pro_business' THEN 1
                 ELSE 2 END,
            p.fan_count DESC,
            p.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        params = [currentUserId, fetchLimit, offset];
      }
    } else {
      // Unauthenticated: just get popular profiles
      query = `
        SELECT
          p.id,
          p.username,
          p.full_name,
          p.display_name,
          p.avatar_url,
          p.cover_url,
          p.bio,
          p.is_verified,
          p.is_private,
          p.account_type,
          p.business_name,
          p.fan_count,
          p.following_count,
          p.post_count
        FROM profiles p
        WHERE p.is_private = false AND p.onboarding_completed = true
          AND p.moderation_status NOT IN ('banned', 'shadow_banned')
        ORDER by
          CASE WHEN p.is_verified THEN 0 ELSE 1 END,
          p.fan_count DESC,
          p.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [fetchLimit, offset];
    }

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const slicedRows = result.rows.slice(0, limit);
    const nextCursor = hasMore ? String(offset + limit) : null;

    const profiles = slicedRows.map((profile: Record<string, unknown>) => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url,
      coverUrl: profile.cover_url,
      bio: profile.bio,
      isVerified: profile.is_verified || false,
      isPrivate: profile.is_private || false,
      accountType: profile.account_type || 'personal',
      businessName: profile.business_name || null,
      followersCount: profile.fan_count || 0,
      followingCount: profile.following_count || 0,
      postsCount: profile.post_count || 0,
      isFollowing: false,
      isFollowedBy: profile.is_followed_by || false,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profiles,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting suggested profiles', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
