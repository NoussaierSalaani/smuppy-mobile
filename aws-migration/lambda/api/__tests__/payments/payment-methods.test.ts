/**
 * Tests for payment-methods Lambda handler
 * Validates list, attach, detach, set-default, and setup-intent flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/payment-methods';

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

// Use a getter pattern to avoid hoisting issue: jest.mock is hoisted above variable declarations
const getMockStripe = () => mockStripe;

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockImplementation(() => Promise.resolve(getMockStripe())),
}));

const mockStripe = {
  paymentMethods: {
    list: jest.fn().mockResolvedValue({ data: [] }),
    attach: jest.fn().mockResolvedValue({
      id: 'pm_test', type: 'card',
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
      billing_details: { name: 'Test User', email: 'test@test.com' },
      created: 1234567890,
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'pm_test', customer: 'cus_test', type: 'card',
    }),
    detach: jest.fn().mockResolvedValue({ id: 'pm_test' }),
  },
  customers: {
    create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'cus_test',
      invoice_settings: { default_payment_method: null },
    }),
    update: jest.fn().mockResolvedValue({ id: 'cus_test' }),
  },
  setupIntents: {
    create: jest.fn().mockResolvedValue({ id: 'seti_test', client_secret: 'seti_secret' }),
  },
};

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/payments/methods',
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

describe('payments/payment-methods handler', () => {
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

  it('GET /payments/methods lists payment methods', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'profile-1', stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', username: 'test' }],
    });

    const event = makeEvent({ httpMethod: 'GET', path: '/payments/methods' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.paymentMethods)).toBe(true);
  });

  it('POST /payments/methods returns 400 when paymentMethodId missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'profile-1', stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', username: 'test' }],
    });

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/methods',
      body: JSON.stringify({}),
    });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('paymentMethodId is required');
  });

  it('POST /payments/methods/setup-intent creates setup intent', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'profile-1', stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', username: 'test' }],
    });

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/methods/setup-intent',
    });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.setupIntent).toBeDefined();
    expect(body.setupIntent.id).toBe('seti_test');
  });

  it('DELETE returns 403 when payment method belongs to another customer', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'profile-1', stripe_customer_id: 'cus_test', email: 'test@test.com', full_name: 'Test', username: 'test' }],
    });
    mockStripe.paymentMethods.retrieve.mockResolvedValueOnce({
      id: 'pm_test', customer: 'cus_other',
    });

    const event = makeEvent({
      httpMethod: 'DELETE',
      path: '/payments/methods/pm_test',
    });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(403);
  });

  it('returns 405 for unsupported method', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const event = makeEvent({ httpMethod: 'PATCH', path: '/payments/methods' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(405);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ sub: TEST_SUB, id: TEST_SUB });
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockRejectedValueOnce(new Error('Unexpected'));
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(500);
  });
});
