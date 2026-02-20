/**
 * Tests for groups/get Lambda handler
 *
 * Direct handler importing:
 * - ../../shared/db (getPool)
 * - ../utils/cors (cors, handleOptions)
 * - ../utils/logger (createLogger)
 * - ../utils/security (isValidUUID)
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeInput: jest.fn((v: string) => v),
}));
jest.mock('../../utils/cors', () => ({
  cors: jest.fn((r: Record<string, unknown>) => r),
  handleOptions: jest.fn().mockReturnValue({ statusCode: 200, body: '' }),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { handler } from '../../groups/get';
import { getPool } from '../../../shared/db';
import { isValidUUID } from '../../utils/security';

// ── Constants ────────────────────────────────────────────────────────

const TEST_GROUP_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_CREATOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { groupId: TEST_GROUP_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: 'some-sub' } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const mockGroupRow = {
  id: TEST_GROUP_ID,
  name: 'Test Group',
  description: 'A test group',
  category: 'sports',
  subcategory: 'running',
  sport_type: 'trail',
  latitude: '48.8566',
  longitude: '2.3522',
  address: 'Paris, France',
  starts_at: '2026-03-01T10:00:00Z',
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
  updated_at: '2026-02-01T10:00:00Z',
  creator_id: TEST_CREATOR_ID,
  creator_username: 'testcreator',
  creator_display_name: 'Test Creator',
  creator_avatar: 'https://example.com/avatar.jpg',
  creator_verified: true,
};

const mockParticipantRow = {
  id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  username: 'participant1',
  display_name: 'Participant One',
  avatar_url: 'https://example.com/p1.jpg',
  is_verified: false,
  joined_at: '2026-02-10T10:00:00Z',
};

// ── Mock setup ───────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (isValidUUID as jest.Mock).mockReturnValue(true);
});

// ── Tests ────────────────────────────────────────────────────────────

describe('groups/get handler', () => {
  it('should return 500 for OPTIONS (OPTIONS preflight is handled by API Gateway, not by this handler)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });

  it('should return 400 when groupId is missing', async () => {
    const event = makeEvent({ pathParameters: {} });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('should return 400 when groupId is invalid UUID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);

    const event = makeEvent({ pathParameters: { groupId: 'not-a-uuid' } });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('should return 404 when group not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // group query returns empty

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Group not found');
  });

  it('should return 200 with group data and participants', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockGroupRow] }) // group query
      .mockResolvedValueOnce({ rows: [mockParticipantRow] }); // participants query

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.group.id).toBe(TEST_GROUP_ID);
    expect(body.group.name).toBe('Test Group');
    expect(body.group.latitude).toBe(48.8566);
    expect(body.group.longitude).toBe(2.3522);
    expect(body.group.creator.id).toBe(TEST_CREATOR_ID);
    expect(body.group.creator.username).toBe('testcreator');
    expect(body.group.participants).toHaveLength(1);
    expect(body.group.participants[0].id).toBe(mockParticipantRow.id);
    expect(body.group.participants[0].displayName).toBe('Participant One');
  });

  it('should return 200 with empty participants array', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockGroupRow] })
      .mockResolvedValueOnce({ rows: [] }); // no participants

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.group.participants).toEqual([]);
  });

  it('should map camelCase fields correctly in response', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [mockGroupRow] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    const body = JSON.parse(result.body);

    expect(body.group.sportType).toBe('trail');
    expect(body.group.startsAt).toBe('2026-03-01T10:00:00Z');
    expect(body.group.maxParticipants).toBe(20);
    expect(body.group.currentParticipants).toBe(5);
    expect(body.group.isFree).toBe(true);
    expect(body.group.isPublic).toBe(true);
    expect(body.group.isFansOnly).toBe(false);
    expect(body.group.coverImageUrl).toBeNull();
    expect(body.group.creator.displayName).toBe('Test Creator');
    expect(body.group.creator.isVerified).toBe(true);
  });

  it('should parse price when present', async () => {
    const rowWithPrice = { ...mockGroupRow, is_free: false, price: '9.99' };
    mockQuery
      .mockResolvedValueOnce({ rows: [rowWithPrice] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    const body = JSON.parse(result.body);

    expect(body.group.price).toBe(9.99);
    expect(body.group.isFree).toBe(false);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection error'));

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should release client in finally block even on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const event = makeEvent();
    await handler(event);
    expect(mockRelease).toHaveBeenCalled();
  });
});
