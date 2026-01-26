/**
 * Get Profile Following Lambda Handler
 * Returns list of users a profile is following with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('profiles-following');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(profileId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid profile ID format' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getPool();

    // Check if profile exists
    const profileResult = await db.query(
      'SELECT id, username FROM profiles WHERE id = $1',
      [profileId]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Profile not found' }),
      };
    }

    // Build query - get following (people this profile follows)
    let query = `
      SELECT
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.bio,
        p.is_verified,
        p.account_type,
        f.created_at as followed_at
      FROM follows f
      JOIN profiles p ON f.following_id = p.id
      WHERE f.follower_id = $1
    `;

    const params: any[] = [profileId];
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

    // Format response
    const formattedFollowing = following.map(user => ({
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      isVerified: user.is_verified || false,
      accountType: user.account_type,
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
        totalCount: result.rowCount,
      }),
    };
  } catch (error: any) {
    log.error('Error getting following', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
