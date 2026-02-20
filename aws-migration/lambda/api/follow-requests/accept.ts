/**
 * Accept Follow Request Lambda Handler
 * Accepts a pending follow request and creates the follow relationship
 */

import { createFollowRequestHandler } from '../utils/create-follow-request-handler';
import { sendPushToUser } from '../services/push-notification';
import { createLogger } from '../utils/logger';
import { RATE_WINDOW_30S } from '../utils/constants';

const log = createLogger('follow-requests-accept');

export const handler = createFollowRequestHandler({
  action: 'accept',
  loggerName: 'follow-requests-accept',
  authRole: 'target',
  paramName: 'id',
  rateLimitWindow: RATE_WINDOW_30S,
  rateLimitMax: 10,
  useTransaction: true,
  onAction: async ({ db, client, request, profileId, headers }) => {
    // request is guaranteed non-null by factory for paramName: 'id'
    if (!request) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Follow request not found' }) };
    }

    // BUG-2026-02-14: Check bidirectional block INSIDE transaction to prevent TOCTOU race
    const blockCheck = await client.query(
      `SELECT 1 FROM blocked_users
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [profileId, request.requester_id],
    );
    if (blockCheck.rows.length > 0) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Cannot accept this follow request' }),
      };
    }

    // Update request status
    await client.query(
      'UPDATE follow_requests SET status = $1, updated_at = NOW() WHERE id = $2',
      ['accepted', request.id],
    );

    // Create the follow relationship with accepted status
    // Note: fan_count and following_count are updated automatically by database triggers
    // (see migration-015-counter-triggers-indexes.sql)
    await client.query(
      `INSERT INTO follows (follower_id, following_id, status, created_at)
       VALUES ($1, $2, 'accepted', NOW())
       ON CONFLICT (follower_id, following_id) DO UPDATE SET status = 'accepted', updated_at = NOW()`,
      [request.requester_id, profileId],
    );

    // Get accepter's name for notification
    // Per CLAUDE.md: use explicit column names, never SELECT *
    const accepterResult = await client.query(
      'SELECT display_name, username FROM profiles WHERE id = $1',
      [profileId],
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
      [request.requester_id, `${accepterName} accepted your follow request`, notifData, idempotencyKey],
    );

    // Send push notification to requester (non-blocking, after COMMIT via factory)
    sendPushToUser(db, request.requester_id, {
      title: 'Follow Request Accepted',
      body: `${accepterName} accepted your follow request`,
      data: { type: 'follow_accepted', userId: profileId },
    }, profileId).catch(err => log.error('Push notification failed', err));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Follow request accepted' }),
    };
  },
});
