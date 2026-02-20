/**
 * Tests for refunds Lambda handler
 * Validates refund creation, listing, and detail retrieval
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as _handler } from '../../payments/refunds';
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
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
      retrieve: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
    },
  }),
}));

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn().mockReturnValue({ id: 'cognito-sub-test123', sub: 'cognito-sub-test123' }),
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PAYMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/payments/refunds',
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

describe('payments/refunds handler', () => {
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

  it('returns 204 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValueOnce(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(404);
  });

  it('GET /payments/refunds lists refunds', async () => {
    // admin check
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
      // refunds query
      .mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.refunds).toBeDefined();
  });

  it('POST /payments/refunds returns 400 when paymentId missing', async () => {
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/refunds',
      body: JSON.stringify({ reason: 'duplicate' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('paymentId and reason are required');
  });

  it('POST /payments/refunds returns 400 for invalid reason', async () => {
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/refunds',
      body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'revenge' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid refund reason');
  });

  it('POST /payments/refunds returns 400 for invalid paymentId UUID', async () => {
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/refunds',
      body: JSON.stringify({ paymentId: 'bad-id', reason: 'duplicate' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid paymentId format');
  });

  it('POST /payments/refunds returns 404 when payment not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }); // admin check
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // payment not found

    const event = makeEvent({
      httpMethod: 'POST',
      path: '/payments/refunds',
      body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
    });
    const result = await handler(event);
    expect(result!.statusCode).toBe(404);
  });

  it('returns 405 for unsupported method', async () => {
    const event = makeEvent({ httpMethod: 'PUT', path: '/payments/refunds' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(405);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('Unexpected'); });
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(500);
  });
});
