/**
 * Cancel Event Lambda Handler
 * Soft-delete (cancel) an event — creator only
 * POST /events/{eventId}/cancel
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('events-delete');
const corsHeaders = getSecureHeaders();

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'event-cancel', identifier: userId, windowSeconds: 60, maxRequests: 5 }, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check (suspended/banned users cannot cancel events)
    const accountCheck = await requireActiveAccount(userId, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId || !isValidUUID(eventId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve cognito_sub to profile ID (pre-transaction read via pool)
    const profileId = await resolveProfileId(pool, userId);
    if (!profileId) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }

    // Ownership check: verify event exists and belongs to the user
    const ownerCheck = await pool.query(
      `SELECT id, title, status FROM events WHERE id = $1 AND creator_id = $2`,
      [eventId, profileId]
    );
    if (ownerCheck.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found or you are not the creator' }),
      });
    }

    if (ownerCheck.rows[0].status === 'cancelled') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Event is already cancelled' }),
      });
    }

    const eventTitle = ownerCheck.rows[0].title;

    // Acquire transaction client only after all validation passes
    const client = await pool.connect();
    try {
    await client.query('BEGIN');

    // Soft delete: set status to cancelled
    await client.query(
      `UPDATE events SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND creator_id = $2`,
      [eventId, profileId]
    );

    // Cancel all pending/registered participants
    await client.query(
      `UPDATE event_participants SET status = 'cancelled'
       WHERE event_id = $1 AND status IN ('registered', 'confirmed')`,
      [eventId]
    );

    // Notify all affected participants about the cancellation
    const participantsResult = await client.query(
      `SELECT user_id FROM event_participants
       WHERE event_id = $1 AND user_id != $2
       AND status = 'cancelled'`,
      [eventId, profileId]
    );

    if (participantsResult.rows.length > 0) {
      // Build bulk notification insert
      const notificationValues: string[] = [];
      const notificationParams: (string | null)[] = [];
      let paramIdx = 0;

      for (const row of participantsResult.rows) {
        const userIdIdx = ++paramIdx;
        const bodyIdx = ++paramIdx;
        const dataIdx = ++paramIdx;
        notificationValues.push(
          `($${userIdIdx}, 'event_cancellation', 'Event Cancelled', $${bodyIdx}, $${dataIdx})`
        );
        notificationParams.push(
          row.user_id,
          `The event "${eventTitle}" has been cancelled by the organizer.`,
          JSON.stringify({ eventId, eventTitle })
        );
      }

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ${notificationValues.join(', ')}`,
        notificationParams
      );
    }

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Event cancelled successfully',
      }),
    });
    } catch (txError: unknown) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Cancel event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to cancel event',
      }),
    });
  }
};
