/**
 * Get Suggested Profiles Lambda Handler
 * Returns profiles that the current user might want to follow
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('profiles-suggested');

// Sentinel UUID for the system moderation account — must never appear in user-facing results
const SYSTEM_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';

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

    const db = await getReaderPool();

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
            p.fan_count,
            p.following_count,
            p.post_count
          FROM profiles p
          WHERE p.is_private = false
            AND (p.onboarding_completed = true OR p.is_bot = true)
            AND p.id != $3
          ORDER BY
            CASE WHEN p.is_verified THEN 0 ELSE 1 END,
            p.fan_count DESC,
            p.created_at DESC
          LIMIT $1 OFFSET $2
        `;
        params = [limit, offset, SYSTEM_ACCOUNT_ID];
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
            p.fan_count,
            p.following_count,
            p.post_count
          FROM profiles p
          WHERE p.id != $1
            AND p.id != $4
            AND p.is_private = false
            AND (p.onboarding_completed = true OR p.is_bot = true)
            -- Exclude people I already follow
            AND NOT EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = $1 AND f.following_id = p.id AND f.status = 'accepted'
            )
          ORDER BY
            CASE WHEN p.is_verified THEN 0 ELSE 1 END,
            CASE WHEN p.account_type = 'pro_creator' THEN 0
                 WHEN p.account_type = 'pro_business' THEN 1
                 ELSE 2 END,
            p.fan_count DESC,
            p.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        params = [currentUserId, limit, offset, SYSTEM_ACCOUNT_ID];
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
          p.fan_count,
          p.following_count,
          p.post_count
        FROM profiles p
        WHERE p.is_private = false
          AND (p.onboarding_completed = true OR p.is_bot = true)
          AND p.id != $3
        ORDER BY
          CASE WHEN p.is_verified THEN 0 ELSE 1 END,
          p.fan_count DESC,
          p.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset, SYSTEM_ACCOUNT_ID];
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
