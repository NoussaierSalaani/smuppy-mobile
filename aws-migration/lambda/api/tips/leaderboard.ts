/**
 * Tips Leaderboard Lambda Handler
 * Get top tippers for a creator
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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

    // Get period start date
    let periodStart: string | null = null;
    if (period === 'monthly') {
      periodStart = "DATE_TRUNC('month', NOW())";
    } else if (period === 'weekly') {
      periodStart = "DATE_TRUNC('week', NOW())";
    }

    const query = `
      SELECT
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
      ${periodStart ? `AND tl.period_start = ${periodStart}` : 'AND tl.period_start IS NULL'}
      ORDER BY tl.total_amount DESC
      LIMIT $3
    `;

    const result = await client.query(query, [creatorId, period, limit]);

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
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Failed to fetch leaderboard',
      }),
    });
  } finally {
    client.release();
  }
};
