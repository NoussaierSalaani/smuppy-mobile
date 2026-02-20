/**
 * Tests for business/profile-get Lambda handler
 * Public endpoint — returns business profile with services, tags, follow status
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/profile-get';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }), requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({ createLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(), logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(), logSecurity: jest.fn(), child: jest.fn().mockReturnThis() })) }));
jest.mock('../../utils/cors', () => ({ createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })), getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })) }));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn(), resolveProfileId: jest.fn() }));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));

const TEST_SUB = 'cognito-sub-test123';
const TEST_BIZ_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { businessId: TEST_BIZ_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: `/businesses/${TEST_BIZ_ID}`,
    resource: '/',
    stageVariables: null,
    requestContext: { requestId: 'test-req', identity: { sourceIp: '127.0.0.1' } },
  } as unknown as APIGatewayProxyEvent;
}

describe('business/profile-get handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 400 when businessId is invalid', async () => {
    // businessId is undefined (missing from pathParameters), so !businessId short-circuits
    const result = await handler(makeEvent({ pathParameters: {} }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Valid businessId is required');
  });

  it('returns 404 when business not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Business not found');
  });

  it('returns 200 with business profile, services, and tags', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);

    // Profile query
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_BIZ_ID, full_name: 'Gym A', username: 'gyma', bio: 'A gym',
          avatar_url: null, cover_url: null, business_category: 'fitness',
          business_address: '123 St', business_phone: null, business_website: null,
          business_hours: null, latitude: 48.8, longitude: 2.3, is_verified: true,
          stripe_account_id: 'acct_123', stripe_charges_enabled: true, fan_count: 42,
        }],
      })
      // Services query
      .mockResolvedValueOnce({
        rows: [{
          id: 's1', name: 'Yoga', description: 'desc', category: 'drop_in',
          price_cents: 2000, duration_minutes: 60, max_capacity: 20,
          is_subscription: false, subscription_period: null, trial_days: 0,
          entries_total: null, image_url: null,
        }],
      })
      // Tags query
      .mockResolvedValueOnce({
        rows: [{ id: 't1', name: 'yoga', category: 'sport' }],
      })
      // Follow check (unauthenticated returns false inline)
    ;

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.business.name).toBe('Gym A');
    expect(body.business.paymentsEnabled).toBe(true);
    expect(body.business.followersCount).toBe(42);
    expect(body.business.services).toHaveLength(1);
    expect(body.business.tags).toHaveLength(1);
  });

  it('returns 200 with follow status for authenticated user', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_BIZ_ID, full_name: 'Gym A', username: 'gyma', bio: null,
          avatar_url: null, cover_url: null, business_category: 'fitness',
          business_address: null, business_phone: null, business_website: null,
          business_hours: null, latitude: null, longitude: null, is_verified: false,
          stripe_account_id: null, stripe_charges_enabled: false, fan_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }) // services
      .mockResolvedValueOnce({ rows: [] }) // tags
      .mockResolvedValueOnce({ rows: [{ is_following: true }] }); // follow check

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.business.isFollowing).toBe(true);
    expect(body.business.paymentsEnabled).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});
