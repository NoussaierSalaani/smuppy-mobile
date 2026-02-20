/**
 * Tests for business/validate-access Lambda handler
 * POST /businesses/validate-access — validates member QR code for facility access
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

import { handler } from '../../business/validate-access';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_SUB_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_USER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

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
    path: '/businesses/validate-access',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-req',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

function validBody(overrides: Partial<Record<string, string>> = {}): string {
  return JSON.stringify({
    subscriptionId: TEST_SUB_ID,
    businessId: TEST_SUB,
    userId: TEST_USER_ID,
    ...overrides,
  });
}

// ── Tests ──

describe('business/validate-access handler', () => {
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
    const result = await handler(makeEvent({ body: JSON.stringify({ subscriptionId: TEST_SUB_ID }) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Missing required fields');
  });

  it('returns 400 for invalid UUID format', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: 'bad-uuid', businessId: TEST_SUB, userId: TEST_USER_ID }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('returns 403 when user is not a business owner', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // owner check fails
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Only business owners can scan access codes');
  });

  it('returns 403 when businessId does not match user.id', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    const otherBusiness = 'd4e5f6a7-b8c9-0123-defa-234567890123';
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ subscriptionId: TEST_SUB_ID, businessId: otherBusiness, userId: TEST_USER_ID }),
    }));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('You can only scan for your own business');
  });

  it('returns 200 with valid=false when subscription not found', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({ rows: [] }); // subscription not found
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.message).toBe('Subscription not found');
  });

  it('returns 200 with valid=false when subscription is inactive', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_USER_ID, business_id: TEST_SUB,
          service_id: 'svc-1', status: 'cancelled', current_period_end: FUTURE_DATE,
          sessions_used: 0, sessions_limit: null,
          member_name: 'Alice', member_photo: null, membership_type: 'Premium',
        }],
      });
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.message).toBe('Subscription is cancelled');
  });

  it('returns 200 with valid=false when subscription has expired', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_USER_ID, business_id: TEST_SUB,
          service_id: 'svc-1', status: 'active', current_period_end: PAST_DATE,
          sessions_used: 0, sessions_limit: null,
          member_name: 'Alice', member_photo: null, membership_type: 'Premium',
        }],
      });
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.message).toBe('Subscription has expired');
  });

  it('returns 200 with valid=false when no sessions remaining', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_USER_ID, business_id: TEST_SUB,
          service_id: 'svc-1', status: 'active', current_period_end: FUTURE_DATE,
          sessions_used: 10, sessions_limit: 10,
          member_name: 'Alice', member_photo: null, membership_type: 'Premium',
        }],
      });
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(false);
    expect(body.message).toBe('No sessions remaining');
    expect(body.remainingSessions).toBe(0);
  });

  it('returns 200 with valid=true for active unlimited subscription', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_USER_ID, business_id: TEST_SUB,
          service_id: 'svc-1', status: 'active', current_period_end: FUTURE_DATE,
          sessions_used: 0, sessions_limit: null,
          member_name: 'Alice', member_photo: 'https://example.com/photo.jpg', membership_type: 'Premium',
        }],
      });
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(true);
    expect(body.memberName).toBe('Alice');
    expect(body.membershipType).toBe('Premium');
    expect(body.photo).toBe('https://example.com/photo.jpg');
  });

  it('returns 200 with valid=true for trial subscription with sessions remaining', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_SUB, account_type: 'pro_business' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SUB_ID, user_id: TEST_USER_ID, business_id: TEST_SUB,
          service_id: 'svc-1', status: 'trial', current_period_end: FUTURE_DATE,
          sessions_used: 3, sessions_limit: 10,
          member_name: 'Bob', member_photo: null, membership_type: 'Basic',
        }],
      });
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.valid).toBe(true);
    expect(body.remainingSessions).toBe(7);
    expect(body.memberName).toBe('Bob');
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent({ body: validBody() }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
