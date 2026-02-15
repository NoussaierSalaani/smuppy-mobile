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
import { checkRateLimit } from '../../api/utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../../api/utils/constants';

const log = createLogger('disputes/list');

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);

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
    const rateCheck = await checkRateLimit({
      prefix: 'dispute-read',
      identifier: user.id,
      maxRequests: 30,
      windowSeconds: RATE_WINDOW_1_MIN,
    });

    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests' }),
      };
    }

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
    const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
    const parsedLimit = Math.min(parseInt(limit), 50);

    params.push(parsedLimit + 1);
    params.push(offset);
    query += ` ORDER BY
      CASE d.status
        WHEN 'open' THEN 1
        WHEN 'under_review' THEN 2
        WHEN 'evidence_requested' THEN 3
        ELSE 4
      END,
      d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    paramIndex += 2;

    const result = await db.query(query, params);

    const hasMore = result.rows.length > parsedLimit;
    const rows = result.rows.slice(0, parsedLimit);
    const nextCursor = hasMore ? String(offset + parsedLimit) : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        disputes: rows.map((d) => ({
          id: d.id,
          disputeNumber: d.dispute_number,
          type: d.type,
          status: d.status,
          priority: d.priority,
          description: d.complainant_description,
          respondentResponse: d.respondent_response,
          amount: d.amount_cents / 100,
          refundAmount: d.refund_amount_cents ? d.refund_amount_cents / 100 : null,
          currency: d.currency,
          resolution: d.resolution,
          createdAt: d.created_at,
          resolvedAt: d.resolved_at,
          evidenceDeadline: d.evidence_deadline,
          autoVerification: d.auto_verification,
          session: {
            scheduledAt: d.session_date,
            durationMinutes: d.session_duration,
          },
          complainant: {
            username: d.complainant_username,
            avatar: d.complainant_avatar,
          },
          respondent: {
            username: d.respondent_username,
            avatar: d.respondent_avatar,
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
