/**
 * Suggested Profiles Handler Unit Tests
 * Tests rate limiting, unauthenticated/authenticated/no-profile paths, pagination, and errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({ query: mockQuery }),
  getReaderPool: jest.fn().mockResolvedValue({ query: mockQuery }),
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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../profiles/suggested';
import { resolveProfileId } from '../../utils/auth';
import { checkRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'suggested-profile-1',
    username: 'suggesteduser',
    full_name: 'Suggested User',
    display_name: 'Suggested',
    avatar_url: 'https://cdn.smuppy.com/avatar.jpg',
    cover_url: 'https://cdn.smuppy.com/cover.jpg',
    bio: 'Bio text',
    is_verified: false,
    is_private: false,
    account_type: 'personal',
    business_name: null,
    fan_count: 50,
    following_count: 20,
    post_count: 10,
    is_followed_by: false,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
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

// --- Tests ---

describe('Suggested Profiles Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true });
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: 15 });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      expect(response.headers?.['Retry-After']).toBe('15');
      expect(JSON.parse(response.body).message).toContain('Too many requests');
    });

    it('should use default retry-after when retryAfter is undefined', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: undefined });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      expect(response.headers?.['Retry-After']).toBe('60');
    });
  });

  describe('Unauthenticated path', () => {
    it('should return popular profiles for unauthenticated user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent({ sub: null });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.profiles).toHaveLength(1);
      expect(body.profiles[0].username).toBe('suggesteduser');
      expect(body.profiles[0].isFollowing).toBe(false);
    });
  });

  describe('Authenticated with no profile', () => {
    it('should return popular profiles when user has no profile yet', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.profiles).toHaveLength(1);
    });
  });

  describe('Authenticated with profile', () => {
    it('should return suggested profiles excluding followed and blocked users', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.profiles).toHaveLength(1);
      // Query should use CTE for excluded IDs
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('excluded_ids'),
        expect.arrayContaining([TEST_PROFILE_ID])
      );
    });

    it('should include isFollowedBy flag from query', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow({ is_followed_by: true })],
      });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.profiles[0].isFollowedBy).toBe(true);
    });
  });

  describe('Pagination', () => {
    it('should return hasMore=true and nextCursor when more results exist', async () => {
      // Default limit is 10, need 11 rows
      const rows = Array.from({ length: 11 }, (_, i) =>
        makeProfileRow({ id: `profile-${i}` })
      );
      mockQuery.mockResolvedValueOnce({ rows });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBe('10');
      expect(body.profiles).toHaveLength(10);
    });

    it('should return hasMore=false and null nextCursor when no more results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should respect cursor parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { cursor: '20' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([20])
      );
    });

    it('should cap cursor offset at MAX_OFFSET (500)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { cursor: '9999' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([500])
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // limit + 1 = 6 should be in params
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([6])
      );
    });

    it('should cap limit at 50', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '200' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // limit should be capped at 50, so 51 passed
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([51])
      );
    });
  });

  describe('Response mapping', () => {
    it('should map DB snake_case to camelCase in response', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow({
          full_name: 'John Doe',
          display_name: 'Johnny',
          avatar_url: 'https://cdn.smuppy.com/a.jpg',
          cover_url: 'https://cdn.smuppy.com/c.jpg',
          is_verified: true,
          account_type: 'pro_creator',
          business_name: 'JD Inc',
          fan_count: 100,
          following_count: 50,
          post_count: 25,
        })],
      });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const profile = body.profiles[0];
      expect(profile.fullName).toBe('John Doe');
      expect(profile.displayName).toBe('Johnny');
      expect(profile.avatarUrl).toBe('https://cdn.smuppy.com/a.jpg');
      expect(profile.coverUrl).toBe('https://cdn.smuppy.com/c.jpg');
      expect(profile.isVerified).toBe(true);
      expect(profile.accountType).toBe('pro_creator');
      expect(profile.businessName).toBe('JD Inc');
      expect(profile.followersCount).toBe(100);
      expect(profile.followingCount).toBe(50);
      expect(profile.postsCount).toBe(25);
    });

    it('should default missing fields to safe values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'p1', username: 'user1', full_name: null, display_name: null,
          avatar_url: null, cover_url: null, bio: null, is_verified: null,
          is_private: null, account_type: null, business_name: null,
          fan_count: null, following_count: null, post_count: null,
          is_followed_by: null,
        }],
      });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const profile = body.profiles[0];
      expect(profile.displayName).toBeNull();
      expect(profile.isVerified).toBe(false);
      expect(profile.isPrivate).toBe(false);
      expect(profile.accountType).toBe('personal');
      expect(profile.businessName).toBeNull();
      expect(profile.followersCount).toBe(0);
      expect(profile.followingCount).toBe(0);
      expect(profile.postsCount).toBe(0);
      expect(profile.isFollowing).toBe(false);
      expect(profile.isFollowedBy).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).message).toBe('Internal server error');
    });
  });
});
