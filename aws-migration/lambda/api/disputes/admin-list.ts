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
import { checkRateLimit } from '../../api/utils/rate-limit';

const log = createLogger('admin/disputes-list');

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
      prefix: 'admin-disputes-list',
      identifier: user.id,
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests' }),
      };
    }

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
    const MAX_OFFSET = 500;
    const offset = cursor ? Math.min(parseInt(cursor, 10) || 0, MAX_OFFSET) : 0;
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

    const hasMore = disputesResult.rows.length > parsedLimit;
    const rows = disputesResult.rows.slice(0, parsedLimit);
    const nextCursor = hasMore ? String(offset + parsedLimit) : null;

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
          id: d.id,
          disputeNumber: d.dispute_number,
          type: d.type,
          status: d.status,
          priority: d.priority,
          createdAt: d.created_at,
          amount: d.amount_cents / 100,
          currency: d.currency,
          autoVerification: d.auto_verification,
          evidenceCount: parseInt(d.evidence_count),
          complainant: {
            username: d.complainant_username,
            avatar: d.complainant_avatar,
          },
          respondent: {
            username: d.respondent_username,
            avatar: d.respondent_avatar,
          },
        })),
        stats: {
          total: parseInt(stats.total),
          open: parseInt(stats.open),
          underReview: parseInt(stats.under_review),
          resolved: parseInt(stats.resolved),
          avgResolutionTime: Math.round(parseFloat(stats.avg_resolution_hours) || 0),
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
