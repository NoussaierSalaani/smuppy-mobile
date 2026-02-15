/**
 * Unsave Post Lambda Handler
 * Removes a post from user's saved/bookmarks
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';

const log = createLogger('posts-unsave');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const { allowed } = await checkRateLimit({ prefix: 'posts-unsave', identifier: userId, maxRequests: 30 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests' }) };
    }

    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
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

    // Delete the saved post
    const result = await db.query(
      'DELETE FROM saved_posts WHERE user_id = $1 AND post_id = $2 RETURNING id',
      [profileId, postId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: result.rows.length > 0 ? 'Post unsaved successfully' : 'Post was not saved',
        saved: false,
      }),
    };
  } catch (error: unknown) {
    log.error('Error unsaving post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
