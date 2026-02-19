/**
 * Like/Unlike Post Lambda Handler (Toggle)
 * POST: toggles like state for the current user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { sendPushToUser } from '../services/push-notification';
import { RATE_WINDOW_1_MIN, RATE_WINDOW_1_DAY } from '../utils/constants';

const log = createLogger('posts-like');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // Get user ID from Cognito authorizer
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const rateLimitResponse = await requireRateLimit({
      prefix: 'post-like',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Daily like limit: 500/day to prevent mass-like automation
    const dailyRateLimitResponse = await requireRateLimit({
      prefix: 'like-daily',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_DAY,
      maxRequests: 500,
    }, headers);
    if (dailyRateLimitResponse) return dailyRateLimitResponse;

    // Get post ID from path
    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for compatibility)
    const userResult = await db.query(
      'SELECT id, username, full_name FROM profiles WHERE cognito_sub = $1',
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

    // Bidirectional block check: prevent liking posts from blocked/blocking users
    const blockCheck = await db.query(
      `SELECT 1 FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [profileId, postResult.rows[0].author_id]
    );
    if (blockCheck.rows.length > 0) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Action not allowed' }),
      };
    }

    // Toggle like in transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Check if already liked INSIDE transaction to prevent race condition
      const existingLike = await client.query(
        'SELECT id FROM likes WHERE user_id = $1 AND post_id = $2',
        [profileId, postId]
      );

      const post = postResult.rows[0];
      const likerName = userResult.rows[0].full_name || 'Someone';
      const alreadyLiked = existingLike.rows.length > 0;

      if (alreadyLiked) {
        // Unlike: remove like (DB trigger auto-decrements posts.likes_count)
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
            liked: false,
            likesCount: updatedPost.rows[0].likes_count,
          }),
        };
      }

      // Like: insert (DB trigger auto-increments posts.likes_count)
      await client.query(
        'INSERT INTO likes (user_id, post_id) VALUES ($1, $2)',
        [profileId, postId]
      );

      // Read updated count (trigger has already fired)
      const updatedPost = await client.query(
        'SELECT likes_count FROM posts WHERE id = $1',
        [postId]
      );

      // Idempotent notification: ON CONFLICT prevents duplicates from retries or toggle cycling
      if (post.author_id !== profileId) {
        const notifData = JSON.stringify({ postId, likerId: profileId });
        const dailyBucket = Math.floor(Date.now() / 86400000);
        const idempotencyKey = `like:${profileId}:${postId}:${dailyBucket}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
           VALUES ($1, 'like', 'New Like', $2, $3, $4)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
          [post.author_id, `${likerName} liked your post`, notifData, idempotencyKey]
        );
      }

      await client.query('COMMIT');

      // Send push notification to post author (non-blocking)
      if (post.author_id !== profileId) {
        sendPushToUser(db, post.author_id, {
          title: 'New Like',
          body: `${likerName} liked your post`,
          data: { type: 'like', postId },
        }, profileId).catch(err => log.error('Push notification failed', err));
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          liked: true,
          likesCount: updatedPost.rows[0].likes_count,
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error liking post', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
