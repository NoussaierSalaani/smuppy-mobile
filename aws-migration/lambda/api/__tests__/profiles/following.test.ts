/**
 * Tests for profiles/following Lambda handler
 * Validates UUID validation, profile not found, privacy check, pagination, cursor, and error handling.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

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
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
  getUserFromEvent: jest.fn(),
  requireUser: jest.fn(),
}));

import { handler } from '../../profiles/following';
import { requireRateLimit } from '../../utils/rate-limit';
import { checkPrivacyAccess } from '../../utils/auth';

// ── Constants ──

const VALID_COGNITO_SUB = 'cognito-sub-abc123';
const VALID_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const FOLLOWING_1_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const FOLLOWING_2_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

const MOCK_FOLLOWED_AT_1 = new Date('2025-06-15T10:00:00Z');
const MOCK_FOLLOWED_AT_2 = new Date('2025-06-14T10:00:00Z');

function makeFollowingRow(id: string, followedAt: Date, overrides: Record<string, unknown> = {}) {
  return {
    id,
    username: `user_${id.slice(0, 4)}`,
    full_name: `User ${id.slice(0, 4)}`,
    avatar_url: `https://cdn.smuppy.com/avatars/${id}.jpg`,
    bio: 'Test bio',
    is_verified: false,
    account_type: 'personal',
    business_name: null,
    display_name: null,
    cover_url: null,
    is_private: false,
    fan_count: 10,
    following_count: 5,
    post_count: 3,
    followed_at: followedAt,
    total_count: '2',
    ...overrides,
  };
}

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  profileId?: string | null;
  queryParams?: Record<string, string> | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_COGNITO_SUB : overrides.sub;
  const profileId = overrides.profileId === undefined ? VALID_PROFILE_ID : overrides.profileId;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: profileId !== null ? { id: profileId } : null,
    queryStringParameters: overrides.queryParams !== undefined ? overrides.queryParams : null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    stageVariables: null,
    resource: '',
    path: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: sub !== null ? { claims: { sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Test Suite ──

describe('profiles/following handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (checkPrivacyAccess as jest.Mock).mockResolvedValue(true);
  });

  // ── 1. Validation ──

  describe('validation', () => {
    it('should return 400 when profile ID path parameter is missing', async () => {
      const event = buildEvent({ profileId: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Profile ID is required');
    });

    it('should return 400 when profile ID is not a valid UUID', async () => {
      const event = buildEvent({ profileId: 'invalid-format' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid profile ID format');
    });
  });

  // ── 2. Rate limiting ──

  describe('rate limiting', () => {
    it('should return rate limit response when limit is exceeded', async () => {
      const rateLimitResp = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitResp);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // ── 3. Profile not found ──

  describe('profile existence', () => {
    it('should return 404 when profile does not exist', async () => {
      // Profile lookup returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // ── 4. Privacy check ──

  describe('privacy check', () => {
    it('should return 403 when profile is private and viewer has no access', async () => {
      // Profile exists and is private
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'privateuser', is_private: true }],
      });
      (checkPrivacyAccess as jest.Mock).mockResolvedValueOnce(false);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('This account is private');
    });

    it('should allow access when profile is private but viewer has access', async () => {
      // Profile exists and is private
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'privateuser', is_private: true }],
      });
      (checkPrivacyAccess as jest.Mock).mockResolvedValueOnce(true);

      // Following query returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should skip privacy check when profile is public', async () => {
      // Profile exists and is NOT private
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'publicuser', is_private: false }],
      });
      // Following query returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(checkPrivacyAccess).not.toHaveBeenCalled();
    });
  });

  // ── 5. Happy path: following list ──

  describe('successful following list', () => {
    it('should return formatted following with correct camelCase mapping', async () => {
      // Profile exists (public)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      // Following query returns 2 users
      mockDb.query.mockResolvedValueOnce({
        rows: [
          makeFollowingRow(FOLLOWING_1_ID, MOCK_FOLLOWED_AT_1),
          makeFollowingRow(FOLLOWING_2_ID, MOCK_FOLLOWED_AT_2),
        ],
      });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.following).toHaveLength(2);
      expect(body.hasMore).toBe(false);
      expect(body.totalCount).toBe(2);
      expect(body.cursor).toBeNull();

      // Verify camelCase mapping
      const user = body.following[0];
      expect(user.id).toBe(FOLLOWING_1_ID);
      expect(user.fullName).toBeDefined();
      expect(user.avatarUrl).toBeDefined();
      expect(user.isVerified).toBe(false);
      expect(user.accountType).toBe('personal');
      expect(user.isPrivate).toBe(false);
      expect(user.followersCount).toBe(10);
      expect(user.followingCount).toBe(5);
      expect(user.postsCount).toBe(3);
      expect(user.followedAt).toBeDefined();
    });

    it('should return "following" key (not "followers") in the response', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body).toHaveProperty('following');
      expect(body).not.toHaveProperty('followers');
    });

    it('should return empty list when profile follows nobody', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      // No following
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.following).toHaveLength(0);
      expect(body.hasMore).toBe(false);
      expect(body.totalCount).toBe(0);
      expect(body.cursor).toBeNull();
    });
  });

  // ── 6. Pagination ──

  describe('pagination', () => {
    it('should respect limit query parameter', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      // Return limit+1 rows to indicate hasMore=true (limit=2, so 3 rows)
      mockDb.query.mockResolvedValueOnce({
        rows: [
          makeFollowingRow(FOLLOWING_1_ID, MOCK_FOLLOWED_AT_1),
          makeFollowingRow(FOLLOWING_2_ID, MOCK_FOLLOWED_AT_2),
          makeFollowingRow('f6a7b8c9-d0e1-2345-fabc-456789012345', new Date('2025-06-13T10:00:00Z')),
        ],
      });

      const event = buildEvent({ queryParams: { limit: '2' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.following).toHaveLength(2);
      expect(body.hasMore).toBe(true);
      expect(body.cursor).toBe(MOCK_FOLLOWED_AT_2.getTime().toString());
    });

    it('should cap limit at 50', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ queryParams: { limit: '200' } });

      await handler(event);

      // Verify the SQL query was called with limit+1=51
      const followingQueryCall = mockDb.query.mock.calls[1];
      const params = followingQueryCall[1] as unknown[];
      expect(params[params.length - 1]).toBe(51);
    });

    it('should use default limit of 20 when not specified', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      await handler(event);

      const followingQueryCall = mockDb.query.mock.calls[1];
      const params = followingQueryCall[1] as unknown[];
      // Default limit 20 + 1 = 21
      expect(params[params.length - 1]).toBe(21);
    });
  });

  // ── 7. Cursor ──

  describe('cursor-based pagination', () => {
    it('should include cursor parameter in query when cursor is provided', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const cursorTimestamp = MOCK_FOLLOWED_AT_1.getTime().toString();
      const event = buildEvent({ queryParams: { cursor: cursorTimestamp } });

      await handler(event);

      // Verify the following query includes a cursor condition
      const followingQueryCall = mockDb.query.mock.calls[1];
      const sql = followingQueryCall[0] as string;
      expect(sql).toContain('created_at <');
      // Should have 3 params: profileId, cursor date, limit
      const params = followingQueryCall[1] as unknown[];
      expect(params).toHaveLength(3);
    });

    it('should return null cursor when there are no more results', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      // Return exactly 1 row (less than limit)
      mockDb.query.mockResolvedValueOnce({
        rows: [makeFollowingRow(FOLLOWING_1_ID, MOCK_FOLLOWED_AT_1)],
      });

      const event = buildEvent({ queryParams: { limit: '5' } });

      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(false);
      expect(body.cursor).toBeNull();
    });
  });

  // ── 8. Query targets correct join direction ──

  describe('query direction', () => {
    it('should query follower_id (not following_id) in WHERE clause for following list', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      await handler(event);

      const followingQueryCall = mockDb.query.mock.calls[1];
      const sql = followingQueryCall[0] as string;
      // The WHERE should filter on follower_id (the user whose following list we're viewing)
      expect(sql).toContain('f.follower_id = $1');
      // The JOIN should be on following_id (the users being followed)
      expect(sql).toContain('f.following_id = p.id');
    });
  });

  // ── 9. Error handling ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs during profile lookup', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when following query fails', async () => {
      // Profile exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', is_private: false }],
      });

      // Following query fails
      mockDb.query.mockRejectedValueOnce(new Error('Query timeout'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
