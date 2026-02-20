/**
 * Tests for business/program-get Lambda handler
 * GET /businesses/my/program — owner-only, returns activities, schedule slots, and tags
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

import { handler } from '../../business/program-get';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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
    path: '/businesses/my/program',
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

describe('business/program-get handler', () => {
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

  it('returns 200 with empty activities, schedule, and tags', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })  // activities
      .mockResolvedValueOnce({ rows: [] })  // schedule slots
      .mockResolvedValueOnce({ rows: [] }); // tags
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.activities).toEqual([]);
    expect(body.schedule).toEqual([]);
    expect(body.tags).toEqual([]);
  });

  it('returns 200 with activities mapped to camelCase', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'act-1', name: 'Yoga', description: 'Morning yoga', category: 'fitness',
          duration_minutes: 60, max_participants: 20, instructor: 'Alice',
          color: '#FF0000', is_active: true, created_at: '2025-01-01',
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.activities).toHaveLength(1);
    expect(body.activities[0].durationMinutes).toBe(60);
    expect(body.activities[0].maxParticipants).toBe(20);
    expect(body.activities[0].isActive).toBe(true);
    expect(body.activities[0].createdAt).toBe('2025-01-01');
  });

  it('returns 200 with schedule slots mapped to camelCase', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'slot-1', activity_id: 'act-1', day_of_week: 1, start_time: '09:00',
          end_time: '10:00', instructor: 'Bob', max_participants: 15, is_active: true,
          activity_name: 'Yoga', activity_color: '#00FF00',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.schedule).toHaveLength(1);
    expect(body.schedule[0].activityId).toBe('act-1');
    expect(body.schedule[0].dayOfWeek).toBe(1);
    expect(body.schedule[0].startTime).toBe('09:00');
    expect(body.schedule[0].activityName).toBe('Yoga');
    expect(body.schedule[0].activityColor).toBe('#00FF00');
  });

  it('returns 200 with tags mapped correctly', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'tag-1', name: 'Cardio', category: 'fitness' },
          { id: 'tag-2', name: 'Strength', category: 'fitness' },
        ],
      });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.tags).toHaveLength(2);
    expect(body.tags[0].name).toBe('Cardio');
    expect(body.tags[1].name).toBe('Strength');
  });

  it('returns 200 with full program data (activities, schedule, tags)', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'act-1', name: 'Yoga', description: null, category: 'fitness', duration_minutes: 60, max_participants: null, instructor: null, color: '#0EBF8A', is_active: true, created_at: '2025-01-01' },
          { id: 'act-2', name: 'Pilates', description: 'Core workout', category: 'fitness', duration_minutes: 45, max_participants: 10, instructor: 'Carol', color: '#FF0000', is_active: true, created_at: '2025-01-02' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'slot-1', activity_id: 'act-1', day_of_week: 0, start_time: '08:00', end_time: '09:00', instructor: null, max_participants: null, is_active: true, activity_name: 'Yoga', activity_color: '#0EBF8A' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'tag-1', name: 'Relaxation', category: 'wellness' }],
      });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.activities).toHaveLength(2);
    expect(body.schedule).toHaveLength(1);
    expect(body.tags).toHaveLength(1);
  });

  it('returns 500 on DB error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
