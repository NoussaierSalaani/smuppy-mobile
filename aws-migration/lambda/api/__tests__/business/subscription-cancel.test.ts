/**
 * Tests for business/subscription-cancel Lambda handler
 * DELETE /businesses/subscriptions/{subscriptionId} — cancels subscription at period end
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

import { handler } from '../../business/subscription-cancel';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_SUB_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { subscriptionId: TEST_SUB_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/subscriptions/${TEST_SUB_ID}`,
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

describe('business/subscription-cancel handler', () => {
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

  it('returns 404 when profile not found', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('returns 429 when rate limited', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(429);
  });

  it('returns 400 when subscriptionId is missing', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Missing subscription ID');
  });

  it('returns 400 for invalid subscription ID format', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    const result = await handler(makeEvent({ pathParameters: { subscriptionId: 'bad-uuid' } }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid subscription ID format');
  });

  it('returns 404 when subscription not found', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Subscription not found');
  });

  it('returns 403 when user does not own the subscription', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: TEST_SUB_ID, user_id: 'other-user-id', stripe_subscription_id: null, status: 'active', cancel_at_period_end: false }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('You do not own this subscription');
  });

  it('returns 400 when subscription already scheduled for cancellation', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: null, status: 'active', cancel_at_period_end: true }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Subscription is already scheduled for cancellation');
  });

  it('returns 400 when subscription is not active', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: null, status: 'expired', cancel_at_period_end: false }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Cannot cancel a non-active subscription');
  });

  it('returns 200 and cancels subscription successfully', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: null, status: 'active', cancel_at_period_end: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
    expect(JSON.parse(result.body).message).toContain('cancelled at the end');
  });

  it('returns 200 and calls Stripe when stripe_subscription_id exists', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{ id: TEST_SUB_ID, user_id: TEST_PROFILE_ID, stripe_subscription_id: 'sub_stripe_123', status: 'active', cancel_at_period_end: false }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });
    const { getStripeClient } = require('../../../shared/stripe-client');
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(getStripeClient).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
