/**
 * Tests for business/my-subscriptions Lambda handler
 * GET /businesses/my/subscriptions — returns all business subscriptions for authenticated user
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
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
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn(),
}));

import { handler } from '../../business/my-subscriptions';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/businesses/my/subscriptions',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-req',
      authorizer: overrides.noAuth ? undefined : { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ──

describe('business/my-subscriptions handler', () => {
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

  it('returns 200 with empty subscriptions list', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriptions).toEqual([]);
  });

  it('returns 200 with subscriptions mapped correctly', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: 'sub-1',
        status: 'active',
        current_period_start: '2025-01-01',
        current_period_end: '2025-02-01',
        trial_end: null,
        cancel_at_period_end: false,
        sessions_used: 3,
        sessions_limit: 20,
        business_id: 'biz-1',
        business_name: 'Gym A',
        business_logo: 'https://example.com/logo.jpg',
        category_name: 'Fitness',
        category_icon: 'dumbbell',
        category_color: '#FF0000',
        plan_id: 'plan-1',
        plan_name: 'Premium',
        price_cents: 5000,
        period: 'monthly',
      }],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriptions).toHaveLength(1);
    expect(body.subscriptions[0].id).toBe('sub-1');
    expect(body.subscriptions[0].business.name).toBe('Gym A');
    expect(body.subscriptions[0].plan.name).toBe('Premium');
    expect(body.subscriptions[0].plan.price_cents).toBe(5000);
  });

  it('returns 200 with multiple subscriptions', async () => {
    const { getUserFromEvent, resolveProfileId } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'sub-1', status: 'active', current_period_start: '2025-01-01',
          current_period_end: '2025-02-01', trial_end: null, cancel_at_period_end: false,
          sessions_used: 0, sessions_limit: null,
          business_id: 'biz-1', business_name: 'Gym A', business_logo: null,
          category_name: 'General', category_icon: 'business', category_color: '#0EBF8A',
          plan_id: 'plan-1', plan_name: null, price_cents: null, period: null,
        },
        {
          id: 'sub-2', status: 'cancelled', current_period_start: '2025-01-01',
          current_period_end: '2025-02-01', trial_end: null, cancel_at_period_end: true,
          sessions_used: 10, sessions_limit: 10,
          business_id: 'biz-2', business_name: 'Yoga Studio', business_logo: null,
          category_name: 'Wellness', category_icon: 'leaf', category_color: '#00FF00',
          plan_id: 'plan-2', plan_name: 'Basic', price_cents: 3000, period: 'monthly',
        },
      ],
    });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.subscriptions).toHaveLength(2);
    // Default fallbacks for null plan fields
    expect(body.subscriptions[0].plan.name).toBe('Subscription');
    expect(body.subscriptions[0].plan.price_cents).toBe(0);
    expect(body.subscriptions[0].plan.period).toBe('monthly');
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
