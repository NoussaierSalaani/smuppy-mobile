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
    const currentUserId = event.requestContext.authorizer?.claims?.sub;

    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    // SECURITY: Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid post ID format' }),
      };
    }

    // Use reader pool for read operations
    const db = await getReaderPool();

    // SECURITY: Include author's privacy setting in query
    const result = await db.query(
      `SELECT
        p.*,
        pr.is_private as author_is_private,
        pr.cognito_sub as author_cognito_sub,
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

    // SECURITY: Check visibility for private profiles
    if (post.author_is_private) {
      // If author is private, check if current user can view
      const isAuthor = currentUserId && currentUserId === post.author_cognito_sub;

      if (!isAuthor) {
        // Check if current user follows the author
        let isFollowing = false;
        if (currentUserId) {
          const followCheck = await db.query(
            `SELECT 1 FROM follows f
             JOIN profiles p ON f.follower_id = p.id
             WHERE p.cognito_sub = $1 AND f.following_id = $2 AND f.status = 'accepted'
             LIMIT 1`,
            [currentUserId, post.author_id]
          );
          isFollowing = followCheck.rows.length > 0;
        }

        if (!isFollowing) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'This post is from a private account' }),
          };
        }
      }
    }

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
