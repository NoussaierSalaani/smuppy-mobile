/**
 * Tests for groups/leave Lambda handler
 *
 * Uses createGroupActionHandler -> createEntityActionHandler which imports:
 * - ../../shared/db (getPool)
 * - ../utils/cors (cors, handleOptions, getSecureHeaders)
 * - ../utils/logger (createLogger)
 * - ../utils/security (isValidUUID)
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
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { handler } from '../../groups/leave';
import { getPool } from '../../../shared/db';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-leave-test';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_GROUP_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OTHER_CREATOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
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
});

// ── Tests ────────────────────────────────────────────────────────────

describe('groups/leave handler', () => {
  // Note: withErrorHandler does not handle OPTIONS separately.
  // API Gateway handles CORS preflight before the Lambda is invoked.
  it('should return 401 for OPTIONS without auth (no special handling)', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS', sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValue({
      statusCode: 429,
      body: JSON.stringify({ message: 'Too many requests' }),
    });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('should return 400 when groupId is invalid UUID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);

    const event = makeEvent({ pathParameters: { groupId: 'bad-id' } });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid ID format');
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 404 when group not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT from groups returns empty

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Group not found');
  });

  it('should return 400 when group creator tries to leave', async () => {
    // SELECT group: creator_id matches the profile
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: TEST_PROFILE_ID }],
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({});

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Group creator cannot leave the group');
  });

  it('should return 400 when user is not a member', async () => {
    // SELECT group: creator is someone else
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: OTHER_CREATOR_ID }],
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // Check membership: not a member
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('You are not a member of this group');
  });

  it('should return 200 on successful leave', async () => {
    // SELECT group: creator is someone else
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_GROUP_ID, creator_id: OTHER_CREATOR_ID }],
    });
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // Check membership: is a member
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'participant-row-id' }] });
    // DELETE participant
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    // UPDATE groups participant count
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Left group successfully');
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection error'));

    const event = makeEvent();
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Failed to leave group');
  });

  it('should release client even on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    const event = makeEvent();
    await handler(event);
    expect(mockRelease).toHaveBeenCalled();
  });
});
