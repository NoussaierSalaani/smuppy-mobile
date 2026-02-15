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

    // Get offset for pagination (to get fresh results each time)
    const offset = parseInt(event.queryStringParameters?.offset || '0');

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
        params = [limit, offset];
      } else {
        // Authenticated: exclude users already in FanFeed relationship (following or followed by)
        // Use NOT EXISTS instead of NOT IN for better performance
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
          WHERE p.id != $1
            AND p.is_private = false
            AND p.onboarding_completed = true
            -- Exclude people I follow (NOT EXISTS is faster than NOT IN)
            AND NOT EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = $1 AND f.following_id = p.id AND f.status = 'accepted'
            )
            -- Exclude people who follow me
            AND NOT EXISTS (
              SELECT 1 FROM follows f
              WHERE f.following_id = $1 AND f.follower_id = p.id AND f.status = 'accepted'
            )
            -- Exclude users the current user has blocked
            AND NOT EXISTS (
              SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = p.id
            )
            AND p.moderation_status NOT IN ('banned', 'shadow_banned')
          ORDER BY
            CASE WHEN p.is_verified THEN 0 ELSE 1 END,
            CASE WHEN p.account_type = 'pro_creator' THEN 0
                 WHEN p.account_type = 'pro_business' THEN 1
                 ELSE 2 END,
            p.fan_count DESC,
            p.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        params = [currentUserId, limit, offset];
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
      params = [limit, offset];
    }

    const result = await db.query(query, params);

    const profiles = result.rows.map((profile: Record<string, unknown>) => ({
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
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        profiles,
        total: profiles.length,
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
