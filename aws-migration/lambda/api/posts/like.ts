/**
 * Like/Unlike Post Lambda Handler (Toggle)
 * POST: toggles like state for the current user
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { validateUUIDParam, isErrorResponse } from '../utils/validators';
import { sendPushToUser } from '../services/push-notification';
import { isBidirectionallyBlocked } from '../utils/block-filter';
import { RATE_WINDOW_1_MIN, RATE_WINDOW_1_DAY } from '../utils/constants';

export const handler = withAuthHandler('posts-like', async (event, { headers, log, profileId, db }) => {
  const rateLimitResponse = await requireRateLimit({
    prefix: 'post-like',
    identifier: profileId,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 30,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  // Daily like limit: 500/day to prevent mass-like automation
  const dailyRateLimitResponse = await requireRateLimit({
    prefix: 'like-daily',
    identifier: profileId,
    windowSeconds: RATE_WINDOW_1_DAY,
    maxRequests: 500,
  }, headers);
  if (dailyRateLimitResponse) return dailyRateLimitResponse;

  // Get post ID from path
  const postId = validateUUIDParam(event, headers, 'id', 'Post');
  if (isErrorResponse(postId)) return postId;

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
  if (await isBidirectionallyBlocked(db, profileId, postResult.rows[0].author_id)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ message: 'Action not allowed' }),
    };
  }

  // Fetch liker name for notification
  const nameResult = await db.query('SELECT full_name FROM profiles WHERE id = $1', [profileId]);
  const likerName = nameResult.rows[0]?.full_name || 'Someone';

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
      }, profileId).catch(error_ => log.error('Push notification failed', error_));
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
  } catch (error_: unknown) {
    await client.query('ROLLBACK');
    throw error_;
  } finally {
    client.release();
  }
});
