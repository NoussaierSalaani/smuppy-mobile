/**
 * Tests for business/dashboard Lambda handler
 * Uses createBusinessHandler factory — tests via the exported handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../business/dashboard';

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

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';

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
    path: '/businesses/my/dashboard',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('business/dashboard handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  it('returns 204 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 200 with dashboard stats on happy path', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    // The dashboard handler runs 6 parallel queries
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })   // bookings today
      .mockResolvedValueOnce({ rows: [{ count: '10' }] })  // active members
      .mockResolvedValueOnce({ rows: [{ total: '50000' }] }) // monthly revenue
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })   // today check-ins
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })   // upcoming classes
      .mockResolvedValueOnce({ rows: [] });                  // recent activity

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats.todayBookings).toBe(3);
    expect(body.stats.activeMembers).toBe(10);
    expect(body.recentActivity).toBeDefined();
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
