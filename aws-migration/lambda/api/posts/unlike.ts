/**
 * Unlike Post Lambda Handler
 * Removes a like from a post and updates the likes count
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('posts-unlike', async (event, { headers, log }) => {
  const userId = requireAuth(event, headers);
  if (isErrorResponse(userId)) return userId;

  const rateLimitResponse = await requireRateLimit({ prefix: 'posts-unlike', identifier: userId, maxRequests: 30 }, headers);
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
  // CRITICAL: Use dedicated client for transaction isolation with connection pooling
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Delete like (DB trigger auto-decrements posts.likes_count)
    await client.query(
      'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
      [profileId, postId]
    );

    // Read updated count (trigger has already fired)
    const updatedPost = await client.query(
      'SELECT likes_count FROM posts WHERE id = $1',
      [postId]
    );

    await client.query('COMMIT');

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
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
