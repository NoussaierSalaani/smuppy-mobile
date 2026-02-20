/**
 * Tests for Stripe Identity Lambda handler
 * Validates identity verification subscription and session flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/identity';

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
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_secret', amount: 1490 }),
      retrieve: jest.fn().mockResolvedValue({ id: 'pi_test', status: 'succeeded', metadata: { userId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({ id: 'sub_test', status: 'active' }),
      create: jest.fn().mockResolvedValue({
        id: 'sub_test',
        latest_invoice: { payment_intent: { client_secret: 'cs_sub_secret' } },
      }),
      update: jest.fn().mockResolvedValue({ id: 'sub_test', cancel_at: 1234567890, current_period_end: 1234567890 }),
    },
    identity: {
      verificationSessions: {
        create: jest.fn().mockResolvedValue({ id: 'vs_test', url: 'https://verify.stripe.com/test', status: 'requires_input' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'vs_test', status: 'verified', url: 'https://verify.stripe.com/test', last_error: null, created: 1234567890, verified_outputs: { id_number_type: 'passport' } }),
      },
    },
    products: {
      search: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
    },
    prices: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'price_test' }),
      retrieve: jest.fn().mockResolvedValue({ id: 'price_test', unit_amount: 1490, currency: 'usd', recurring: { interval: 'month' } }),
    },
  }),
}));

jest.mock('../../../shared/secrets', () => ({
  getStripePublishableKey: jest.fn().mockResolvedValue('pk_test_123'),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/constants', () => ({
  VERIFICATION_FEE_CENTS: 1490,
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
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

describe('payments/identity handler', () => {
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
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }),
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

  it('returns 400 for invalid returnUrl', async () => {
    const event = makeEvent({
      body: JSON.stringify({ action: 'create-session', returnUrl: 'https://evil.com/phish' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid return URL');
  });

  it('get-status returns not_started when no verification session', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ identity_verification_session_id: null, is_verified: false }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.status).toBe('not_started');
    expect(body.isVerified).toBe(false);
  });

  it('confirm-subscription returns 400 when returnUrl missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('returnUrl is required');
  });

  it('confirm-payment returns 400 when paymentIntentId or returnUrl missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-payment' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('paymentIntentId and returnUrl are required');
  });

  it('create-session returns 400 when returnUrl missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session' }) });
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
