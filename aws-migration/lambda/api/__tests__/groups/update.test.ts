/**
 * Tests for groups/update Lambda handler
 *
 * Direct handler importing:
 * - ../../shared/db (getPool)
 * - ../utils/cors (cors, handleOptions, getSecureHeaders)
 * - ../utils/logger (createLogger)
 * - ../utils/security (sanitizeInput, isValidUUID)
 * - ../utils/rate-limit (requireRateLimit)
 * - ../utils/account-status (requireActiveAccount, isAccountError)
 * - ../utils/auth (resolveProfileId)
 * - ../../shared/moderation/textFilter (filterText)
 * - ../../shared/moderation/textModeration (analyzeTextToxicity)
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
jest.mock('../../utils/rate-limit', () => ({
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({ profileId: 'p1', accountType: 'personal' }),
  isAccountError: jest.fn().mockReturnValue(false),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true }),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ action: 'allow' }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { handler as _handler } from '../../groups/update';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { getPool } from '../../../shared/db';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { resolveProfileId } from '../../utils/auth';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Constants ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-update-test';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_GROUP_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const mockUpdatedRow = {
  id: TEST_GROUP_ID,
  name: 'Updated Group',
  description: 'Updated description',
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
  updated_at: '2026-02-20T10:00:00Z',
};

const mockCreatorRow = {
  username: 'testcreator',
  display_name: 'Test Creator',
  avatar_url: 'https://example.com/avatar.jpg',
  is_verified: true,
};

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'PUT',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ name: 'Updated Group' }),
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
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Mock setup ───────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (isValidUUID as jest.Mock).mockReturnValue(true);
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  (requireActiveAccount as jest.Mock).mockResolvedValue({ profileId: TEST_PROFILE_ID, accountType: 'personal' });
  (isAccountError as unknown as jest.Mock).mockReturnValue(false);
  (filterText as jest.Mock).mockResolvedValue({ clean: true });
  (analyzeTextToxicity as jest.Mock).mockResolvedValue({ action: 'allow' });
});

// ── Tests ────────────────────────────────────────────────────────────

describe('groups/update handler', () => {
  // Note: withErrorHandler does not handle OPTIONS separately.
  // API Gateway handles CORS preflight before the Lambda is invoked.
  it('should return 401 for OPTIONS without auth (no special handling)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
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

  it('should return 403 when account is banned', async () => {
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      statusCode: 403,
      body: JSON.stringify({ message: 'Your account has been permanently banned.' }),
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(true);

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(403);
  });

  it('should return 400 when groupId is invalid UUID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);

    const event = makeEvent({ pathParameters: { groupId: 'not-a-uuid' } });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);

    const event = makeEvent();
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 400 for invalid difficulty', async () => {
    const event = makeEvent({ body: JSON.stringify({ difficulty: 'insane' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid difficulty');
  });

  it('should return 400 for invalid maxParticipants', async () => {
    const event = makeEvent({ body: JSON.stringify({ maxParticipants: 1 }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Max participants must be between 2 and 10000');
  });

  it('should return 400 for invalid startsAt date', async () => {
    const event = makeEvent({ body: JSON.stringify({ startsAt: 'not-a-date' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid start date');
  });

  it('should return 400 for invalid latitude', async () => {
    const event = makeEvent({ body: JSON.stringify({ latitude: 999 }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid latitude');
  });

  it('should return 400 for invalid longitude', async () => {
    const event = makeEvent({ body: JSON.stringify({ longitude: -200 }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid longitude');
  });

  it('should return 400 when no valid fields to update', async () => {
    const event = makeEvent({ body: JSON.stringify({ unknownField: 'value' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('No valid fields to update');
  });

  it('should return 400 when text blocked by moderation filter', async () => {
    (filterText as jest.Mock).mockResolvedValueOnce({ clean: false, severity: 'critical' });

    const event = makeEvent({ body: JSON.stringify({ name: 'Bad Name' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Content policy violation');
  });

  it('should return 400 when text blocked by toxicity analysis', async () => {
    (filterText as jest.Mock).mockResolvedValue({ clean: true });
    (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({ action: 'block', topCategory: 'hate' });

    const event = makeEvent({ body: JSON.stringify({ name: 'Toxic Name' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Content policy violation');
  });

  it('should return 200 on successful update', async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // UPDATE RETURNING
    mockQuery.mockResolvedValueOnce({ rows: [mockUpdatedRow] });
    // COMMIT
    mockQuery.mockResolvedValueOnce({});
    // SELECT creator info
    mockQuery.mockResolvedValueOnce({ rows: [mockCreatorRow] });

    const event = makeEvent({ body: JSON.stringify({ name: 'Updated Group' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.group.name).toBe('Updated Group');
    expect(body.group.creator.username).toBe('testcreator');
  });

  it('should return 404 when group not found during update', async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // UPDATE returns 0 rows (group not found or not owner)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // ROLLBACK
    mockQuery.mockResolvedValueOnce({});
    // Check if group exists: no
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Group not found');
  });

  it('should return 403 when not authorized to update (not creator)', async () => {
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // UPDATE returns 0 rows
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // ROLLBACK
    mockQuery.mockResolvedValueOnce({});
    // Check exists: yes (but different creator)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: 'other-user-id' }],
    });

    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Not authorized to update this group');
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection error'));

    const event = makeEvent({ body: JSON.stringify({ name: 'Updated' }) });
    const res = await handler(event);
    const result = res as { statusCode: number; body: string };
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
