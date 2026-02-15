/**
 * Search Profiles Lambda Handler
 * Full-text search for user profiles
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { extractCognitoSub } from '../utils/security';

const log = createLogger('profiles-search');

// Rate limit: 60 requests per minute per IP (generous for search)
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 60;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Rate limiting by IP address
    const clientIp = event.requestContext.identity?.sourceIp || 'unknown';
    const { allowed, retryAfter } = await checkRateLimit({
      prefix: 'profile-search',
      identifier: clientIp,
      windowSeconds: RATE_WINDOW_SECONDS,
      maxRequests: RATE_LIMIT,
    });

    if (!allowed) {
      log.warn('Rate limit exceeded for search', { clientIp });
      return {
        statusCode: 429,
        headers: { ...headers, 'Retry-After': String(retryAfter || RATE_WINDOW_SECONDS) },
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }
    const rawQuery = event.queryStringParameters?.search || event.queryStringParameters?.q || '';
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);

    // SECURITY: Escape ILIKE special characters to prevent pattern matching bypass
    const query = rawQuery.replace(/[%_\\]/g, '\\$&');

    // Exclude current user from search results
    const cognitoSub = extractCognitoSub(event);

    // Use reader pool for read-heavy search operations
    const db = await getPool();

    // Resolve current user ID to exclude from results
    let currentUserId: string | null = null;
    if (cognitoSub) {
      const userResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      currentUserId = userResult.rows[0]?.id || null;
    }

    let result;

    if (!query || query.length < 1) {
      // No query - return popular/recent profiles
      if (currentUserId) {
        result = await db.query(
          `SELECT
            id, username, full_name, display_name, avatar_url, bio,
            is_verified, is_private, account_type, business_name,
            fan_count as followers_count, following_count, post_count as posts_count
          FROM profiles
          WHERE is_private = false AND onboarding_completed = true AND id != $1
            AND moderation_status NOT IN ('banned', 'shadow_banned')
            AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = profiles.id)
          ORDER BY
            CASE WHEN is_verified THEN 0 ELSE 1 END,
            CASE WHEN account_type = 'pro_creator' THEN 0
                 WHEN account_type = 'pro_business' THEN 1
                 ELSE 2 END,
            fan_count DESC NULLS LAST,
            created_at DESC
          LIMIT $2`,
          [currentUserId, limit]
        );
      } else {
        result = await db.query(
          `SELECT
            id, username, full_name, display_name, avatar_url, bio,
            is_verified, is_private, account_type, business_name,
            fan_count as followers_count, following_count, post_count as posts_count
          FROM profiles
          WHERE is_private = false AND onboarding_completed = true
            AND moderation_status NOT IN ('banned', 'shadow_banned')
          ORDER BY
            CASE WHEN is_verified THEN 0 ELSE 1 END,
            CASE WHEN account_type = 'pro_creator' THEN 0
                 WHEN account_type = 'pro_business' THEN 1
                 ELSE 2 END,
            fan_count DESC NULLS LAST,
            created_at DESC
          LIMIT $1`,
          [limit]
        );
      }
    } else {
      // Search using ILIKE for partial matching (also match display_name)
      if (currentUserId) {
        result = await db.query(
          `SELECT
            id, username, full_name, display_name, avatar_url, bio,
            is_verified, is_private, account_type, business_name,
            fan_count as followers_count, following_count, post_count as posts_count
          FROM profiles
          WHERE (username ILIKE $1 OR full_name ILIKE $1 OR display_name ILIKE $1)
            AND is_private = false AND onboarding_completed = true
            AND moderation_status NOT IN ('banned', 'shadow_banned')
            AND id != $5
            AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $5 AND blocked_id = profiles.id)
          ORDER BY
            CASE WHEN username = $2 THEN 0
                 WHEN username ILIKE $3 THEN 1
                 ELSE 2
            END,
            fan_count DESC NULLS LAST
          LIMIT $4`,
          [`%${query}%`, query, `${query}%`, limit, currentUserId]
        );
      } else {
        result = await db.query(
          `SELECT
            id, username, full_name, display_name, avatar_url, bio,
            is_verified, is_private, account_type, business_name,
            fan_count as followers_count, following_count, post_count as posts_count
          FROM profiles
          WHERE (username ILIKE $1 OR full_name ILIKE $1 OR display_name ILIKE $1)
            AND is_private = false AND onboarding_completed = true
            AND moderation_status NOT IN ('banned', 'shadow_banned')
          ORDER BY
            CASE WHEN username = $2 THEN 0
                 WHEN username ILIKE $3 THEN 1
                 ELSE 2
            END,
            fan_count DESC NULLS LAST
          LIMIT $4`,
          [`%${query}%`, query, `${query}%`, limit]
        );
      }
    }

    const profiles = result.rows.map((profile: Record<string, unknown>) => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
      isVerified: profile.is_verified || false,
      isPrivate: profile.is_private || false,
      accountType: profile.account_type || 'personal',
      businessName: profile.business_name || null,
      followersCount: profile.followers_count || 0,
      followingCount: profile.following_count || 0,
      postsCount: profile.posts_count || 0,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(profiles),
    };
  } catch (error: unknown) {
    log.error('Error searching profiles', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
