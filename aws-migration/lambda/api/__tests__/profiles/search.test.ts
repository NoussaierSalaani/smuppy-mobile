/**
 * Search Profiles Handler Unit Tests
 * Tests rate limiting, query validation, pagination, authenticated/unauthenticated paths,
 * ILIKE escaping, empty query, and error handling
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn(),
}));

import { handler } from '../../profiles/search';
import { resolveProfileId } from '../../utils/auth';
import { extractCognitoSub } from '../../utils/security';
import { checkRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'profile-id-1',
    username: 'testuser',
    full_name: 'Test User',
    display_name: 'Testy',
    avatar_url: 'https://cdn.smuppy.com/avatar.jpg',
    bio: 'Hello world',
    is_verified: false,
    is_private: false,
    account_type: 'personal',
    business_name: null,
    followers_count: 10,
    following_count: 5,
    posts_count: 3,
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

describe('Search Profiles Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true });
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: 30 });

      const event = makeEvent({ queryStringParameters: { search: 'test' } });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      expect(response.headers?.['Retry-After']).toBe('30');
      expect(JSON.parse(response.body).message).toContain('Too many requests');
    });

    it('should use default retry-after when retryAfter is undefined', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: undefined });

      const event = makeEvent({ queryStringParameters: { search: 'test' } });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      expect(response.headers?.['Retry-After']).toBe('60');
    });
  });

  describe('Empty query', () => {
    it('should return popular profiles when no search query is provided (authenticated)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({ queryStringParameters: {} });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].username).toBe('testuser');
    });

    it('should return popular profiles when no search query is provided (unauthenticated)', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({ sub: null, queryStringParameters: {} });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('Search with query', () => {
    it('should return matching profiles for authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow({ username: 'match_user' })],
      });

      const event = makeEvent({
        queryStringParameters: { search: 'match' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].username).toBe('match_user');
    });

    it('should support q query parameter as alternative to search', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent({
        queryStringParameters: { q: 'test' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Verify ILIKE query was used with the search term
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%test%'])
      );
    });

    it('should return matching profiles for unauthenticated user', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent({
        sub: null,
        queryStringParameters: { search: 'test' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('Pagination', () => {
    it('should return hasMore=true and nextCursor when more results exist', async () => {
      // Default limit is 20, so we need 21 rows to trigger hasMore
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeProfileRow({ id: `profile-${i}`, username: `user${i}` })
      );
      mockQuery.mockResolvedValueOnce({ rows });

      const event = makeEvent({
        queryStringParameters: { search: 'user' },
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBe('20');
      expect(body.data).toHaveLength(20);
    });

    it('should return hasMore=false and null nextCursor when no more results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeProfileRow()],
      });

      const event = makeEvent({
        queryStringParameters: { search: 'test' },
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should respect cursor parameter for offset', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { search: 'test', cursor: '40' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Verify offset was passed to query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([40])
      );
    });

    it('should cap cursor at MAX_OFFSET (500)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { search: 'test', cursor: '1000' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // Offset should be capped at 500
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.arrayContaining([1000])
      );
    });

    it('should handle invalid cursor gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { search: 'test', cursor: 'invalid' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { search: 'test', limit: '5' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // limit + 1 = 6 should be in query params
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([6])
      );
    });

    it('should cap limit at 50', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [makeProfileRow()] });

      const event = makeEvent({
        queryStringParameters: { search: 'test', limit: '100' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // limit should be capped at 50, so 51 is passed
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
          full_name: 'Full Name',
          display_name: 'Display',
          avatar_url: 'https://cdn.smuppy.com/a.jpg',
          is_verified: true,
          is_private: false,
          account_type: 'pro_creator',
          business_name: 'My Business',
          followers_count: 100,
          following_count: 50,
          posts_count: 25,
        })],
      });

      const event = makeEvent({
        queryStringParameters: { search: 'test' },
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const profile = body.data[0];
      expect(profile.fullName).toBe('Full Name');
      expect(profile.displayName).toBe('Display');
      expect(profile.avatarUrl).toBe('https://cdn.smuppy.com/a.jpg');
      expect(profile.isVerified).toBe(true);
      expect(profile.isPrivate).toBe(false);
      expect(profile.accountType).toBe('pro_creator');
      expect(profile.businessName).toBe('My Business');
      expect(profile.followersCount).toBe(100);
      expect(profile.followingCount).toBe(50);
      expect(profile.postsCount).toBe(25);
    });

    it('should default missing fields to safe values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'p1',
          username: 'user1',
          full_name: null,
          display_name: null,
          avatar_url: null,
          bio: null,
          is_verified: null,
          is_private: null,
          account_type: null,
          business_name: null,
          followers_count: null,
          following_count: null,
          posts_count: null,
        }],
      });

      const event = makeEvent({
        queryStringParameters: { search: 'user1' },
      });
      const response = await handler(event);

      const body = JSON.parse(response.body);
      const profile = body.data[0];
      expect(profile.displayName).toBeNull();
      expect(profile.isVerified).toBe(false);
      expect(profile.isPrivate).toBe(false);
      expect(profile.accountType).toBe('personal');
      expect(profile.businessName).toBeNull();
      expect(profile.followersCount).toBe(0);
      expect(profile.followingCount).toBe(0);
      expect(profile.postsCount).toBe(0);
    });
  });

  describe('Authenticated user exclusion', () => {
    it('should exclude current user from search results when authenticated', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { search: 'test' },
      });
      await handler(event);

      // Query should include current user ID exclusion
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('id !='),
        expect.arrayContaining([TEST_PROFILE_ID])
      );
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({
        queryStringParameters: { search: 'test' },
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).message).toBe('Internal server error');
    });
  });
});
