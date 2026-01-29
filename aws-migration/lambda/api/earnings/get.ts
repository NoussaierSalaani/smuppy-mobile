/**
 * Get Creator Earnings Handler
 * GET /earnings - Get creator's earnings summary and transactions
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const pool = await getPool();

    // Verify user is a creator
    const userResult = await pool.query(
      `SELECT account_type, stripe_account_id FROM profiles WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].account_type !== 'pro_creator') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Creator account required' }),
      };
    }

    const period = event.queryStringParameters?.period || 'month'; // 'week', 'month', 'year', 'all'
    const limit = parseInt(event.queryStringParameters?.limit || '20');

    // Calculate date range
    let startDate: Date;
    const now = new Date();
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Get earnings from completed sessions
    const sessionsEarnings = await pool.query(
      `SELECT
        COUNT(*) as session_count,
        COALESCE(SUM(price * 0.80), 0) as sessions_total
       FROM private_sessions
       WHERE creator_id = $1 AND status = 'completed'
       AND created_at >= $2`,
      [userId, startDate.toISOString()]
    );

    // Get earnings from pack purchases
    const packsEarnings = await pool.query(
      `SELECT
        COUNT(*) as pack_count,
        COALESCE(SUM(amount * 0.80), 0) as packs_total
       FROM pending_pack_purchases
       WHERE creator_id = $1 AND status = 'completed'
       AND created_at >= $2`,
      [userId, startDate.toISOString()]
    );

    // Get earnings from subscriptions
    const subscriptionsEarnings = await pool.query(
      `SELECT
        COUNT(DISTINCT subscriber_id) as subscriber_count,
        COALESCE(SUM(p.amount * 0.80), 0) as subscriptions_total
       FROM channel_subscriptions cs
       LEFT JOIN payments p ON p.subscription_id = cs.id
       WHERE cs.creator_id = $1
       AND p.created_at >= $2`,
      [userId, startDate.toISOString()]
    );

    // Get recent transactions
    const transactions = await pool.query(
      `SELECT
        id, type, amount, currency, status, description,
        buyer_id, created_at
       FROM (
         -- Sessions
         SELECT
           ps.id, 'session' as type, ps.price * 0.80 as amount, 'EUR' as currency,
           ps.status, CONCAT('Session with ', fp.full_name) as description,
           ps.fan_id as buyer_id, ps.created_at
         FROM private_sessions ps
         JOIN profiles fp ON ps.fan_id = fp.id
         WHERE ps.creator_id = $1 AND ps.status = 'completed'

         UNION ALL

         -- Pack purchases
         SELECT
           ppp.id, 'pack' as type, ppp.amount * 0.80 as amount, 'EUR' as currency,
           ppp.status, CONCAT('Pack: ', sp.name) as description,
           ppp.user_id as buyer_id, ppp.created_at
         FROM pending_pack_purchases ppp
         JOIN session_packs sp ON ppp.pack_id = sp.id
         WHERE ppp.creator_id = $1 AND ppp.status = 'completed'
       ) combined
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    // Get buyer info for transactions
    const buyerIds = [...new Set(transactions.rows.map(t => t.buyer_id))];
    let buyersMap: Record<string, { name: string; avatar: string }> = {};

    if (buyerIds.length > 0) {
      const buyersResult = await pool.query(
        `SELECT id, full_name, avatar_url FROM profiles WHERE id = ANY($1)`,
        [buyerIds]
      );
      buyersMap = buyersResult.rows.reduce((acc, row) => {
        acc[row.id] = { name: row.full_name, avatar: row.avatar_url };
        return acc;
      }, {} as Record<string, { name: string; avatar: string }>);
    }

    const sessionsTotal = parseFloat(sessionsEarnings.rows[0]?.sessions_total || 0);
    const packsTotal = parseFloat(packsEarnings.rows[0]?.packs_total || 0);
    const subscriptionsTotal = parseFloat(subscriptionsEarnings.rows[0]?.subscriptions_total || 0);
    const totalEarnings = sessionsTotal + packsTotal + subscriptionsTotal;

    // Get pending balance (simulated - in real app, fetch from Stripe)
    const pendingBalance = totalEarnings * 0.1; // Assume 10% pending
    const availableBalance = totalEarnings - pendingBalance;

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        earnings: {
          period,
          totalEarnings,
          availableBalance,
          pendingBalance,
          breakdown: {
            sessions: {
              count: parseInt(sessionsEarnings.rows[0]?.session_count || 0),
              total: sessionsTotal,
            },
            packs: {
              count: parseInt(packsEarnings.rows[0]?.pack_count || 0),
              total: packsTotal,
            },
            subscriptions: {
              count: parseInt(subscriptionsEarnings.rows[0]?.subscriber_count || 0),
              total: subscriptionsTotal,
            },
          },
          transactions: transactions.rows.map(t => ({
            id: t.id,
            type: t.type,
            amount: parseFloat(t.amount),
            currency: t.currency,
            status: t.status,
            description: t.description,
            buyer: buyersMap[t.buyer_id] || null,
            createdAt: t.created_at,
          })),
        },
      }),
    };
  } catch (error) {
    console.error('Get earnings error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to get earnings' }),
    };
  }
};
