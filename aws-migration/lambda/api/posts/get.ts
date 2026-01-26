/**
 * Get Single Post Lambda Handler
 * Retrieves a single post by ID with author data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('posts-get');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const postId = event.pathParameters?.id;

    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    // Use reader pool for read operations
    const db = await getReaderPool();

    const result = await db.query(
      `SELECT
        p.*,
        json_build_object(
          'id', pr.id,
          'username', pr.username,
          'full_name', pr.full_name,
          'avatar_url', pr.avatar_url,
          'is_verified', pr.is_verified,
          'account_type', pr.account_type
        ) as author
      FROM posts p
      LEFT JOIN profiles pr ON p.author_id = pr.id
      WHERE p.id = $1`,
      [postId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = result.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: post.id,
        authorId: post.author_id,
        content: post.content,
        mediaUrls: post.media_urls || [],
        mediaType: post.media_type,
        likesCount: post.likes_count || 0,
        commentsCount: post.comments_count || 0,
        createdAt: post.created_at,
        author: post.author,
      }),
    };
  } catch (error: any) {
    log.error('Error getting post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
