/**
 * Tests for web-checkout Lambda handler
 * Validates Stripe Checkout Session creation for web payments
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/web-checkout';

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
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    products: { create: jest.fn().mockResolvedValue({ id: 'prod_test' }) },
    prices: { create: jest.fn().mockResolvedValue({ id: 'price_test' }) },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test', expires_at: 1234567890 }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'cs_test', status: 'complete', payment_status: 'paid',
          metadata: { productType: 'session', userId: 'cognito-sub-test123' },
          amount_total: 5000, currency: 'eur',
        }),
      },
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

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
    path: overrides.path as string ?? '/payments/web-checkout',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/web-checkout handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(429);
  });

  it('POST returns 400 when productType missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }],
    });
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('productType is required');
  });

  it('POST returns 404 when user not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ productType: 'session' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(404);
  });

  it('POST returns 400 for invalid productType', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }],
    });
    const event = makeEvent({ body: JSON.stringify({ productType: 'invalid_type' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid productType');
  });

  it('POST session returns 400 when productId missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }],
    });
    const event = makeEvent({ body: JSON.stringify({ productType: 'session' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('productId');
  });

  it('POST tip returns 400 when amount out of range', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }],
    });
    const event = makeEvent({ body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 0.50 }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid tip amount');
  });

  it('POST platform_subscription returns 400 when planType missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }],
    });
    const event = makeEvent({ body: JSON.stringify({ productType: 'platform_subscription' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('planType');
  });

  it('GET returns session status', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const event = makeEvent({
      httpMethod: 'GET',
      path: '/payments/web-checkout/status/cs_test',
    });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('complete');
  });

  it('returns 405 for unsupported method', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const event = makeEvent({ httpMethod: 'PUT' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(405);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('Unexpected'); });
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(500);
  });
});
