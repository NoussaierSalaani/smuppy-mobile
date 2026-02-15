/**
 * Like/Unlike Post Lambda Handler (Toggle)
 * POST: toggles like state for the current user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { sendPushToUser } from '../services/push-notification';

const log = createLogger('posts-like');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Get user ID from Cognito authorizer
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const rateLimit = await checkRateLimit({
      prefix: 'post-like',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 30,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

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

      // Create notification for post author (if not self-like)
      // Dedup: 24h window to prevent like/unlike cycling notification spam
      if (post.author_id !== profileId) {
        const notifData = JSON.stringify({ postId, likerId: profileId });
        const existingNotif = await client.query(
          `SELECT 1 FROM notifications
           WHERE user_id = $1 AND type = 'like' AND data = $2::jsonb
             AND created_at > NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [post.author_id, notifData]
        );
        if (existingNotif.rows.length === 0) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'like', 'New Like', $2, $3)`,
            [post.author_id, `${likerName} liked your post`, notifData]
          );
        }
      }

      await client.query('COMMIT');

      // Send push notification to post author (non-blocking)
      if (post.author_id !== profileId) {
        sendPushToUser(db, post.author_id, {
          title: 'New Like',
          body: `${likerName} liked your post`,
          data: { type: 'like', postId },
        }).catch(err => log.error('Push notification failed', err));
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
