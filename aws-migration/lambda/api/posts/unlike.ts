/**
 * Unlike Post Lambda Handler
 * Removes a like from a post and updates the likes count
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

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

    // Check if like exists
    const existingLike = await db.query(
      'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
      [profileId, postId]
    );

    if (existingLike.rows.length === 0) {
      // Get current likes count
      const postResult = await db.query(
        'SELECT likes_count FROM posts WHERE id = $1',
        [postId]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post was not liked',
          liked: false,
          likesCount: postResult.rows[0]?.likes_count || 0,
        }),
      };
    }

    // Remove like and update count in transaction
    await db.query('BEGIN');

    try {
      // Delete like
      await db.query(
        'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
        [profileId, postId]
      );

      // Update likes count (ensure it doesn't go below 0)
      const updatedPost = await db.query(
        'UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1 RETURNING likes_count',
        [postId]
      );

      await db.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post unliked successfully',
          liked: false,
          likesCount: updatedPost.rows[0]?.likes_count || 0,
        }),
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error: any) {
    console.error('Error unliking post:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
