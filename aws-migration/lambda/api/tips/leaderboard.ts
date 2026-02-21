/**
 * Tips Leaderboard Lambda Handler
 * Get top tippers for a creator
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { parseLimit } from '../utils/pagination';

export const handler = withErrorHandler('tips-leaderboard', async (event, { headers }) => {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    const creatorId = event.pathParameters?.creatorId;
    const period = event.queryStringParameters?.period || 'all_time'; // all_time, monthly, weekly
    const limit = parseLimit(event.queryStringParameters?.limit);

    if (!creatorId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator ID required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(creatorId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid creator ID format' }),
      };
    }

    if (!['all_time', 'monthly', 'weekly'].includes(period)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid period' }),
      };
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

    const leaderboard = result.rows.map((row: Record<string, unknown>) => ({
      rank: Number.parseInt(row.rank as string),
      tipper: {
        id: row.tipper_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
      },
      totalAmount: Number.parseFloat(row.total_amount as string),
      tipCount: Number.parseInt(row.tip_count as string),
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        period,
        leaderboard,
        stats: {
          uniqueTippers: Number.parseInt(statsResult.rows[0].unique_tippers),
          totalAmount: Number.parseFloat(statsResult.rows[0].total_amount),
          creatorTotal: Number.parseFloat(statsResult.rows[0].creator_total),
        },
      }),
    };
  } catch (error: unknown) {
    throw error;
  } finally {
    client.release();
  }
});
