/**
 * Tests for business-checkout Lambda handler
 * Validates Stripe Checkout Session creation for business services
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as _handler } from '../../payments/business-checkout';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;

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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_BIZ_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_SERVICE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

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
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/business-checkout handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(401);
  });

  it('returns 405 for GET method', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const event = makeEvent({ httpMethod: 'GET' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(405);
  });

  it('returns 400 when businessId missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    // businessId is undefined in body, so !businessId short-circuits without calling isValidUUID
    const event = makeEvent({
      body: JSON.stringify({ serviceId: TEST_SERVICE_ID }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('businessId');
  });

  it('returns 400 when serviceId missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    // serviceId is undefined in body, so !serviceId short-circuits without calling isValidUUID
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('serviceId');
  });

  it('returns 400 for invalid date format', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID, serviceId: TEST_SERVICE_ID, date: '2025/01/01' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('YYYY-MM-DD');
  });

  it('returns 404 when user profile not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // user not found
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID, serviceId: TEST_SERVICE_ID }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('User not found');
  });

  it('returns 404 when service not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }] })
      .mockResolvedValueOnce({ rows: [] }); // service not found
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID, serviceId: TEST_SERVICE_ID }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(404);
    expect(JSON.parse(result!.body).message).toBe('Service not found');
  });

  it('returns 200 with checkout URL for drop_in service', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'p1', email: 'test@test.com', full_name: 'Test', username: 'test', stripe_customer_id: 'cus_test' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SERVICE_ID, name: 'Yoga Class', description: 'desc', category: 'drop_in',
          price_cents: 2000, duration_minutes: 60, is_subscription: false, subscription_period: null,
          trial_days: 0, is_active: true, max_capacity: 20,
          business_profile_id: TEST_BIZ_ID, business_name: 'Yoga Studio', stripe_account_id: 'acct_test',
        }],
      });
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID, serviceId: TEST_SERVICE_ID, date: '2025-06-01' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.checkoutUrl).toBeDefined();
    expect(body.sessionId).toBe('cs_test');
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('Unexpected'); });
    const event = makeEvent({
      body: JSON.stringify({ businessId: TEST_BIZ_ID, serviceId: TEST_SERVICE_ID }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(500);
  });
});
