/**
 * Get Profile Following Lambda Handler
 * Returns list of users a profile is following with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('profiles-following');

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
    const rateLimit = await checkRateLimit({
      prefix: 'profiles-following',
      identifier: rateLimitId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
      failOpen: true,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
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
      let isAuthorized = false;

      if (cognitoSub) {
        const requesterResult = await db.query(
          'SELECT id FROM profiles WHERE cognito_sub = $1',
          [cognitoSub]
        );
        if (requesterResult.rows.length > 0) {
          const requesterId = requesterResult.rows[0].id;
          // Owner can always see their own following list
          if (requesterId === profileId) {
            isAuthorized = true;
          } else {
            // Check if requester is an accepted follower
            const followResult = await db.query(
              `SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted') as is_follower`,
              [requesterId, profileId]
            );
            isAuthorized = followResult.rows[0].is_follower;
          }
        }
      }

      if (!isAuthorized) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'This account is private' }),
        };
      }
    }

    // Build query - get following with total count via window function (saves a separate COUNT query)
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
      JOIN profiles p ON f.following_id = p.id
      WHERE f.follower_id = $1 AND f.status = 'accepted'
    `;

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    // Cursor pagination
    if (cursor) {
      query += ` AND f.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor)));
      paramIndex++;
    }

    query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    // Check if there are more results
    const hasMore = result.rows.length > limit;
    const following = hasMore ? result.rows.slice(0, -1) : result.rows;
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count as string, 10) : 0;

    // Format response
    const formattedFollowing = following.map((user: Record<string, unknown>) => ({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      isVerified: user.is_verified || false,
      accountType: user.account_type,
      businessName: user.business_name,
      displayName: user.display_name || null,
      coverUrl: user.cover_url,
      isPrivate: user.is_private || false,
      followersCount: user.fan_count || 0,
      followingCount: user.following_count || 0,
      postsCount: user.post_count || 0,
      followedAt: user.followed_at,
    }));

    // Generate next cursor
    const nextCursor = hasMore && following.length > 0
      ? new Date(following[following.length - 1].followed_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        following: formattedFollowing,
        cursor: nextCursor,
        hasMore,
        totalCount,
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting following', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
