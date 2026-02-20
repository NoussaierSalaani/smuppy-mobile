/**
 * Admin Disputes List Lambda Handler
 * GET /admin/disputes
 *
 * Admin endpoint for listing all disputes with stats
 * - Filters by status, priority
 * - Includes auto-verification recommendations
 * - Returns summary statistics
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { requireRateLimit } from '../../api/utils/rate-limit';
import {
  parseOffsetCursor,
  deriveOffsetPage,
  DISPUTE_STATUS_ORDER_SQL,
  mapDisputeBase,
} from '../../api/utils/dispute-helpers';

const log = createLogger('admin/disputes-list');

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
      prefix: 'admin-disputes-list',
      identifier: user.id,
      maxRequests: 30,
      windowSeconds: 60,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    // Check admin role
    const adminCheck = await db.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [user.id]
    );

    if (adminCheck.rows[0]?.account_type !== 'admin') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Admin access required' }),
      };
    }

    // Parse query params
    const { status, priority, limit = '50', cursor } = event.queryStringParameters || {};

    // Build query
    let query = `
      SELECT
        d.id,
        d.dispute_number,
        d.type,
        d.status,
        d.priority,
        d.created_at,
        d.amount_cents,
        d.currency,
        d.auto_verification,
        complainant.username as complainant_username,
        complainant.avatar_url as complainant_avatar,
        respondent.username as respondent_username,
        respondent.avatar_url as respondent_avatar,
        (SELECT COUNT(*) FROM dispute_evidence WHERE dispute_id = d.id) as evidence_count
      FROM session_disputes d
      JOIN profiles complainant ON d.complainant_id = complainant.id
      JOIN profiles respondent ON d.respondent_id = respondent.id
      WHERE 1=1
    `;

    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      query += ` AND d.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    // Admin disputes use multi-CASE ORDER BY — use offset-encoded cursor
    const { offset, parsedLimit } = parseOffsetCursor(cursor, limit);

    params.push(parsedLimit + 1);
    params.push(offset);
    query += ` ORDER BY
      ${DISPUTE_STATUS_ORDER_SQL},
      CASE d.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        ELSE 4
      END,
      d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    paramIndex += 2;

    const disputesResult = await db.query(query, params);

    const { data: rows, nextCursor, hasMore } = deriveOffsetPage(
      disputesResult.rows,
      parsedLimit,
      offset,
    );

    // Get statistics
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'open') as open,
        COUNT(*) FILTER (WHERE status = 'under_review') as under_review,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
          FILTER (WHERE status = 'resolved') as avg_resolution_hours
      FROM session_disputes
    `);
    const stats = statsResult.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        nextCursor,
        hasMore,
        disputes: rows.map((d) => ({
          ...mapDisputeBase(d),
          evidenceCount: Number.parseInt(d.evidence_count),
        })),
        stats: {
          total: Number.parseInt(stats.total),
          open: Number.parseInt(stats.open),
          underReview: Number.parseInt(stats.under_review),
          resolved: Number.parseInt(stats.resolved),
          avgResolutionTime: Math.round(Number.parseFloat(stats.avg_resolution_hours) || 0),
        },
      }),
    };
  } catch (error) {
    log.error('Admin disputes list error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};
