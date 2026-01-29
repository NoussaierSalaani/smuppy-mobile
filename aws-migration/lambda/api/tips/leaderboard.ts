/**
 * Tips Leaderboard Lambda Handler
 * Get top tippers for a creator
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('tips-leaderboard');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
});

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    const creatorId = event.pathParameters?.creatorId;
    const period = event.queryStringParameters?.period || 'all_time'; // all_time, monthly, weekly
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '10'), 50);

    if (!creatorId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Creator ID required' }),
      });
    }

    if (!['all_time', 'monthly', 'weekly'].includes(period)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid period' }),
      });
    }

    // Get period start date using parameterized SQL (no string interpolation)
    const usePeriodStart = period === 'monthly' || period === 'weekly';

    const query = usePeriodStart
      ? `SELECT
          tl.tipper_id,
          tl.total_amount,
          tl.tip_count,
          ROW_NUMBER() OVER (ORDER BY tl.total_amount DESC) as rank,
          p.username,
          p.display_name,
          p.avatar_url
        FROM tip_leaderboard tl
        JOIN profiles p ON tl.tipper_id = p.id
        WHERE tl.creator_id = $1
        AND tl.period_type = $2
        AND tl.period_start = DATE_TRUNC($4, NOW())
        ORDER BY tl.total_amount DESC
        LIMIT $3`
      : `SELECT
          tl.tipper_id,
          tl.total_amount,
          tl.tip_count,
          ROW_NUMBER() OVER (ORDER BY tl.total_amount DESC) as rank,
          p.username,
          p.display_name,
          p.avatar_url
        FROM tip_leaderboard tl
        JOIN profiles p ON tl.tipper_id = p.id
        WHERE tl.creator_id = $1
        AND tl.period_type = $2
        AND tl.period_start IS NULL
        ORDER BY tl.total_amount DESC
        LIMIT $3`;

    const params: (string | number)[] = [creatorId, period, limit];
    if (usePeriodStart) {
      params.push(period === 'monthly' ? 'month' : 'week');
    }

    const result = await client.query(query, params);

    // Get total tips stats for this creator
    const statsResult = await client.query(
      `SELECT
        COUNT(DISTINCT sender_id) as unique_tippers,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(creator_amount), 0) as creator_total
      FROM tips
      WHERE receiver_id = $1
      AND payment_status = 'completed'`,
      [creatorId]
    );

    const leaderboard = result.rows.map((row) => ({
      rank: parseInt(row.rank),
      tipper: {
        id: row.tipper_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
      totalAmount: parseFloat(row.total_amount),
      tipCount: parseInt(row.tip_count),
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period,
        leaderboard,
        stats: {
          uniqueTippers: parseInt(statsResult.rows[0].unique_tippers),
          totalAmount: parseFloat(statsResult.rows[0].total_amount),
          creatorTotal: parseFloat(statsResult.rows[0].creator_total),
        },
      }),
    });
  } catch (error: unknown) {
    log.error('Leaderboard error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to fetch leaderboard',
      }),
    });
  } finally {
    client.release();
  }
};
