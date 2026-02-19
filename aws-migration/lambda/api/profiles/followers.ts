/**
 * Get Profile Followers Lambda Handler
 * Returns list of users following a profile with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { checkPrivacyAccess } from '../utils/auth';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('profiles-followers');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const profileId = event.pathParameters?.id;
    if (!profileId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Profile ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(profileId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid profile ID format' }),
      };
    }

    // Rate limit: anti-scraping — use IP for public endpoint
    const rateLimitId = event.requestContext.authorizer?.claims?.sub
      || event.requestContext.identity?.sourceIp || 'anonymous';
    const rateLimitResponse = await requireRateLimit({
      prefix: 'profiles-followers',
      identifier: rateLimitId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Pagination params
    const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getPool();

    // Check if profile exists
    const profileResult = await db.query(
      'SELECT id, username, is_private FROM profiles WHERE id = $1',
      [profileId]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    // Privacy check: if profile is private, only the owner or accepted followers can see the list
    if (profileResult.rows[0].is_private) {
      const cognitoSub = event.requestContext.authorizer?.claims?.sub;
      const hasAccess = await checkPrivacyAccess(db, profileId, cognitoSub);
      if (!hasAccess) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'This account is private' }),
        };
      }
    }

    // Build query - get followers with total count via window function (saves a separate COUNT query)
    let query = `
      SELECT
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.bio,
        p.is_verified,
        p.account_type,
        p.business_name,
        p.display_name,
        p.cover_url,
        p.is_private,
        p.fan_count,
        p.following_count,
        p.post_count,
        f.created_at as followed_at,
        COUNT(*) OVER() as total_count
      FROM follows f
      JOIN profiles p ON f.follower_id = p.id
      WHERE f.following_id = $1 AND f.status = 'accepted'
    `;

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    // Cursor pagination
    if (cursor) {
      query += ` AND f.created_at < $${paramIndex}`;
      params.push(new Date(Number.parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const followers = hasMore ? result.rows.slice(0, -1) : result.rows;
    const totalCount = result.rows.length > 0 ? Number.parseInt(result.rows[0].total_count as string, 10) : 0;

    // Format response
    const formattedFollowers = followers.map((follower: Record<string, unknown>) => ({
      id: follower.id,
      username: follower.username,
      fullName: follower.full_name,
      avatarUrl: follower.avatar_url,
      bio: follower.bio,
      isVerified: follower.is_verified || false,
      accountType: follower.account_type,
      businessName: follower.business_name,
      displayName: follower.display_name || null,
      coverUrl: follower.cover_url,
      isPrivate: follower.is_private || false,
      followersCount: follower.fan_count || 0,
      followingCount: follower.following_count || 0,
      postsCount: follower.post_count || 0,
      followedAt: follower.followed_at,
    }));

    // Generate next cursor
    const nextCursor = hasMore && followers.length > 0
      ? new Date(followers[followers.length - 1].followed_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        followers: formattedFollowers,
        cursor: nextCursor,
        hasMore,
        totalCount,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting followers', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
