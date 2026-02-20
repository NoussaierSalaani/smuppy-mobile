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
        instant_available: [],
      }),
    },
    payouts: {
      list: jest.fn().mockResolvedValue({ data: [] }),
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

  it('returns 200 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
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

  it('get-dashboard returns 403 for non-pro accounts', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', account_type: 'personal', stripe_account_id: null, is_verified: false, fan_count: '0' }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('get-dashboard returns 200 with dashboard data for pro_creator', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', account_type: 'pro_creator', stripe_account_id: 'acct_test', is_verified: true, fan_count: '500' }],
      })
      .mockResolvedValueOnce({ rows: [{ total_earnings: '50000', total_transactions: '10' }] })
      .mockResolvedValueOnce({ rows: [{ month_earnings: '10000', month_transactions: '3' }] })
      .mockResolvedValueOnce({ rows: [{ subscriber_count: '5' }] })
      .mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.dashboard).toBeDefined();
    expect(body.dashboard.tier.name).toBe('Bronze');
  });

  it('get-balance returns 400 when no Stripe Connect', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('get-payouts returns 400 when no Stripe Connect', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-payouts' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('get-transactions returns 200', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-transactions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.transactions).toBeDefined();
  });

  it('get-analytics returns 200', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // timeline
      .mockResolvedValueOnce({ rows: [] }) // top buyers
      .mockResolvedValueOnce({ rows: [] }); // by source
    const event = makeEvent({ body: JSON.stringify({ action: 'get-analytics', period: 'month' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.analytics).toBeDefined();
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
