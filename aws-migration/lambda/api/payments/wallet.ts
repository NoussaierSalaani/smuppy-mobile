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
import { APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { getPool, SqlParam } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { safeStripeCall } from '../../shared/stripe-resilience';
import { createLogger } from '../utils/logger';
import { FAN_TIERS, DEFAULT_FEE_PERCENT, DEFAULT_TIER_NAME, DEFAULT_NEXT_TIER } from '../utils/revenue-share';

const log = createLogger('payments-wallet');

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
  cursor?: string;
  type?: 'channel' | 'session' | 'pack' | 'all';
}

interface TierInfo {
  name: string;
  creatorPercent: number;
  smuppyPercent: number;
  nextTier: { name: string; fansNeeded: number } | null;
}

interface AnalyticsPeriodConfig {
  /** PostgreSQL interval value (e.g. '24 hours', '7 days') — null means all-time */
  interval: string | null;
  /** date_trunc precision: 'hour', 'day', or 'month' */
  truncation: 'hour' | 'day' | 'month';
  dateFormat: string;
}

interface TransactionQueryResult {
  sql: string;
  params: SqlParam[];
  limit: number;
}

// ─── Tier lookup table (derived from shared revenue-share constants) ───

const TIER_THRESHOLDS = [
  ...FAN_TIERS.map((tier) => ({
    threshold: tier.minFans,
    name: tier.name,
    creatorPercent: 100 - tier.feePercent,
    smuppyPercent: tier.feePercent,
    nextTierName: tier.nextTierName,
    nextTierThreshold: tier.nextTierThreshold,
  })),
  {
    threshold: 0,
    name: DEFAULT_TIER_NAME,
    creatorPercent: 100 - DEFAULT_FEE_PERCENT,
    smuppyPercent: DEFAULT_FEE_PERCENT,
    nextTierName: DEFAULT_NEXT_TIER.name as string | null,
    nextTierThreshold: DEFAULT_NEXT_TIER.threshold as number | null,
  },
];

// ─── Handler ───

export const handler = withAuthHandler('payments-wallet', async (event, { headers, log, cognitoSub, profileId }) => {
    await getStripeClient();

    // Rate limit: 20 wallet requests per minute — fail-closed for financial data
    const rateLimitResponse = await requireRateLimit({ prefix: 'wallet', identifier: cognitoSub, windowSeconds: 60, maxRequests: 20, failOpen: false }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const body: WalletBody = JSON.parse(event.body || '{}');

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
      case 'create-payout': {
        // Stricter rate limit for payouts — failClosed to prevent abuse during DynamoDB outage
        const payoutRateLimitResponse = await requireRateLimit({ prefix: 'wallet-payout', identifier: cognitoSub, windowSeconds: 60, maxRequests: 3, failOpen: false }, headers);
        if (payoutRateLimitResponse) return payoutRateLimitResponse;
        return await createPayout(profileId, headers);
      }
      case 'get-stripe-dashboard-link':
        return await getStripeDashboardLink(profileId, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
});

// ─── Tier info (data-driven) ───

/**
 * Get tier information based on fan count
 */
function getTierInfo(fanCount: number): TierInfo {
  const tier = TIER_THRESHOLDS.find(t => fanCount >= t.threshold) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
  return {
    name: tier.name,
    creatorPercent: tier.creatorPercent,
    smuppyPercent: tier.smuppyPercent,
    nextTier: tier.nextTierName && tier.nextTierThreshold
      ? { name: tier.nextTierName, fansNeeded: tier.nextTierThreshold - fanCount }
      : null,
  };
}

// ─── Dashboard helpers ───

async function fetchCreatorProfile(client: PoolClient, userId: string) {
  const result = await client.query(
    `SELECT id, account_type, stripe_account_id, is_verified,
            (SELECT COUNT(1) FROM follows WHERE following_id = profiles.id) as fan_count
     FROM profiles WHERE id = $1`,
    [userId]
  );
  return result.rows[0] as Record<string, unknown> | undefined;
}

async function fetchLifetimeEarnings(client: PoolClient, userId: string) {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(creator_amount), 0) as total_earnings,
       COUNT(1) as total_transactions
     FROM payments
     WHERE creator_id = $1 AND status = 'succeeded'`,
    [userId]
  );
  return result.rows[0];
}

async function fetchMonthEarnings(client: PoolClient, userId: string) {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(creator_amount), 0) as month_earnings,
       COUNT(1) as month_transactions
     FROM payments
     WHERE creator_id = $1
       AND status = 'succeeded'
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [userId]
  );
  return result.rows[0];
}

async function fetchSubscriberCount(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query(
    `SELECT COUNT(1) as subscriber_count
     FROM channel_subscriptions
     WHERE creator_id = $1 AND status = 'active'`,
    [userId]
  );
  return Number.parseInt(result.rows[0].subscriber_count) || 0;
}

async function fetchEarningsBreakdown(client: PoolClient, userId: string) {
  const result = await client.query(
    `SELECT
       type,
       COALESCE(SUM(creator_amount), 0) as earnings,
       COUNT(1) as count
     FROM payments
     WHERE creator_id = $1 AND status = 'succeeded'
     GROUP BY type`,
    [userId]
  );
  return result.rows;
}

async function fetchStripeBalance(stripeAccountId: string): Promise<{
  available: number;
  pending: number;
  currency: string;
} | null> {
  const stripe = await getStripeClient();
  try {
    const balance = await safeStripeCall(
      () => stripe.balance.retrieve({ stripeAccount: stripeAccountId }),
      'balance.retrieve', log, { timeoutMs: 5000 }
    );
    return {
      available: balance.available.reduce((sum, b) => sum + b.amount, 0),
      pending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
      currency: balance.available[0]?.currency || 'usd',
    };
  } catch {
    // Stripe account may not be fully set up or Stripe is unavailable
    return null;
  }
}

// ─── Dashboard ───

/**
 * Get comprehensive creator dashboard data
 */
async function getDashboard(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify user is a creator
    const profile = await fetchCreatorProfile(client, userId);

    if (!profile) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    if (!['pro_creator', 'pro_business'].includes(profile.account_type as string)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Only Pro accounts can access wallet' }),
      };
    }

    const fanCount = Number.parseInt(profile.fan_count as string) || 0;
    const tier = getTierInfo(fanCount);

    const [lifetime, month, activeSubscribers, breakdown, stripeBalance] = await Promise.all([
      fetchLifetimeEarnings(client, userId),
      fetchMonthEarnings(client, userId),
      fetchSubscriberCount(client, userId),
      fetchEarningsBreakdown(client, userId),
      profile.stripe_account_id
        ? fetchStripeBalance(profile.stripe_account_id as string)
        : Promise.resolve(null),
    ]);

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
              total: Number.parseInt(lifetime.total_earnings) || 0,
              transactions: Number.parseInt(lifetime.total_transactions) || 0,
            },
            thisMonth: {
              total: Number.parseInt(month.month_earnings) || 0,
              transactions: Number.parseInt(month.month_transactions) || 0,
            },
            breakdown: breakdown.map((b: Record<string, unknown>) => ({
              type: b.type,
              earnings: Number.parseInt(b.earnings as string) || 0,
              count: Number.parseInt(b.count as string) || 0,
            })),
          },
          subscribers: {
            active: activeSubscribers,
          },
          balance: stripeBalance,
        },
      }),
    };
  } finally {
    client.release();
  }
}

// ─── Transaction query builder ───

function buildTransactionQuery(userId: string, options: WalletBody): TransactionQueryResult {
  const limit = Math.min(options.limit || 20, 50);
  const type = options.type || 'all';

  const params: SqlParam[] = [userId];

  // Cursor-based pagination on created_at
  let cursorCondition = '';
  if (options.cursor) {
    const parsedDate = new Date(options.cursor);
    if (!Number.isNaN(parsedDate.getTime())) {
      params.push(parsedDate.toISOString());
      cursorCondition = `AND p.created_at < $${params.length}::timestamptz`;
    }
  }

  let typeFilter = '';
  if (type !== 'all') {
    params.push(type);
    typeFilter = `AND type = $${params.length}`;
  }

  params.push(limit + 1);
  const limitIdx = params.length;

  const sql = `SELECT
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
     WHERE p.creator_id = $1 ${cursorCondition} ${typeFilter}
     ORDER BY p.created_at DESC
     LIMIT $${limitIdx}`;

  return { sql, params, limit };
}

// ─── Transactions ───

/**
 * Get transaction history with filtering
 */
async function getTransactions(userId: string, options: WalletBody, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const { sql, params, limit } = buildTransactionQuery(userId, options);
    const result = await client.query(sql, params);

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const nextCursor = hasMore && rows.length > 0
      ? new Date(rows.at(-1)!.created_at as string).toISOString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        transactions: rows.map((row: Record<string, unknown>) => ({
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
        nextCursor,
        hasMore,
      }),
    };
  } finally {
    client.release();
  }
}

// ─── Analytics helpers ───

function getAnalyticsPeriodConfig(period: string): AnalyticsPeriodConfig {
  switch (period) {
    case 'day':
      return { interval: '24 hours', truncation: 'hour', dateFormat: 'hour' };
    case 'week':
      return { interval: '7 days', truncation: 'day', dateFormat: 'day' };
    case 'month':
      return { interval: '30 days', truncation: 'day', dateFormat: 'day' };
    case 'year':
      return { interval: '12 months', truncation: 'month', dateFormat: 'month' };
    default:
      return { interval: null, truncation: 'month', dateFormat: 'month' };
  }
}

async function fetchEarningsTimeline(client: PoolClient, userId: string, config: AnalyticsPeriodConfig) {
  const result = await client.query(
    `SELECT
       date_trunc($2, created_at) as period,
       COALESCE(SUM(creator_amount), 0) as earnings,
       COUNT(1) as transactions
     FROM payments
     WHERE creator_id = $1 AND status = 'succeeded'
       AND ($3::interval IS NULL OR created_at >= NOW() - $3::interval)
     GROUP BY date_trunc($2, created_at)
     ORDER BY date_trunc($2, created_at)`,
    [userId, config.truncation, config.interval]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    period: row.period,
    earnings: Number.parseInt(row.earnings as string) || 0,
    transactions: Number.parseInt(row.transactions as string) || 0,
  }));
}

async function fetchTopBuyers(client: PoolClient, userId: string, interval: string | null) {
  const result = await client.query(
    `SELECT
       buyer.id,
       buyer.username,
       buyer.full_name,
       buyer.avatar_url,
       COALESCE(SUM(p.creator_amount), 0) as total_spent,
       COUNT(1) as transaction_count
     FROM payments p
     JOIN profiles buyer ON p.buyer_id = buyer.id
     WHERE p.creator_id = $1 AND p.status = 'succeeded'
       AND ($2::interval IS NULL OR p.created_at >= NOW() - $2::interval)
     GROUP BY buyer.id, buyer.username, buyer.full_name, buyer.avatar_url
     ORDER BY total_spent DESC
     LIMIT 10`,
    [userId, interval]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    username: row.username,
    name: row.full_name,
    avatar: row.avatar_url,
    totalSpent: Number.parseInt(row.total_spent as string) || 0,
    transactionCount: Number.parseInt(row.transaction_count as string) || 0,
  }));
}

async function fetchEarningsBySource(client: PoolClient, userId: string, interval: string | null) {
  const result = await client.query(
    `SELECT
       source,
       COALESCE(SUM(creator_amount), 0) as earnings,
       COUNT(1) as count
     FROM payments
     WHERE creator_id = $1 AND status = 'succeeded'
       AND ($2::interval IS NULL OR created_at >= NOW() - $2::interval)
     GROUP BY source`,
    [userId, interval]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    source: row.source,
    earnings: Number.parseInt(row.earnings as string) || 0,
    count: Number.parseInt(row.count as string) || 0,
  }));
}

// ─── Analytics ───

/**
 * Get revenue analytics for a period
 */
async function getAnalytics(userId: string, period: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const config = getAnalyticsPeriodConfig(period);

    const [timeline, topBuyers, bySource] = await Promise.all([
      fetchEarningsTimeline(client, userId, config),
      fetchTopBuyers(client, userId, config.interval),
      fetchEarningsBySource(client, userId, config.interval),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analytics: {
          period,
          dateFormat: config.dateFormat,
          timeline,
          topBuyers,
          bySource,
        },
      }),
    };
  } finally {
    client.release();
  }
}

// ─── Balance ───

/**
 * Get Stripe Connect balance
 */
async function getBalance(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
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
        body: JSON.stringify({ success: false, message: 'Stripe Connect not set up' }),
      };
    }

    const balance = await safeStripeCall(
      () => stripe.balance.retrieve({ stripeAccount: result.rows[0].stripe_account_id }),
      'balance.retrieve', log
    );

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

// ─── Payouts ───

/**
 * Get payout history
 */
async function getPayouts(userId: string, limit: number, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
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
        body: JSON.stringify({ success: false, message: 'Stripe Connect not set up' }),
      };
    }

    const payouts = await safeStripeCall(
      () => stripe.payouts.list(
        { limit: Math.min(limit, 50) },
        { stripeAccount: result.rows[0].stripe_account_id }
      ),
      'payouts.list', log
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

// ─── Create Payout ───

/**
 * Request a payout (if instant payouts are available)
 */
async function createPayout(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
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
        body: JSON.stringify({ success: false, message: 'Stripe Connect not set up' }),
      };
    }

    const stripeAccountId = result.rows[0].stripe_account_id;

    // Get available balance
    const balance = await safeStripeCall(
      () => stripe.balance.retrieve({ stripeAccount: stripeAccountId }),
      'balance.retrieve', log
    );

    const availableAmount = balance.available.find(b => b.currency === 'usd')?.amount || 0;

    if (availableAmount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'No available balance to payout' }),
      };
    }

    // Create payout
    const payout = await safeStripeCall(
      () => stripe.payouts.create(
        { amount: availableAmount, currency: 'usd' },
        { stripeAccount: stripeAccountId }
      ),
      'payouts.create', log
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

// ─── Stripe Dashboard Link ───

/**
 * Get link to Stripe Express Dashboard
 * This allows creators to manage their account, bank details, and view detailed reports
 */
async function getStripeDashboardLink(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
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
        body: JSON.stringify({ success: false, message: 'Stripe Connect not set up' }),
      };
    }

    const loginLink = await safeStripeCall(
      () => stripe.accounts.createLoginLink(result.rows[0].stripe_account_id),
      'accounts.createLoginLink', log
    );

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
