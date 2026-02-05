/**
 * Get Profile Followers Lambda Handler
 * Returns list of users following a profile with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('profiles-followers');

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
    if (!isValidUUID(profileId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid profile ID format' }),
      };
    }

    // Pagination params
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20'), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getReaderPool();

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

    // Build query - get followers (people who follow this profile)
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
      JOIN profiles p ON f.follower_id = p.id
      WHERE f.following_id = $1
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
    const followers = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Format response
    const formattedFollowers = followers.map((follower: Record<string, unknown>) => ({
      id: follower.id,
      username: follower.username,
      fullName: follower.full_name,
      avatarUrl: follower.avatar_url,
      bio: follower.bio,
      isVerified: follower.is_verified || false,
      accountType: follower.account_type,
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
        totalCount: result.rowCount,
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
