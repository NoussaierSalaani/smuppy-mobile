/**
 * Tests for business/log-entry Lambda handler
 * POST /businesses/log-entry — records member check-in at a business facility
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
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
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

import { handler } from '../../business/log-entry';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_SUB_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

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
    path: '/businesses/log-entry',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-req',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ──

describe('business/log-entry handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }));
    expect(result.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
    });
    const result = await handler(makeEvent({ body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: TEST_SUB }) }));
    expect(result.statusCode).toBe(429);
  });

  it('returns 400 for invalid JSON body', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({ body: 'not-json{' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
  });

  it('returns 400 when required fields are missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Missing required fields');
  });

  it('returns 400 for invalid UUID format', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: 'bad-uuid', businessId: TEST_SUB }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('returns 403 when businessId does not match user.id', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const otherBusiness = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: otherBusiness }),
    }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('You can only log entries for your own business');
  });

  it('returns 404 when subscription not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: TEST_SUB }),
    }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Subscription not found');
  });

  it('returns 200 and logs entry for unlimited subscription', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB_ID, sessions_used: 5, sessions_limit: null, status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // INSERT entry log
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: TEST_SUB }),
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
    expect(JSON.parse(result.body).message).toBe('Entry logged successfully');
    // Should NOT call UPDATE for sessions since sessions_limit is null
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('returns 200 and increments sessions_used for session-based subscription', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB_ID, sessions_used: 5, sessions_limit: 20, status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })  // INSERT entry log
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE sessions_used
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: TEST_SUB }),
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
    // Should call UPDATE for sessions since sessions_limit is not null
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });

  it('returns 500 on DB error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: TEST_SUB }),
    }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
