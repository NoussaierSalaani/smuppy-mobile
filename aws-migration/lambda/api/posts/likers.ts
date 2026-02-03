/**
 * Post Likers Lambda Handler
 * Returns paginated list of users who liked a specific post
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';

const log = createLogger('posts-likers');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Auth check
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    // Validate post ID
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    // Parse pagination params
    const { limit: limitStr, cursor } = event.queryStringParameters || {};
    const limit = Math.min(Math.max(parseInt(limitStr || '20', 10) || 20, 1), 50);

    const db = await getReaderPool();

    // Verify post exists
    const postResult = await db.query(
      'SELECT id FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    // Build query for likers with cursor-based pagination
    const params: (string | number | Date)[] = [postId, limit + 1];
    let cursorClause = '';

    if (cursor) {
      cursorClause = 'AND l.created_at < $3';
      params.push(new Date(parseInt(cursor, 10)));
    }

    const likersResult = await db.query(
      `SELECT
        p.id,
        p.username,
        p.full_name,
        p.avatar_url,
        p.is_verified,
        p.account_type,
        l.created_at as liked_at
      FROM likes l
      INNER JOIN profiles p ON p.id = l.user_id
      WHERE l.post_id = $1 ${cursorClause}
      ORDER BY l.created_at DESC
      LIMIT $2`,
      params
    );

    const hasMore = likersResult.rows.length > limit;
    const likers = hasMore ? likersResult.rows.slice(0, limit) : likersResult.rows;

    const nextCursor = hasMore
      ? new Date(likers[likers.length - 1].liked_at).getTime().toString()
      : null;

    // Map to camelCase response
    const data = likers.map((row: { id: string; username: string; full_name: string; avatar_url: string | null; is_verified: boolean; account_type: string; liked_at: string }) => ({
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      isVerified: row.is_verified,
      accountType: row.account_type,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error fetching post likers', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
