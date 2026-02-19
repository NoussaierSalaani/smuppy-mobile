/**
 * Like/Unlike Peak Lambda Handler (Toggle)
 * POST: toggles like state for the current user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { sendPushToUser } from '../services/push-notification';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('peaks-like');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const rateLimitResponse = await requireRateLimit({
      prefix: 'peak-like',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 30,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const peakId = validateUUIDParam(event, headers, 'id', 'Peak');
    if (isErrorResponse(peakId)) return peakId;

    const db = await getPool();

    // Get user's profile
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

    const profile = userResult.rows[0];

    // Check if peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Peak not found' }),
      };
    }

    const peak = peakResult.rows[0];

    // Bidirectional block check: prevent liking peaks from blocked/blocking users
    const blockCheck = await db.query(
      `SELECT 1 FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [profile.id, peak.author_id]
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
        'SELECT 1 FROM peak_likes WHERE user_id = $1 AND peak_id = $2 LIMIT 1',
        [profile.id, peakId]
      );

      const alreadyLiked = existingLike.rows.length > 0;

      if (alreadyLiked) {
        // Unlike: remove like + decrement count
        await client.query(
          'DELETE FROM peak_likes WHERE user_id = $1 AND peak_id = $2',
          [profile.id, peakId]
        );
        await client.query(
          'UPDATE peaks SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
          [peakId]
        );
        await client.query('COMMIT');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            liked: false,
          }),
        };
      }

      // Like: insert + increment count
      await client.query(
        'INSERT INTO peak_likes (user_id, peak_id) VALUES ($1, $2)',
        [profile.id, peakId]
      );
      await client.query(
        'UPDATE peaks SET likes_count = likes_count + 1 WHERE id = $1',
        [peakId]
      );

      // Idempotent notification: ON CONFLICT prevents duplicates from retries or toggle cycling
      if (peak.author_id !== profile.id) {
        const notifData = JSON.stringify({ peakId, likerId: profile.id });
        const dailyBucket = Math.floor(Date.now() / 86400000);
        const idempotencyKey = `peak_like:${profile.id}:${peakId}:${dailyBucket}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
           VALUES ($1, 'peak_like', 'New Like', $2, $3, $4)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
          [peak.author_id, `${profile.full_name || 'Someone'} liked your peak`, notifData, idempotencyKey]
        );
      }

      await client.query('COMMIT');

      // Send push notification to peak author (non-blocking)
      if (peak.author_id !== profile.id) {
        sendPushToUser(db, peak.author_id, {
          title: 'New Like',
          body: `${profile.full_name || 'Someone'} liked your peak`,
          data: { type: 'peak_like', peakId },
        }, profile.id).catch(err => log.error('Push notification failed', err));
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          liked: true,
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error liking peak', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
