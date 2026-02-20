/**
 * Tests for create-intent Lambda handler
 * Validates payment intent creation for sessions and packs
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/create-intent';

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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test',
        client_secret: 'pi_test_secret',
        amount: 5000,
        currency: 'usd',
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    },
  }),
}));

jest.mock('../../../shared/secrets', () => ({
  getStripePublishableKey: jest.fn().mockResolvedValue('pk_test_123'),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/constants', () => ({
  PLATFORM_FEE_PERCENT: 20,
  APPLE_FEE_PERCENT: 30,
  GOOGLE_FEE_PERCENT: 30,
  MIN_PAYMENT_CENTS: 100,
  MAX_PAYMENT_CENTS: 5000000,
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
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

describe('payments/create-intent handler', () => {
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
    };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    });

    const event = makeEvent({
      body: JSON.stringify({ creatorId: TEST_CREATOR_ID, amount: 5000 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 400 when creatorId or amount missing', async () => {
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('creatorId and amount are required');
  });

  it('returns 400 for invalid currency', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        currency: 'btc',
        sessionId: 'sess-123',
        type: 'session',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid currency');
  });

  it('returns 400 when neither sessionId nor packId provided', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
      }),
    });
    // Session query returns empty
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('sessionId or packId is required');
  });

  it('returns 404 when session not found', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
      }),
    });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // session lookup
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Session not found');
  });

  it('returns 404 when buyer profile not found', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
      }),
    });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] }) // session found
      .mockResolvedValueOnce({ rows: [] }); // buyer not found
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('returns 404 when creator not found', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
      }),
    });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] }) // session
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, email: 'test@test.com', full_name: 'Test' }] }) // buyer
      .mockResolvedValueOnce({ rows: [] }); // creator not found
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Creator not found');
  });

  it('returns 200 with in-app purchase info for iOS source', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
        source: 'ios',
      }),
    });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] }) // session
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, email: 'test@test.com', full_name: 'Test' }] }) // buyer
      .mockResolvedValueOnce({ rows: [{ id: TEST_CREATOR_ID, full_name: 'Creator', stripe_account_id: 'acct_test' }] }) // creator
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] }); // customer

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.requiresInAppPurchase).toBe(true);
    expect(body.source).toBe('ios');
    expect(body.priceBreakdown).toBeDefined();
  });

  it('returns 409 when existing payment in progress', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
        source: 'web',
      }),
    });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] }) // session
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, email: 'test@test.com', full_name: 'Test' }] }) // buyer
      .mockResolvedValueOnce({ rows: [{ id: TEST_CREATOR_ID, full_name: 'Creator', stripe_account_id: 'acct_test' }] }) // creator
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] }) // customer
      .mockResolvedValueOnce({ rows: [{ stripe_payment_intent_id: 'pi_existing' }] }); // existing payment

    const result = await handler(event);
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toContain('already in progress');
  });

  it('returns 200 with payment intent for web purchase happy path', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
        source: 'web',
      }),
    });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ price: '50.00' }] }) // session
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, email: 'test@test.com', full_name: 'Test' }] }) // buyer
      .mockResolvedValueOnce({ rows: [{ id: TEST_CREATOR_ID, full_name: 'Creator', stripe_account_id: 'acct_test' }] }) // creator
      .mockResolvedValueOnce({ rows: [{ stripe_customer_id: 'cus_existing' }] }) // customer
      .mockResolvedValueOnce({ rows: [] }) // no existing payment
      .mockResolvedValueOnce({ rows: [] }); // insert payment record

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.paymentIntent).toBeDefined();
    expect(body.paymentIntent.id).toBe('pi_test');
    expect(body.paymentIntent.clientSecret).toBe('pi_test_secret');
    expect(body.priceBreakdown).toBeDefined();
    expect(body.publishableKey).toBe('pk_test_123');
  });

  it('returns 500 on unexpected error', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        creatorId: TEST_CREATOR_ID,
        amount: 5000,
        type: 'session',
        sessionId: 'sess-123',
      }),
    });
    mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
