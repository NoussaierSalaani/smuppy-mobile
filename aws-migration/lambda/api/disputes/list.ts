/**
 * List Disputes Lambda Handler
 * GET /disputes
 *
 * Returns disputes for the authenticated user
 * - Users see their own disputes (as complainant or respondent)
 * - Admins see all disputes with filters
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { requireRateLimit } from '../../api/utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../../api/utils/constants';
import {
  parseOffsetCursor,
  deriveOffsetPage,
  DISPUTE_STATUS_ORDER_SQL,
  mapDisputeBase,
} from '../../api/utils/dispute-helpers';

const log = createLogger('disputes/list');

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 30 reads per minute
    const rateLimitResponse = await requireRateLimit({
      prefix: 'dispute-read',
      identifier: user.id,
      maxRequests: 30,
      windowSeconds: RATE_WINDOW_1_MIN,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    // Parse query params
    const {
      status,
      type,
      limit = '20',
      cursor,
      as = 'all', // 'complainant', 'respondent', 'all'
    } = event.queryStringParameters || {};

    // Check if user is admin
    const adminCheck = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [user.id]
    );
    const isAdmin = adminCheck.rows[0]?.account_type === 'admin';

    let query = `
      SELECT
        d.id,
        d.dispute_number,
        d.type,
        d.status,
        d.priority,
        d.complainant_description,
        d.respondent_response,
        d.amount_cents,
        d.refund_amount_cents,
        d.currency,
        d.resolution,
        d.created_at,
        d.resolved_at,
        d.evidence_deadline,
        d.auto_verification,
        ps.scheduled_at as session_date,
        ps.duration_minutes as session_duration,
        complainant.username as complainant_username,
        complainant.avatar_url as complainant_avatar,
        respondent.username as respondent_username,
        respondent.avatar_url as respondent_avatar
      FROM session_disputes d
      JOIN private_sessions ps ON d.session_id = ps.id
      JOIN profiles complainant ON d.complainant_id = complainant.id
      JOIN profiles respondent ON d.respondent_id = respondent.id
      WHERE 1=1
    `;

    const params: (string | number)[] = [];
    let paramIndex = 1;

    // Non-admins can only see their own disputes
    if (!isAdmin) {
      if (as === 'complainant') {
        query += ` AND d.complainant_id = $${paramIndex}`;
        params.push(user.id);
      } else if (as === 'respondent') {
        query += ` AND d.respondent_id = $${paramIndex}`;
        params.push(user.id);
      } else {
        query += ` AND (d.complainant_id = $${paramIndex} OR d.respondent_id = $${paramIndex})`;
        params.push(user.id);
      }
      paramIndex++;
    }

    // Filters
    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (type) {
      query += ` AND d.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    // Disputes use multi-column CASE ORDER BY (status rank + created_at).
    // Use offset-encoded cursor since keyset on CASE expressions is complex.
    const { offset, parsedLimit } = parseOffsetCursor(cursor, limit);

    params.push(parsedLimit + 1);
    params.push(offset);
    query += ` ORDER BY
      ${DISPUTE_STATUS_ORDER_SQL},
      d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    paramIndex += 2;

    const result = await db.query(query, params);

    const { data: rows, nextCursor, hasMore } = deriveOffsetPage(
      result.rows,
      parsedLimit,
      offset,
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        disputes: rows.map((d) => ({
          ...mapDisputeBase(d),
          description: d.complainant_description,
          respondentResponse: d.respondent_response,
          refundAmount: d.refund_amount_cents ? d.refund_amount_cents / 100 : null,
          resolution: d.resolution,
          resolvedAt: d.resolved_at,
          evidenceDeadline: d.evidence_deadline,
          session: {
            scheduledAt: d.session_date,
            durationMinutes: d.session_duration,
          },
        })),
        nextCursor,
        hasMore,
      }),
    };
  } catch (error) {
    log.error('List disputes error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};
