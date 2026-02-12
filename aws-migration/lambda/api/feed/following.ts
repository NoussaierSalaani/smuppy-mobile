/**
 * Get Following Feed Lambda Handler
 * Retrieves posts from users the current user follows
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('feed-following');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;

    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10), 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getReaderPool();

    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: [] }),
      };
    }

    const userId = userResult.rows[0].id;

    // Build cursor-based query (consistent with feed/get.ts)
    let cursorCondition = '';
    const queryParams: (string | number | Date)[] = [userId];

    if (cursor) {
      cursorCondition = `AND p.created_at < $2`;
      queryParams.push(new Date(cursor));
    }

    queryParams.push(limit + 1); // Fetch one extra to check hasMore

    const result = await db.query(
      `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.tags,
              p.likes_count, p.comments_count, p.views_count, p.created_at,
              pr.id as profile_id, pr.username, pr.full_name, pr.avatar_url, pr.is_verified, pr.account_type,
              EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) as is_liked,
              EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $1) as is_saved
       FROM posts p
       JOIN profiles pr ON p.author_id = pr.id
       WHERE p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted')
         ${cursorCondition}
       ORDER BY p.created_at DESC
       LIMIT $${queryParams.length}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const data = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      authorId: row.author_id,
      content: row.content,
      mediaUrls: row.media_urls || [],
      mediaType: row.media_type,
      tags: row.tags || [],
      likesCount: row.likes_count || 0,
      commentsCount: row.comments_count || 0,
      viewsCount: row.views_count || 0,
      createdAt: row.created_at,
      isLiked: row.is_liked,
      isSaved: row.is_saved,
      author: {
        id: row.profile_id,
        username: row.username,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        isVerified: row.is_verified,
        accountType: row.account_type,
      },
    }));

    const nextCursor = hasMore && rows.length > 0
      ? (rows[rows.length - 1] as Record<string, unknown>).created_at
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data, nextCursor, hasMore }),
    };
  } catch (error: unknown) {
    log.error('Error getting following feed', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
