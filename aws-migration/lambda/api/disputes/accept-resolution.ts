/**
 * Accept Dispute Resolution Lambda Handler
 * POST /disputes/{id}/accept
 *
 * Allows the complainant to accept a dispute resolution:
 * - Validates user is the complainant
 * - Checks dispute is in 'resolved' status
 * - Transitions dispute to 'closed'
 * - Adds timeline event
 * - Notifies respondent
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { checkRateLimit } from '../../api/utils/rate-limit';

const log = createLogger('disputes/accept-resolution');

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  const disputeId = event.pathParameters?.id;
  if (!disputeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(disputeId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid dispute ID required' }),
    };
  }

  const db = await getPool();
  let client: PoolClient | null = null;

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 5 accepts per minute
    const rateCheck = await checkRateLimit({
      prefix: 'dispute-accept',
      identifier: user.id,
      maxRequests: 5,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests' }),
      };
    }

    client = await db.connect();

    // Get dispute
    const disputeResult = await client.query(
      `SELECT
        d.id,
        d.dispute_number,
        d.status,
        d.resolution,
        d.complainant_id,
        d.respondent_id
      FROM session_disputes d
      WHERE d.id = $1`,
      [disputeId]
    );

    if (disputeResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Dispute not found' }),
      };
    }

    const dispute = disputeResult.rows[0];

    // Only the complainant can accept a resolution
    if (dispute.complainant_id !== user.id) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Only the complainant can accept the resolution' }),
      };
    }

    // Dispute must be in 'resolved' status to accept
    if (dispute.status !== 'resolved') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: dispute.status === 'closed'
            ? 'Dispute is already closed'
            : 'Dispute must be resolved before it can be accepted',
        }),
      };
    }

    await client.query('BEGIN');

    // Transition to closed
    await client.query(
      `UPDATE session_disputes
       SET status = 'closed',
           updated_at = NOW()
       WHERE id = $1`,
      [disputeId]
    );

    // Add timeline event
    await client.query(
      `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
       VALUES ($1, 'accepted', $2, $3, NOW())`,
      [
        disputeId,
        JSON.stringify({ resolution: dispute.resolution }),
        user.id,
      ]
    );

    // Notify respondent that complainant accepted
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        dispute.respondent_id,
        'dispute_closed',
        'Litige clôturé',
        `Le litige #${dispute.dispute_number} a été accepté et clôturé par le plaignant.`,
        JSON.stringify({
          disputeId,
          disputeNumber: dispute.dispute_number,
        }),
      ]
    );

    await client.query('COMMIT');

    log.info('Resolution accepted', {
      disputeId,
      disputeNumber: dispute.dispute_number,
      acceptedBy: user.id,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Resolution accepted — dispute closed',
      }),
    };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    log.error('Accept resolution error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  } finally {
    if (client) client.release();
  }
};
