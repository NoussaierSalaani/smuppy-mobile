/**
 * Tests for business/services-create Lambda handler
 * Owner-only endpoint for creating business services
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/services-create';

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

const TEST_SUB = 'cognito-sub-test123';

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
    path: '/businesses/my/services',
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', authorizer: { claims: { sub: TEST_SUB } }, identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/services-create handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when name missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({ body: JSON.stringify({ category: 'drop_in', price_cents: 2000 }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Name is required');
  });

  it('returns 400 for invalid category', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'Test', category: 'invalid_cat', price_cents: 2000 }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Valid category');
  });

  it('returns 403 when user is not a business account', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'personal' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'Test', category: 'drop_in', price_cents: 2000 }),
    }));
    expect(result.statusCode).toBe(403);
  });

  it('returns 201 on successful creation', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 's1', name: 'Yoga', description: null, category: 'drop_in',
          price_cents: 2000, duration_minutes: 60, is_subscription: false,
          subscription_period: null, trial_days: 0, max_capacity: null,
          entries_total: null, is_active: true, created_at: '2025-01-01',
        }],
      });
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'Yoga', category: 'drop_in', price_cents: 2000, duration_minutes: 60 }),
    }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.service).toBeDefined();
  });

  it('returns 500 on DB error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'Yoga', category: 'drop_in', price_cents: 2000 }),
    }));
    expect(result.statusCode).toBe(500);
  });
});
