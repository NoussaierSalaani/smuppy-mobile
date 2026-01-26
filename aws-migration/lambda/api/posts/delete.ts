/**
 * Delete Post Lambda Handler
 * Deletes a post and all associated data (likes, comments, saves)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('posts-delete');

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

    // Check if post exists and user owns it
    const postResult = await db.query(
      'SELECT id, author_id FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = postResult.rows[0];

    // Check ownership
    if (post.author_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this post' }),
      };
    }

    // Delete post and all associated data in transaction
    // CASCADE will handle likes, comments, and saved_posts due to FK constraints
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Delete the post (CASCADE handles related data)
      await client.query('DELETE FROM posts WHERE id = $1', [postId]);

      // Update user's post count
      await client.query(
        'UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = $1',
        [profileId]
      );

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post deleted successfully',
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    log.error('Error deleting post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
