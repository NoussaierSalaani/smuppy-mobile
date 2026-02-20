/**
 * Tests for platform-subscription Lambda handler
 * Validates Pro Creator / Pro Business subscription flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/platform-subscription';

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
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    },
    products: {
      search: jest.fn().mockResolvedValue({ data: [{ id: 'prod_test' }] }),
      create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
    },
    prices: {
      list: jest.fn().mockResolvedValue({ data: [{ id: 'price_test' }] }),
      create: jest.fn().mockResolvedValue({ id: 'price_test' }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }),
      },
    },
    subscriptions: {
      update: jest.fn().mockResolvedValue({ id: 'sub_test', cancel_at: 1234567890 }),
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' }),
      },
    },
  }),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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

describe('payments/platform-subscription handler', () => {
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
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('subscribe returns 400 for invalid planType', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe', planType: 'free_tier' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid plan type');
  });

  it('subscribe returns 400 when already subscribed', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', account_type: 'pro_creator' }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe', planType: 'pro_creator' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Already subscribed to a Pro plan');
  });

  it('subscribe returns 200 with checkout URL for pro_creator', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', account_type: 'personal' }],
      });
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe', planType: 'pro_creator' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.checkoutUrl).toBeDefined();
    expect(body.sessionId).toBe('cs_test');
  });

  it('get-status returns no subscription when none exists', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasSubscription).toBe(false);
    expect(body.status).toBe('none');
  });

  it('cancel returns 404 when no active subscription', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('get-portal-link returns 400 when no stripe customer', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-portal-link' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
