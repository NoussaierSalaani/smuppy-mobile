/**
 * Tests for groups/list Lambda handler
 *
 * Direct handler importing:
 * - ../../shared/db (getPool, SqlParam)
 * - ../utils/cors (cors, handleOptions, getSecureHeaders)
 * - ../utils/logger (createLogger)
 * - ../utils/rate-limit (requireRateLimit)
 * - ../utils/auth (resolveProfileId)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mocks (MUST be before handler import) ────────────────────────────

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
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
  cors: jest.fn((r: Record<string, unknown>) => r),
  handleOptions: jest.fn().mockReturnValue({ statusCode: 200, body: '' }),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/rate-limit', () => ({
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { handler } from '../../groups/list';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-list-test';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
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

const mockGroupRow = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  name: 'Test Group',
  description: 'A test group',
  category: 'sports',
  subcategory: 'running',
  sport_type: 'trail',
  latitude: '48.8566',
  longitude: '2.3522',
  address: 'Paris, France',
  starts_at: new Date('2026-03-01T10:00:00Z'),
  timezone: 'Europe/Paris',
  max_participants: 20,
  current_participants: 5,
  is_free: true,
  price: null,
  currency: 'EUR',
  is_public: true,
  is_fans_only: false,
  is_route: false,
  route_start: null,
  route_end: null,
  route_waypoints: null,
  route_geojson: null,
  route_profile: null,
  route_distance_km: null,
  route_duration_min: null,
  route_elevation_gain: null,
  difficulty: 'moderate',
  cover_image_url: null,
  status: 'active',
  created_at: '2026-02-01T10:00:00Z',
  creator_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  creator_username: 'testcreator',
  creator_display_name: 'Test Creator',
  creator_avatar: 'https://example.com/avatar.jpg',
  creator_verified: true,
};

// ── Mock setup ───────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
});

// ── Tests ────────────────────────────────────────────────────────────

describe('groups/list handler', () => {
  it('should return 200 when processing an OPTIONS request (no special handling — API Gateway handles preflight)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const res = await handler(event);
    const result = res as { statusCode: number };
    // withErrorHandler does not handle OPTIONS separately; returns 200 from normal processing
    expect(result.statusCode).toBe(200);
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({
      statusCode: 429,
      body: JSON.stringify({ message: 'Too many requests' }),
    });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(429);
  });

  it('should return 200 with empty groups list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // main query

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.groups).toEqual([]);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('should return 200 with groups for default (upcoming) filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockGroupRow] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].id).toBe(mockGroupRow.id);
    expect(body.groups[0].name).toBe('Test Group');
    expect(body.groups[0].latitude).toBe(48.8566);
    expect(body.groups[0].longitude).toBe(2.3522);
    expect(body.groups[0].creator.username).toBe('testcreator');
  });

  it('should return 401 for my-groups filter without auth', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);

    const event = makeEvent({
      sub: null,
      queryStringParameters: { filter: 'my-groups' },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 401 for joined filter without auth', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);

    const event = makeEvent({
      sub: null,
      queryStringParameters: { filter: 'joined' },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should handle pagination with hasMore and nextCursor', async () => {
    // Return 21 rows (limit defaults to 20, we fetch 21 to detect hasMore)
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...mockGroupRow,
      id: `b2c3d4e5-f6a7-8901-bcde-f1234567890${i.toString(16).padStart(1, '0')}`,
    }));
    mockQuery.mockResolvedValueOnce({ rows });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.groups).toHaveLength(20);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBeTruthy();
  });

  it('should return 400 for invalid cursor format', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'invalid-cursor-no-pipe' },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('should return 400 for cursor with invalid UUID', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: '2026-03-01T10:00:00Z|not-a-uuid' },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('should accept valid cursor and return groups', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockGroupRow] });

    const event = makeEvent({
      queryStringParameters: {
        cursor: '2026-03-01T10:00:00.000Z|b2c3d4e5-f6a7-8901-bcde-f12345678901',
      },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('should limit results to max 50', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      queryStringParameters: { limit: '100' },
    });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.pagination.limit).toBe(50);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection error'));

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should compute spotsLeft correctly', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [mockGroupRow] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    const body = JSON.parse(result.body);

    expect(body.groups[0].spotsLeft).toBe(15); // 20 - 5
  });

  it('should return spotsLeft as null when no maxParticipants', async () => {
    const rowNoMax = { ...mockGroupRow, max_participants: null };
    mockQuery.mockResolvedValueOnce({ rows: [rowNoMax] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    const body = JSON.parse(result.body);

    expect(body.groups[0].spotsLeft).toBeNull();
  });
});
