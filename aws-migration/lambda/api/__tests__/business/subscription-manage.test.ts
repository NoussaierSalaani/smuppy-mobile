/**
 * Tests for business/subscription-manage Lambda handler
 * Combined handler routing: cancel, reactivate, list subscriptions, access pass
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
  Logger: jest.fn(),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
  resolveProfileId: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    subscriptions: { update: jest.fn().mockResolvedValue({}) },
  }),
}));

import { handler } from '../../business/subscription-manage';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_SUB_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/businesses/subscriptions/my',
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

describe('business/subscription-manage handler', () => {
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

  // ── List subscriptions route ──

  it('routes GET /subscriptions/my to list subscriptions', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent({
      httpMethod: 'GET',
      path: '/businesses/subscriptions/my',
    }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriptions).toEqual([]);
  });

  it('returns 404 when profile not found on list subscriptions', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const result = await handler(makeEvent({
      httpMethod: 'GET',
      path: '/businesses/subscriptions/my',
    }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  // ── Access pass route ──

  it('routes GET /access-pass to get access pass', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, business_id: 'biz-1',
        service_id: 'svc-1', status: 'active', current_period_end: '2025-12-31',
        sessions_used: 2, sessions_limit: 10,
        member_name: 'Alice', business_name: 'Gym A', business_logo: null,
        membership_type: 'Premium',
      }],
    });
    const result = await handler(makeEvent({
      httpMethod: 'GET',
      path: `/businesses/subscriptions/${TEST_SUB_ID}/access-pass`,
      pathParameters: { subscriptionId: TEST_SUB_ID },
    }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.accessPass).toBeDefined();
    expect(body.accessPass.memberName).toBe('Alice');
  });

  // ── Cancel route ──

  it('routes POST /cancel to cancel subscription', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: null, status: 'active', cancel_at_period_end: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      path: `/businesses/subscriptions/${TEST_SUB_ID}/cancel`,
      pathParameters: { subscriptionId: TEST_SUB_ID },
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('returns 429 when cancel is rate limited', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
    });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      path: `/businesses/subscriptions/${TEST_SUB_ID}/cancel`,
      pathParameters: { subscriptionId: TEST_SUB_ID },
    }));
    expect(result.statusCode).toBe(429);
  });

  // ── Reactivate route ──

  it('routes POST /reactivate to reactivate subscription', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: null,
          status: 'active', cancel_at_period_end: true, current_period_end: futureDate,
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      path: `/businesses/subscriptions/${TEST_SUB_ID}/reactivate`,
      pathParameters: { subscriptionId: TEST_SUB_ID },
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Subscription has been reactivated');
  });

  // ── 404 unknown route ──

  it('returns 404 for unknown route', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'GET',
      path: '/businesses/subscriptions/unknown-route',
    }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Not found');
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockRejectedValue(new Error('DB error'));
    const result = await handler(makeEvent({
      httpMethod: 'GET',
      path: '/businesses/subscriptions/my',
    }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
