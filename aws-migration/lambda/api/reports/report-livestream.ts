/**
 * Report Live Stream Lambda Handler
 * Creates a report against a live stream for content moderation.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';
import { RATE_WINDOW_5_MIN, MAX_REPORT_REASON_LENGTH, MAX_REPORT_DETAILS_LENGTH } from '../utils/constants';

const log = createLogger('reports-livestream');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'report-all',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_5_MIN,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { liveStreamId, reason, details } = body;

    if (!liveStreamId || !isValidUUID(liveStreamId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid live stream ID format' }) };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Reason is required' }) };
    }

    const sanitizedReason = reason.replace(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_REASON_LENGTH);
    const sanitizedDetails = details
      ? String(details).replace(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_DETAILS_LENGTH)
      : null;

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const reporterId = userResult.rows[0].id;

    // Verify live stream exists
    const streamResult = await db.query('SELECT id FROM live_streams WHERE id = $1', [liveStreamId]);
    if (streamResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Live stream not found' }) };
    }

    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM live_stream_reports WHERE reporter_id = $1 AND live_stream_id = $2 FOR UPDATE`,
        [reporterId, liveStreamId]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return { statusCode: 409, headers, body: JSON.stringify({ message: 'You have already reported this live stream' }) };
      }

      result = await client.query(
        `INSERT INTO live_stream_reports (reporter_id, live_stream_id, reason, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [reporterId, liveStreamId, sanitizedReason, sanitizedDetails]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    log.info('Live stream report created', { reportId: result.rows[0].id });

    // Auto-escalation: check if streamer should be escalated
    try {
      const streamerResult = await db.query('SELECT host_id FROM live_streams WHERE id = $1', [liveStreamId]);
      if (streamerResult.rows.length > 0) {
        const userEscalation = await checkUserEscalation(db, streamerResult.rows[0].host_id);
        if (userEscalation.action !== 'none') {
          log.info('User escalation triggered', userEscalation);
        }
      }
    } catch (escErr) {
      log.error('Auto-escalation check failed (non-blocking)', escErr);
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id: result.rows[0].id, success: true }),
    };
  } catch (error: unknown) {
    log.error('Error reporting live stream', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}
