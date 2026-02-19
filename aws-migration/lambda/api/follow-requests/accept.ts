/**
 * Accept Follow Request Lambda Handler
 * Accepts a pending follow request and creates the follow relationship
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { sendPushToUser } from '../services/push-notification';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_30S } from '../utils/constants';

const log = createLogger('follow-requests-accept');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'follow-accept', identifier: userId, windowSeconds: RATE_WINDOW_30S, maxRequests: 10 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const requestId = event.pathParameters?.id;
    if (!requestId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Request ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(requestId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request ID format' }),
      };
    }

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

    // Get the follow request
    const requestResult = await db.query(
      'SELECT id, requester_id, target_id, status FROM follow_requests WHERE id = $1',
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Follow request not found' }),
      };
    }

    const request = requestResult.rows[0];

    // Verify user is the target of the request
    if (request.target_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to accept this request' }),
      };
    }

    // Check if already processed
    if (request.status !== 'pending') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Request already ${request.status}` }),
      };
    }

    // Accept the request in a transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // BUG-2026-02-14: Check bidirectional block INSIDE transaction to prevent TOCTOU race
      const blockCheck = await client.query(
        `SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)`,
        [profileId, request.requester_id]
      );
      if (blockCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Cannot accept this follow request' }),
        };
      }

      // Update request status
      await client.query(
        'UPDATE follow_requests SET status = $1, updated_at = NOW() WHERE id = $2',
        ['accepted', requestId]
      );

      // Create the follow relationship with accepted status
      // Note: fan_count and following_count are updated automatically by database triggers
      // (see migration-015-counter-triggers-indexes.sql)
      await client.query(
        `INSERT INTO follows (follower_id, following_id, status, created_at)
         VALUES ($1, $2, 'accepted', NOW())
         ON CONFLICT (follower_id, following_id) DO UPDATE SET status = 'accepted', updated_at = NOW()`,
        [request.requester_id, profileId]
      );

      // Get accepter's name for notification
      // Per CLAUDE.md: use explicit column names, never SELECT *
      const accepterResult = await client.query(
        'SELECT display_name, username FROM profiles WHERE id = $1',
        [profileId]
      );
      const accepterRow = accepterResult.rows[0];
      const accepterName = accepterRow?.display_name || 'Someone';

      // Idempotent notification: ON CONFLICT prevents duplicates from retries
      const notifData = JSON.stringify({ senderId: profileId });
      const dailyBucket = Math.floor(Date.now() / 86400000);
      const idempotencyKey = `follow_accepted:${profileId}:${request.requester_id}:${dailyBucket}`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key, created_at)
         VALUES ($1, 'follow_accepted', 'Follow Request Accepted', $2, $3, $4, NOW())
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [request.requester_id, `${accepterName} accepted your follow request`, notifData, idempotencyKey]
      );

      await client.query('COMMIT');

      // Send push notification to requester (non-blocking)
      sendPushToUser(db, request.requester_id, {
        title: 'Follow Request Accepted',
        body: `${accepterName} accepted your follow request`,
        data: { type: 'follow_accepted', userId: profileId },
      }, profileId).catch(err => log.error('Push notification failed', err));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Follow request accepted',
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error accepting follow request', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
