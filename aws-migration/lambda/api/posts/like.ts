/**
 * Like Post Lambda Handler
 * Adds a like to a post and updates the likes count
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Get user ID from Cognito authorizer
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Get post ID from path
    const postId = event.pathParameters?.id;
    if (!postId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Post ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(postId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid post ID format' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Check if post exists
    const postResult = await db.query(
      'SELECT id, author_id, likes_count FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    // Check if already liked
    const existingLike = await db.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
      [profileId, postId]
    );

    if (existingLike.rows.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post already liked',
          liked: true,
          likesCount: postResult.rows[0].likes_count,
        }),
      };
    }

    // Insert like and update count in transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Insert like
      await client.query(
        'INSERT INTO likes (user_id, post_id) VALUES ($1, $2)',
        [profileId, postId]
      );

      // Update likes count
      const updatedPost = await client.query(
        'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1 RETURNING likes_count',
        [postId]
      );

      // Create notification for post author (if not self-like)
      const post = postResult.rows[0];
      if (post.author_id !== profileId) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'like', 'New Like', 'Someone liked your post', $2)`,
          [post.author_id, JSON.stringify({ postId, likerId: profileId })]
        );
      }

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post liked successfully',
          liked: true,
          likesCount: updatedPost.rows[0].likes_count,
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error liking post:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
