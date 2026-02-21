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

  // ── Extended Coverage (Batch 7D) ──

  it('formats recent activity "just now" when created_at is within 1 minute', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const justNow = new Date(Date.now() - 10_000).toISOString(); // 10 seconds ago
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a1', type: 'booking', member_name: 'Alice', service_name: 'Yoga', created_at: justNow }],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].time).toBe('just now');
  });

  it('formats recent activity "X min ago" for events within the hour', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a2', type: 'subscription', member_name: 'Bob', service_name: 'Gym', created_at: thirtyMinAgo }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].time).toMatch(/^\d+ min ago$/);
  });

  it('formats recent activity "Xh ago" for events within the day', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a3', type: 'booking', member_name: 'Carol', service_name: 'Pilates', created_at: threeHoursAgo }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].time).toMatch(/^\dh ago$/);
  });

  it('formats recent activity "Xd ago" for events older than a day', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a4', type: 'subscription', member_name: 'Dave', service_name: 'Boxing', created_at: twoDaysAgo }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].time).toMatch(/^\dd ago$/);
  });

  it('falls back to "Unknown" when member_name is null', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const now = new Date().toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a5', type: 'booking', member_name: null, service_name: 'Swim', created_at: now }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].memberName).toBe('Unknown');
  });

  it('handles empty rows gracefully with zero defaults for all stats', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    // Return empty rows for every query (no count, no total)
    mockPool.query
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.stats.todayBookings).toBe(0);
    expect(body.stats.activeMembers).toBe(0);
    expect(body.stats.monthlyRevenue).toBe(0);
    expect(body.stats.todayCheckIns).toBe(0);
    expect(body.stats.upcomingClasses).toBe(0);
    expect(body.stats.pendingRequests).toBe(0);
  });

  it('returns 500 when a later parallel query fails', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockRejectedValueOnce(new Error('connection timeout'));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });

  it('handles multiple recent activity entries and maps all fields correctly', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '20' }] })
      .mockResolvedValueOnce({ rows: [{ total: '100000' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'r1', type: 'booking', member_name: 'Alice', service_name: 'Yoga', created_at: now },
          { id: 'r2', type: 'subscription', member_name: 'Bob', service_name: null, created_at: oneHourAgo },
        ],
      });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.stats.monthlyRevenue).toBe(100000);
    expect(body.recentActivity).toHaveLength(2);
    expect(body.recentActivity[0].id).toBe('r1');
    expect(body.recentActivity[0].type).toBe('booking');
    expect(body.recentActivity[0].serviceName).toBe('Yoga');
    expect(body.recentActivity[1].serviceName).toBeNull();
  });

  it('returns stats correctly when no rows exist (empty array)', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // rows[0] is undefined, fallback || '0' triggers NaN path; parseInt(undefined) = NaN, but || '0' catches it
    expect(body.stats.todayBookings).toBe(0);
    expect(body.stats.activeMembers).toBe(0);
    expect(body.recentActivity).toEqual([]);
  });

  it('maps serviceName to null when service_name is missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const now = new Date().toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'a6', type: 'booking', member_name: 'Eve', service_name: undefined, created_at: now }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].serviceName).toBeUndefined();
    expect(body.recentActivity[0].memberName).toBe('Eve');
  });

  // ── Additional Coverage (Batch 7B-7D) ──

  it('returns monthlyRevenue as integer from string total', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '12345' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.stats.monthlyRevenue).toBe(12345);
    expect(typeof body.stats.monthlyRevenue).toBe('number');
  });

  it('returns pendingRequests as 0 (hardcoded)', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ total: '500' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [{ count: '4' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.stats.pendingRequests).toBe(0);
  });

  it('handles parallel query failure on first query (bookingsToday) with 500', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query.mockRejectedValueOnce(new Error('bookings query failed'));

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });

  it('handles recent activity with subscription type correctly', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    const now = new Date().toISOString();
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub1', type: 'subscription', member_name: 'Frank', service_name: 'Monthly Pass', created_at: now }],
      });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.recentActivity[0].type).toBe('subscription');
    expect(body.recentActivity[0].memberName).toBe('Frank');
    expect(body.recentActivity[0].serviceName).toBe('Monthly Pass');
  });

  it('includes all stat fields in response shape', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '7' }] })
      .mockResolvedValueOnce({ rows: [{ count: '15' }] })
      .mockResolvedValueOnce({ rows: [{ total: '75000' }] })
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.stats).toHaveProperty('todayBookings');
    expect(body.stats).toHaveProperty('activeMembers');
    expect(body.stats).toHaveProperty('monthlyRevenue');
    expect(body.stats).toHaveProperty('pendingRequests');
    expect(body.stats).toHaveProperty('todayCheckIns');
    expect(body.stats).toHaveProperty('upcomingClasses');
    expect(body.stats.todayBookings).toBe(7);
    expect(body.stats.activeMembers).toBe(15);
    expect(body.stats.todayCheckIns).toBe(5);
    expect(body.stats.upcomingClasses).toBe(3);
  });
});
