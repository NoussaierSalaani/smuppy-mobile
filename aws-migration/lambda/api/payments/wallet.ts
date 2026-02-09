/**
 * Creator Wallet Lambda Handler
 * Manages creator earnings, transaction history, and payouts
 *
 * Features:
 * - View total earnings and balances
 * - Transaction history (channel subs, sessions, packs)
 * - Revenue breakdown by source
 * - Payout management via Stripe Connect
 * - Revenue analytics
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('payments/wallet');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

// CORS headers now dynamically created via createHeaders(event)

interface WalletBody {
  action:
    | 'get-dashboard'
    | 'get-transactions'
    | 'get-analytics'
    | 'get-balance'
    | 'get-payouts'
    | 'create-payout'
    | 'get-stripe-dashboard-link';
  period?: 'day' | 'week' | 'month' | 'year' | 'all';
  limit?: number;
  offset?: number;
  type?: 'channel' | 'session' | 'pack' | 'all';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    await getStripe();
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body: WalletBody = JSON.parse(event.body || '{}');

    // Resolve cognito_sub → profile ID
    const pool = await getPool();
    const profileLookup = await pool.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    switch (body.action) {
      case 'get-dashboard':
        return await getDashboard(profileId, headers);
      case 'get-transactions':
        return await getTransactions(profileId, body, headers);
      case 'get-analytics':
        return await getAnalytics(profileId, body.period || 'month', headers);
      case 'get-balance':
        return await getBalance(profileId, headers);
      case 'get-payouts':
        return await getPayouts(profileId, body.limit || 10, headers);
      case 'create-payout':
        return await createPayout(profileId, headers);
      case 'get-stripe-dashboard-link':
        return await getStripeDashboardLink(profileId, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    log.error('Wallet error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

/**
 * Get comprehensive creator dashboard data
 */
async function getDashboard(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify user is a creator
    const profileResult = await client.query(
      `SELECT id, account_type, stripe_account_id, is_verified,
              (SELECT COUNT(1) FROM follows WHERE following_id = profiles.id) as fan_count
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const profile = profileResult.rows[0];

    if (!['pro_creator', 'pro_business'].includes(profile.account_type)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Only Pro accounts can access wallet' }),
      };
    }

    // Get revenue tier based on fan count
    const fanCount = parseInt(profile.fan_count) || 0;
    const tier = getTierInfo(fanCount);

    // Get lifetime earnings
    const lifetimeResult = await client.query(
      `SELECT
         COALESCE(SUM(creator_amount), 0) as total_earnings,
         COUNT(1) as total_transactions
       FROM payments
       WHERE creator_id = $1 AND status = 'succeeded'`,
      [userId]
    );

    // Get this month's earnings
    const monthResult = await client.query(
      `SELECT
         COALESCE(SUM(creator_amount), 0) as month_earnings,
         COUNT(1) as month_transactions
       FROM payments
       WHERE creator_id = $1
         AND status = 'succeeded'
         AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [userId]
    );

    // Get channel subscriber count
    const subscriberResult = await client.query(
      `SELECT COUNT(1) as subscriber_count
       FROM channel_subscriptions
       WHERE creator_id = $1 AND status = 'active'`,
      [userId]
    );

    // Get earnings breakdown by type
    const breakdownResult = await client.query(
      `SELECT
         type,
         COALESCE(SUM(creator_amount), 0) as earnings,
         COUNT(1) as count
       FROM payments
       WHERE creator_id = $1 AND status = 'succeeded'
       GROUP BY type`,
      [userId]
    );

    // Get Stripe balance if connected
    let stripeBalance = null;
    if (profile.stripe_account_id) {
      try {
        const balance = await stripe.balance.retrieve({
          stripeAccount: profile.stripe_account_id,
        });
        stripeBalance = {
          available: balance.available.reduce((sum, b) => sum + b.amount, 0),
          pending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
          currency: balance.available[0]?.currency || 'usd',
        };
      } catch {
        // Stripe account may not be fully set up
        stripeBalance = null;
      }
    }

    const lifetime = lifetimeResult.rows[0];
    const month = monthResult.rows[0];
    const breakdown = breakdownResult.rows;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dashboard: {
          profile: {
            accountType: profile.account_type,
            isVerified: profile.is_verified,
            hasStripeConnect: !!profile.stripe_account_id,
            fanCount,
          },
          tier,
          earnings: {
            lifetime: {
              total: parseInt(lifetime.total_earnings) || 0,
              transactions: parseInt(lifetime.total_transactions) || 0,
            },
            thisMonth: {
              total: parseInt(month.month_earnings) || 0,
              transactions: parseInt(month.month_transactions) || 0,
            },
            breakdown: breakdown.map((b: Record<string, unknown>) => ({
              type: b.type,
              earnings: parseInt(b.earnings as string) || 0,
              count: parseInt(b.count as string) || 0,
            })),
          },
          subscribers: {
            active: parseInt(subscriberResult.rows[0].subscriber_count) || 0,
          },
          balance: stripeBalance,
        },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get transaction history with filtering
 */
async function getTransactions(userId: string, options: WalletBody, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const limit = Math.min(options.limit || 20, 50);
    const offset = options.offset || 0;
    const type = options.type || 'all';

    let typeFilter = '';
    const params: SqlParam[] = [userId, limit, offset];

    if (type !== 'all') {
      typeFilter = 'AND type = $4';
      params.push(type);
    }

    const result = await client.query(
      `SELECT
         p.id,
         p.type,
         p.source,
         p.gross_amount,
         p.net_amount,
         p.platform_fee,
         p.creator_amount,
         p.status,
         p.created_at,
         buyer.username as buyer_username,
         buyer.full_name as buyer_name,
         buyer.avatar_url as buyer_avatar
       FROM payments p
       JOIN profiles buyer ON p.buyer_id = buyer.id
       WHERE p.creator_id = $1 ${typeFilter}
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );

    // Get total count
    const countParams = type !== 'all' ? [userId, type] : [userId];
    const countResult = await client.query(
      `SELECT COUNT(1) as total
       FROM payments
       WHERE creator_id = $1 ${type !== 'all' ? 'AND type = $2' : ''}`,
      countParams
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transactions: result.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          type: row.type,
          source: row.source,
          amounts: {
            gross: row.gross_amount,
            net: row.net_amount,
            platformFee: row.platform_fee,
            creatorAmount: row.creator_amount,
          },
          status: row.status,
          createdAt: row.created_at,
          buyer: {
            username: row.buyer_username,
            name: row.buyer_name,
            avatar: row.buyer_avatar,
          },
        })),
        pagination: {
          total: parseInt(countResult.rows[0].total) || 0,
          limit,
          offset,
          hasMore: offset + limit < parseInt(countResult.rows[0].total),
        },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get revenue analytics for a period
 */
async function getAnalytics(userId: string, period: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    let periodFilter = '';
    let groupBy = '';
    let dateFormat = '';

    switch (period) {
      case 'day':
        periodFilter = "AND created_at >= NOW() - INTERVAL '24 hours'";
        groupBy = "date_trunc('hour', created_at)";
        dateFormat = 'hour';
        break;
      case 'week':
        periodFilter = "AND created_at >= NOW() - INTERVAL '7 days'";
        groupBy = "date_trunc('day', created_at)";
        dateFormat = 'day';
        break;
      case 'month':
        periodFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
        groupBy = "date_trunc('day', created_at)";
        dateFormat = 'day';
        break;
      case 'year':
        periodFilter = "AND created_at >= NOW() - INTERVAL '12 months'";
        groupBy = "date_trunc('month', created_at)";
        dateFormat = 'month';
        break;
      default:
        periodFilter = '';
        groupBy = "date_trunc('month', created_at)";
        dateFormat = 'month';
    }

    // Get earnings over time
    const timelineResult = await client.query(
      `SELECT
         ${groupBy} as period,
         COALESCE(SUM(creator_amount), 0) as earnings,
         COUNT(1) as transactions
       FROM payments
       WHERE creator_id = $1 AND status = 'succeeded' ${periodFilter}
       GROUP BY ${groupBy}
       ORDER BY ${groupBy}`,
      [userId]
    );

    // Get top buyers
    const topBuyersResult = await client.query(
      `SELECT
         buyer.id,
         buyer.username,
         buyer.full_name,
         buyer.avatar_url,
         COALESCE(SUM(p.creator_amount), 0) as total_spent,
         COUNT(1) as transaction_count
       FROM payments p
       JOIN profiles buyer ON p.buyer_id = buyer.id
       WHERE p.creator_id = $1 AND p.status = 'succeeded' ${periodFilter}
       GROUP BY buyer.id, buyer.username, buyer.full_name, buyer.avatar_url
       ORDER BY total_spent DESC
       LIMIT 10`,
      [userId]
    );

    // Get earnings by source (web vs in-app)
    const bySourceResult = await client.query(
      `SELECT
         source,
         COALESCE(SUM(creator_amount), 0) as earnings,
         COUNT(1) as count
       FROM payments
       WHERE creator_id = $1 AND status = 'succeeded' ${periodFilter}
       GROUP BY source`,
      [userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analytics: {
          period,
          dateFormat,
          timeline: timelineResult.rows.map((row: Record<string, unknown>) => ({
            period: row.period,
            earnings: parseInt(row.earnings as string) || 0,
            transactions: parseInt(row.transactions as string) || 0,
          })),
          topBuyers: topBuyersResult.rows.map((row: Record<string, unknown>) => ({
            id: row.id,
            username: row.username,
            name: row.full_name,
            avatar: row.avatar_url,
            totalSpent: parseInt(row.total_spent as string) || 0,
            transactionCount: parseInt(row.transaction_count as string) || 0,
          })),
          bySource: bySourceResult.rows.map((row: Record<string, unknown>) => ({
            source: row.source,
            earnings: parseInt(row.earnings as string) || 0,
            count: parseInt(row.count as string) || 0,
          })),
        },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get Stripe Connect balance
 */
async function getBalance(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Stripe Connect not set up' }),
      };
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: result.rows[0].stripe_account_id,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        balance: {
          available: balance.available.map(b => ({
            amount: b.amount,
            currency: b.currency,
          })),
          pending: balance.pending.map(b => ({
            amount: b.amount,
            currency: b.currency,
          })),
          instantAvailable: balance.instant_available?.map(b => ({
            amount: b.amount,
            currency: b.currency,
          })) || [],
        },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get payout history
 */
async function getPayouts(userId: string, limit: number, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Stripe Connect not set up' }),
      };
    }

    const payouts = await stripe.payouts.list(
      { limit: Math.min(limit, 50) },
      { stripeAccount: result.rows[0].stripe_account_id }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payouts: payouts.data.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          arrivalDate: p.arrival_date,
          created: p.created,
          method: p.method,
          type: p.type,
        })),
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Request a payout (if instant payouts are available)
 */
async function createPayout(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Stripe Connect not set up' }),
      };
    }

    const stripeAccountId = result.rows[0].stripe_account_id;

    // Get available balance
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeAccountId,
    });

    const availableAmount = balance.available.find(b => b.currency === 'usd')?.amount || 0;

    if (availableAmount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No available balance to payout' }),
      };
    }

    // Create payout
    const payout = await stripe.payouts.create(
      {
        amount: availableAmount,
        currency: 'usd',
      },
      { stripeAccount: stripeAccountId }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payout: {
          id: payout.id,
          amount: payout.amount,
          currency: payout.currency,
          status: payout.status,
          arrivalDate: payout.arrival_date,
        },
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get link to Stripe Express Dashboard
 * This allows creators to manage their account, bank details, and view detailed reports
 */
async function getStripeDashboardLink(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Stripe Connect not set up' }),
      };
    }

    const loginLink = await stripe.accounts.createLoginLink(result.rows[0].stripe_account_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        url: loginLink.url,
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(), // Link expires in ~1 minute
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Get tier information based on fan count
 */
function getTierInfo(fanCount: number): { name: string; creatorPercent: number; smuppyPercent: number; nextTier: { name: string; fansNeeded: number } | null } {
  if (fanCount >= 1000000) {
    return {
      name: 'Diamond',
      creatorPercent: 80,
      smuppyPercent: 20,
      nextTier: null,
    };
  } else if (fanCount >= 100000) {
    return {
      name: 'Platinum',
      creatorPercent: 75,
      smuppyPercent: 25,
      nextTier: { name: 'Diamond', fansNeeded: 1000000 - fanCount },
    };
  } else if (fanCount >= 10000) {
    return {
      name: 'Gold',
      creatorPercent: 70,
      smuppyPercent: 30,
      nextTier: { name: 'Platinum', fansNeeded: 100000 - fanCount },
    };
  } else if (fanCount >= 1000) {
    return {
      name: 'Silver',
      creatorPercent: 65,
      smuppyPercent: 35,
      nextTier: { name: 'Gold', fansNeeded: 10000 - fanCount },
    };
  } else {
    return {
      name: 'Bronze',
      creatorPercent: 60,
      smuppyPercent: 40,
      nextTier: { name: 'Silver', fansNeeded: 1000 - fanCount },
    };
  }
}
