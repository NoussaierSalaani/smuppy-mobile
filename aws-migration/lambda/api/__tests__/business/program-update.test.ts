/**
 * Tests for business/program-update Lambda handler
 * Multi-action handler for activities, schedule slots, and tags
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

import { handler } from '../../business/program-update';

// ── Helpers ──

const TEST_SUB = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ACTIVITY_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const SLOT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TAG_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/businesses/my/activities',
    resource: overrides.resource as string ?? '/businesses/my/activities',
    stageVariables: null,
    requestContext: {
      requestId: 'test-req',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ──

describe('business/program-update handler', () => {
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
      statusCode: 429, headers: {}, body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
    });
    const result = await handler(makeEvent({
      body: JSON.stringify({ name: 'Yoga' }),
      resource: '/businesses/my/activities',
      path: '/businesses/my/activities',
    }));
    expect(result.statusCode).toBe(429);
  });

  // ── Activities ──

  it('creates an activity (POST /activities) returns 201', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: ACTIVITY_ID, name: 'Yoga', description: null, category: 'fitness',
        duration_minutes: 60, max_participants: null, instructor: null, color: '#0EBF8A',
        is_active: true, created_at: '2025-01-01',
      }],
    });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/activities',
      path: '/businesses/my/activities',
      body: JSON.stringify({ name: 'Yoga', category: 'fitness' }),
    }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.activity.name).toBe('Yoga');
  });

  it('returns 400 when activity name is missing', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/activities',
      path: '/businesses/my/activities',
      body: JSON.stringify({ category: 'fitness' }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Name is required');
  });

  it('updates an activity (PUT /activities/{activityId}) returns 200', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: ACTIVITY_ID, name: 'Updated Yoga', description: 'New desc', category: 'fitness',
        duration_minutes: 90, max_participants: 15, instructor: 'Bob', color: '#FF0000',
        is_active: true, created_at: '2025-01-01',
      }],
    });
    const result = await handler(makeEvent({
      httpMethod: 'PUT',
      resource: '/businesses/my/activities/{activityId}',
      path: `/businesses/my/activities/${ACTIVITY_ID}`,
      pathParameters: { activityId: ACTIVITY_ID },
      body: JSON.stringify({ name: 'Updated Yoga', duration_minutes: 90 }),
    }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.activity.name).toBe('Updated Yoga');
  });

  it('returns 400 when updating activity with invalid UUID', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'PUT',
      resource: '/businesses/my/activities/{activityId}',
      path: '/businesses/my/activities/bad-uuid',
      pathParameters: { activityId: 'bad-uuid' },
      body: JSON.stringify({ name: 'Test' }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid activityId');
  });

  it('returns 400 when no fields to update', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'PUT',
      resource: '/businesses/my/activities/{activityId}',
      path: `/businesses/my/activities/${ACTIVITY_ID}`,
      pathParameters: { activityId: ACTIVITY_ID },
      body: JSON.stringify({}),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No fields to update');
  });

  it('returns 404 when updating a non-existent activity', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent({
      httpMethod: 'PUT',
      resource: '/businesses/my/activities/{activityId}',
      path: `/businesses/my/activities/${ACTIVITY_ID}`,
      pathParameters: { activityId: ACTIVITY_ID },
      body: JSON.stringify({ name: 'Test' }),
    }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Activity not found');
  });

  it('deletes (soft) an activity (DELETE /activities/{activityId}) returns 200', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: ACTIVITY_ID }] });
    const result = await handler(makeEvent({
      httpMethod: 'DELETE',
      resource: '/businesses/my/activities/{activityId}',
      path: `/businesses/my/activities/${ACTIVITY_ID}`,
      pathParameters: { activityId: ACTIVITY_ID },
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('returns 404 when deleting non-existent activity', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent({
      httpMethod: 'DELETE',
      resource: '/businesses/my/activities/{activityId}',
      path: `/businesses/my/activities/${ACTIVITY_ID}`,
      pathParameters: { activityId: ACTIVITY_ID },
    }));
    expect(result.statusCode).toBe(404);
  });

  // ── Schedule Slots ──

  it('creates a schedule slot (POST /schedule) returns 201', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    // Activity ownership check
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: ACTIVITY_ID }] });
    // Insert slot
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        id: SLOT_ID, activity_id: ACTIVITY_ID, day_of_week: 1, start_time: '09:00',
        end_time: '10:00', instructor: null, max_participants: null, is_active: true,
      }],
    });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/schedule',
      path: '/businesses/my/schedule',
      body: JSON.stringify({ activity_id: ACTIVITY_ID, day_of_week: 1, start_time: '09:00', end_time: '10:00' }),
    }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.slot.activityId).toBe(ACTIVITY_ID);
  });

  it('returns 400 for invalid activity_id in slot creation', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/schedule',
      path: '/businesses/my/schedule',
      body: JSON.stringify({ activity_id: 'bad-id', day_of_week: 1, start_time: '09:00', end_time: '10:00' }),
    }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Valid activity_id is required');
  });

  // ── Tags ──

  it('adds a tag (POST /tags) returns 201', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: TAG_ID, name: 'Cardio', category: 'fitness' }],
    });
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/tags',
      path: '/businesses/my/tags',
      body: JSON.stringify({ name: 'Cardio', category: 'fitness' }),
    }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.tag.name).toBe('Cardio');
  });

  it('returns 409 when tag already exists', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/tags',
      path: '/businesses/my/tags',
      body: JSON.stringify({ name: 'Cardio', category: 'fitness' }),
    }));
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe('Tag already exists');
  });

  it('returns 405 for unsupported method/route', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const result = await handler(makeEvent({
      httpMethod: 'PATCH',
      resource: '/businesses/my/activities',
      path: '/businesses/my/activities',
    }));
    expect(result.statusCode).toBe(405);
    expect(JSON.parse(result.body).message).toBe('Method not allowed');
  });

  it('returns 500 on unexpected DB error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue({ id: TEST_SUB, sub: TEST_SUB });
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent({
      httpMethod: 'POST',
      resource: '/businesses/my/activities',
      path: '/businesses/my/activities',
      body: JSON.stringify({ name: 'Test' }),
    }));
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
