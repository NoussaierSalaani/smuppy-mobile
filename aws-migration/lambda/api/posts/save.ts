/**
 * Save Post Lambda Handler
 * Saves/bookmarks a post for the user
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

    // Check if post exists
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

    // Check if already saved
    const existingSave = await db.query(
      'SELECT id FROM saved_posts WHERE user_id = $1 AND post_id = $2',
      [profileId, postId]
    );

    if (existingSave.rows.length > 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Post already saved',
          saved: true,
        }),
      };
    }

    // Save the post
    await db.query(
      'INSERT INTO saved_posts (user_id, post_id) VALUES ($1, $2)',
      [profileId, postId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Post saved successfully',
        saved: true,
      }),
    };
  } catch (error: any) {
    console.error('Error saving post:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
