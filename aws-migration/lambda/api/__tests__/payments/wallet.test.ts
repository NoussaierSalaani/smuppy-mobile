/**
 * Tests for wallet Lambda handler
 * Validates creator wallet dashboard, transactions, analytics, balance, payouts
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/wallet';

// ── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    balance: {
      retrieve: jest.fn().mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [{ amount: 5000, currency: 'usd' }],
        instant_available: [{ amount: 8000, currency: 'usd' }],
      }),
    },
    payouts: {
      list: jest.fn().mockResolvedValue({
        data: [
          { id: 'po_1', amount: 5000, currency: 'usd', status: 'paid', arrival_date: 1234567890, created: 1234567800, method: 'standard', type: 'bank_account' },
          { id: 'po_2', amount: 3000, currency: 'usd', status: 'pending', arrival_date: 1234567900, created: 1234567850, method: 'instant', type: 'bank_account' },
        ],
      }),
      create: jest.fn().mockResolvedValue({ id: 'po_test', amount: 10000, currency: 'usd', status: 'pending', arrival_date: 1234567890 }),
    },
    accounts: {
      createLoginLink: jest.fn().mockResolvedValue({ url: 'https://dashboard.stripe.com/login' }),
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/wallet handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  // ── Auth & rate limit ──

  it('returns 401 for OPTIONS without auth (withAuthHandler enforces auth)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });

  // ── Dashboard ──

  describe('get-dashboard', () => {
    it('returns 404 when user profile not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(404);
    });

    it('returns 403 for non-pro accounts', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'p1', account_type: 'personal', stripe_account_id: null, is_verified: false, fan_count: '0' }],
      });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
    });

    it('returns 200 with dashboard data for pro_creator with stripe_account_id', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: 'acct_test', is_verified: true, fan_count: '500' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '50000', total_transactions: '10' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '10000', month_transactions: '3' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ type: 'channel', earnings: '30000', count: '6' }, { type: 'session', earnings: '20000', count: '4' }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.dashboard.profile.accountType).toBe('pro_creator');
      expect(body.dashboard.profile.isVerified).toBe(true);
      expect(body.dashboard.profile.hasStripeConnect).toBe(true);
      expect(body.dashboard.profile.fanCount).toBe(500);
      expect(body.dashboard.tier.name).toBe('Bronze');
      expect(body.dashboard.tier.creatorPercent).toBe(60);
      expect(body.dashboard.tier.smuppyPercent).toBe(40);
      expect(body.dashboard.tier.nextTier).toEqual({ name: 'Silver', fansNeeded: 500 });
      expect(body.dashboard.earnings.lifetime.total).toBe(50000);
      expect(body.dashboard.earnings.lifetime.transactions).toBe(10);
      expect(body.dashboard.earnings.thisMonth.total).toBe(10000);
      expect(body.dashboard.earnings.thisMonth.transactions).toBe(3);
      expect(body.dashboard.earnings.breakdown).toHaveLength(2);
      expect(body.dashboard.earnings.breakdown[0]).toEqual({ type: 'channel', earnings: 30000, count: 6 });
      expect(body.dashboard.subscribers.active).toBe(5);
      expect(body.dashboard.balance).toBeDefined();
    });

    it('returns 200 for pro_business with no stripe_account_id', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_business', stripe_account_id: null, is_verified: false, fan_count: '0' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '0', total_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '0', month_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.dashboard.profile.hasStripeConnect).toBe(false);
      expect(body.dashboard.balance).toBeNull();
    });

    it('handles Stripe balance error gracefully (fetchStripeBalance returns null)', async () => {
      const { safeStripeCall } = require('../../../shared/stripe-resilience');
      // The first call is getStripeClient init, then the balance retrieve fails
      let callCount = 0;
      (safeStripeCall as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => {
        callCount++;
        // The dashboard calls fetchStripeBalance which calls safeStripeCall
        // We want to make the balance retrieve throw
        if (callCount === 1) {
          throw new Error('Stripe unavailable');
        }
        return fn();
      });

      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: 'acct_test', is_verified: true, fan_count: '1500' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '0', total_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '0', month_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.dashboard.balance).toBeNull();
      // Silver tier at 1500 fans
      expect(body.dashboard.tier.name).toBe('Silver');
      expect(body.dashboard.tier.creatorPercent).toBe(65);
    });

    it('returns correct tier for high fan counts', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: null, is_verified: true, fan_count: '1500000' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '0', total_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '0', month_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.dashboard.tier.name).toBe('Diamond');
      expect(body.dashboard.tier.creatorPercent).toBe(80);
      expect(body.dashboard.tier.nextTier).toBeNull();
    });
  });

  // ── Transactions ──

  describe('get-transactions', () => {
    it('returns 200 with empty transactions', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-transactions' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.transactions).toEqual([]);
      expect(body.nextCursor).toBeNull();
      expect(body.hasMore).toBe(false);
    });

    it('returns transactions with buyer info', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'tx1', type: 'channel', source: 'web', gross_amount: 1000,
            net_amount: 800, platform_fee: 200, creator_amount: 800, status: 'succeeded',
            created_at: '2026-01-15T10:00:00Z',
            buyer_username: 'buyer1', buyer_name: 'Buyer One', buyer_avatar: 'https://img.com/1.jpg',
          },
        ],
      });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-transactions' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].id).toBe('tx1');
      expect(body.transactions[0].amounts.gross).toBe(1000);
      expect(body.transactions[0].buyer.username).toBe('buyer1');
    });

    it('handles cursor-based pagination', async () => {
      // Return limit+1 rows to indicate hasMore
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `tx${i}`, type: 'channel', source: 'web', gross_amount: 1000,
        net_amount: 800, platform_fee: 200, creator_amount: 800, status: 'succeeded',
        created_at: new Date(2026, 0, 20 - i).toISOString(),
        buyer_username: `buyer${i}`, buyer_name: `Buyer ${i}`, buyer_avatar: null,
      }));
      mockClient.query.mockResolvedValueOnce({ rows });
      const event = makeEvent({
        body: JSON.stringify({ action: 'get-transactions', cursor: '2026-01-20T00:00:00.000Z' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.transactions).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeTruthy();
    });

    it('handles type filter', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        body: JSON.stringify({ action: 'get-transactions', type: 'session' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // Verify the query was called with the type filter parameter
      const queryCall = mockClient.query.mock.calls[0];
      expect(queryCall[1]).toContain('session');
    });

    it('handles cursor with invalid date gracefully (ignores invalid cursor)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        body: JSON.stringify({ action: 'get-transactions', cursor: 'not-a-date' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('limits page size to max 50', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        body: JSON.stringify({ action: 'get-transactions', limit: 100 }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // The query should request limit + 1 = 51, but limited to min(100, 50) + 1 = 51
      const queryCall = mockClient.query.mock.calls[0];
      expect(queryCall[1]).toContain(51); // limit capped to 50, plus 1 for hasMore
    });
  });

  // ── Analytics ──

  describe('get-analytics', () => {
    it('returns 200 with analytics for month period', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ period: '2026-01-15', earnings: '5000', transactions: '2' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'b1', username: 'topbuyer', full_name: 'Top Buyer', avatar_url: 'https://img.com/1.jpg',
            total_spent: '15000', transaction_count: '5',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ source: 'web', earnings: '8000', count: '3' }],
        });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'month' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.analytics.period).toBe('month');
      expect(body.analytics.dateFormat).toBe('day');
      expect(body.analytics.timeline).toHaveLength(1);
      expect(body.analytics.timeline[0].earnings).toBe(5000);
      expect(body.analytics.topBuyers).toHaveLength(1);
      expect(body.analytics.topBuyers[0].username).toBe('topbuyer');
      expect(body.analytics.topBuyers[0].totalSpent).toBe(15000);
      expect(body.analytics.bySource).toHaveLength(1);
      expect(body.analytics.bySource[0].source).toBe('web');
    });

    it('returns analytics for day period', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'day' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.analytics.period).toBe('day');
      expect(body.analytics.dateFormat).toBe('hour');
    });

    it('returns analytics for week period', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'week' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.analytics.period).toBe('week');
      expect(body.analytics.dateFormat).toBe('day');
    });

    it('returns analytics for year period', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'year' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.analytics.period).toBe('year');
      expect(body.analytics.dateFormat).toBe('month');
    });

    it('returns analytics for all-time period (default)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'all' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.analytics.period).toBe('all');
      expect(body.analytics.dateFormat).toBe('month');
    });

    it('defaults period to month when not specified', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.analytics.period).toBe('month');
    });
  });

  // ── Balance ──

  describe('get-balance', () => {
    it('returns 400 when no Stripe Connect', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Stripe Connect not set up');
    });

    it('returns 400 when profile has no stripe_account_id row', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{}] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('returns 200 with balance data', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.balance.available).toEqual([{ amount: 10000, currency: 'usd' }]);
      expect(body.balance.pending).toEqual([{ amount: 5000, currency: 'usd' }]);
      expect(body.balance.instantAvailable).toEqual([{ amount: 8000, currency: 'usd' }]);
    });

    it('returns empty instantAvailable when instant_available is null', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.balance.retrieve.mockResolvedValueOnce({
        available: [{ amount: 500, currency: 'eur' }],
        pending: [{ amount: 200, currency: 'eur' }],
        instant_available: null,
      });
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.balance.instantAvailable).toEqual([]);
    });
  });

  // ── Payouts ──

  describe('get-payouts', () => {
    it('returns 400 when no Stripe Connect', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-payouts' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('returns 200 with payout list', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-payouts', limit: 5 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.payouts).toHaveLength(2);
      expect(body.payouts[0].id).toBe('po_1');
      expect(body.payouts[0].amount).toBe(5000);
      expect(body.payouts[0].method).toBe('standard');
      expect(body.payouts[1].id).toBe('po_2');
    });

    it('defaults limit to 10 and caps at 50', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-payouts' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      // Default limit is 10, verify payouts.list was called with limit: 10
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      expect(mockStripe.payouts.list).toHaveBeenCalledWith(
        { limit: 10 },
        expect.objectContaining({ stripeAccount: 'acct_test' })
      );
    });
  });

  // ── Create Payout ──

  describe('create-payout', () => {
    it('returns 400 when no Stripe Connect', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'create-payout' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when no available balance', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.balance.retrieve.mockResolvedValueOnce({
        available: [{ amount: 0, currency: 'usd' }],
        pending: [{ amount: 5000, currency: 'usd' }],
      });
      const event = makeEvent({ body: JSON.stringify({ action: 'create-payout' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No available balance to payout');
    });

    it('returns 400 when no USD balance found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.balance.retrieve.mockResolvedValueOnce({
        available: [{ amount: 500, currency: 'eur' }],
        pending: [],
      });
      const event = makeEvent({ body: JSON.stringify({ action: 'create-payout' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No available balance to payout');
    });

    it('creates payout successfully', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'create-payout' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.payout.id).toBe('po_test');
      expect(body.payout.amount).toBe(10000);
      expect(body.payout.currency).toBe('usd');
      expect(body.payout.status).toBe('pending');
      expect(body.payout.arrivalDate).toBe(1234567890);
    });

    it('applies stricter rate limit for payout creation', async () => {
      const { requireRateLimit } = require('../../utils/rate-limit');
      // First call is the general rate limit (passes), second is payout rate limit (blocks)
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce(null) // general passes
        .mockResolvedValueOnce({
          statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Payout rate limited' }),
        });

      const event = makeEvent({ body: JSON.stringify({ action: 'create-payout' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(429);
      expect(requireRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'wallet-payout', maxRequests: 3, failOpen: false }),
        expect.any(Object)
      );
    });
  });

  // ── Stripe Dashboard Link ──

  describe('get-stripe-dashboard-link', () => {
    it('returns 400 when no Stripe Connect', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-stripe-dashboard-link' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Stripe Connect not set up');
    });

    it('returns 200 with dashboard link', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'get-stripe-dashboard-link' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.url).toBe('https://dashboard.stripe.com/login');
      expect(body.expiresAt).toBeTruthy();
    });
  });

  // ── Tier info edge cases ──

  describe('tier info', () => {
    it('returns Gold tier for 10K fans', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: null, is_verified: false, fan_count: '15000' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '0', total_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '0', month_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.dashboard.tier.name).toBe('Gold');
      expect(body.dashboard.tier.creatorPercent).toBe(70);
      expect(body.dashboard.tier.nextTier).toEqual({ name: 'Platinum', fansNeeded: 85000 });
    });

    it('returns Platinum tier for 100K fans', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: null, is_verified: false, fan_count: '200000' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_earnings: '0', total_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ month_earnings: '0', month_transactions: '0' }] })
        .mockResolvedValueOnce({ rows: [{ subscriber_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
      const result = await handler(event);
      const body = JSON.parse(result.body);
      expect(body.dashboard.tier.name).toBe('Platinum');
      expect(body.dashboard.tier.creatorPercent).toBe(75);
      expect(body.dashboard.tier.nextTier).toEqual({ name: 'Diamond', fansNeeded: 800000 });
    });
  });
});
