/**
 * Report Peak Lambda Handler
 * Creates a report against a peak for content moderation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { checkUserEscalation, checkPeakEscalation } from '../../shared/moderation/autoEscalation';
import { RATE_WINDOW_5_MIN, MAX_REPORT_REASON_LENGTH, MAX_REPORT_DETAILS_LENGTH } from '../utils/constants';

const log = createLogger('reports-peak');

const VALID_REASONS = [
  'inappropriate',
  'spam',
  'harassment',
  'violence',
  'misinformation',
  'copyright',
  'other',
];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const rateLimitResponse = await requireRateLimit({
      prefix: 'report-all',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_5_MIN,
      maxRequests: 5,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const body = JSON.parse(event.body || '{}');
    const { peakId, reason, details } = body;

    if (!peakId || !isValidUUID(peakId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid peak ID format' }) };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Reason is required' }) };
    }

    if (!VALID_REASONS.includes(reason.trim().toLowerCase())) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid report reason' }) };
    }

    // Sanitize inputs
    const sanitizedReason = reason.replaceAll(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_REASON_LENGTH);
    const sanitizedDetails = details
      ? String(details).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_REPORT_DETAILS_LENGTH) // NOSONAR — intentional control char sanitization
      : null;

    const db = await getPool();

    const reporterId = await resolveProfileId(db, cognitoSub);
    if (!reporterId) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

    // Verify peak exists
    const peakResult = await db.query('SELECT id FROM peaks WHERE id = $1', [peakId]);
    if (peakResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Peak not found' }) };
    }

    // Atomic duplicate check + insert in a single transaction
    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        'SELECT id FROM peak_reports WHERE reporter_id = $1 AND peak_id = $2 FOR UPDATE',
        [reporterId, peakId]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return { statusCode: 409, headers, body: JSON.stringify({ message: 'You have already reported this peak' }) };
      }

      result = await client.query(
        `INSERT INTO peak_reports (reporter_id, peak_id, reason, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [reporterId, peakId, sanitizedReason, sanitizedDetails]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    log.info('Peak report created', { reportId: result.rows[0].id });

    // Auto-escalation: check if peak should be auto-hidden + user escalation
    try {
      const peakEscalation = await checkPeakEscalation(db, peakId);
      if (peakEscalation.action !== 'none') {
        log.info('Peak escalation triggered', peakEscalation);
      }

      const peakAuthorResult = await db.query('SELECT author_id FROM peaks WHERE id = $1', [peakId]);
      if (peakAuthorResult.rows.length > 0) {
        const userEscalation = await checkUserEscalation(db, peakAuthorResult.rows[0].author_id);
        if (userEscalation.action !== 'none') {
          log.info('User escalation triggered from peak report', userEscalation);
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
    log.error('Error reporting peak', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}
