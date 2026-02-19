/**
 * Save Post Lambda Handler
 * Saves/bookmarks a post for the user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';

const log = createLogger('posts-save');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    // Rate limit: 30 save operations per minute
    const rateLimitResponse = await requireRateLimit({ prefix: 'post-save', identifier: userId as string, maxRequests: 30, windowSeconds: 60 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Get user's profile ID
    const profileId = await resolveProfileId(db, userId);

    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

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

    // Idempotent save — ON CONFLICT prevents race condition on double-tap
    const saveResult = await db.query(
      `INSERT INTO saved_posts (user_id, post_id) VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING
       RETURNING id`,
      [profileId, postId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: saveResult.rows.length > 0 ? 'Post saved successfully' : 'Post already saved',
        saved: true,
      }),
    };
  } catch (error: unknown) {
    log.error('Error saving post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
