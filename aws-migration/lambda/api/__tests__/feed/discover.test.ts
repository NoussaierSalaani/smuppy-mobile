/**
 * Tests for feed/discover Lambda handler
 * Validates discover feed retrieval with engagement-ranked posts,
 * pagination, interest filtering, and blocked/muted user exclusion.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { checkRateLimit } from '../../utils/rate-limit';

// Mocks — must be before handler import (Jest hoists jest.mock calls)
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

import { handler } from '../../feed/discover';

// --- Test data constants ---
const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_COGNITO_SUB = 'cognito-sub-a1b2c3d4';
const TEST_POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-def1-234567890123';

function makePostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_POST_ID_1,
    author_id: TEST_AUTHOR_ID,
    content: 'Discover post content',
    media_urls: ['https://media.example.com/photo.jpg'],
    media_type: 'image',
    media_meta: { width: 800, height: 600 },
    tags: ['travel', 'photography'],
    likes_count: 10,
    comments_count: 5,
    created_at: '2026-02-15T12:00:00Z',
    video_status: null,
    hls_url: null,
    thumbnail_url: null,
    video_variants: null,
    video_duration: null,
    profile_id: TEST_AUTHOR_ID,
    username: 'discoverer',
    full_name: 'Discover User',
    display_name: 'Discoverer',
    avatar_url: 'https://media.example.com/avatar.jpg',
    is_verified: false,
    account_type: 'personal',
    business_name: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<{
  cognitoSub: string | null;
  queryStringParameters: Record<string, string> | null;
}>  = {}): APIGatewayProxyEvent {
  const { cognitoSub = TEST_COGNITO_SUB, queryStringParameters = null } = overrides;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/feed/discover',
    stageVariables: null,
    resource: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: cognitoSub ? { claims: { sub: cognitoSub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('feed/discover handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  // ---------------------------------------------------------------
  // 1. Auth: unauthenticated requests are allowed (discover is public)
  //    but verify that authenticated requests look up the user profile
  // ---------------------------------------------------------------
  describe('authentication', () => {
    it('should allow unauthenticated requests and return 200', async () => {
      // No cognitoSub -- anonymous browse
      const event = makeEvent({ cognitoSub: null });

      // Main feed query returns empty
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();

      // Should NOT look up profile when unauthenticated
      // Only the main feed query should be called (no profile lookup)
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should look up user profile when authenticated', async () => {
      const event = makeEvent();

      // First query: profile lookup, second: feed query
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [] }) // feed query
        .mockResolvedValueOnce({ rows: [] }) // likes batch
        .mockResolvedValueOnce({ rows: [] }); // saved batch

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // First call: profile lookup by cognito_sub
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [TEST_COGNITO_SUB]
      );
    });

    it('should return 429 when rate limited', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toBe('Too many requests');
    });
  });

  // ---------------------------------------------------------------
  // 2. Happy path: return feed posts with correct shape
  // ---------------------------------------------------------------
  describe('happy path', () => {
    it('should return feed posts with correct response shape (200)', async () => {
      const postRow1 = makePostRow();
      const postRow2 = makePostRow({
        id: TEST_POST_ID_2,
        content: 'Second post',
        likes_count: 3,
        comments_count: 1,
      });

      // Authenticated user
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [postRow1, postRow2] }) // feed query (no extra row = no hasMore)
        .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] }) // likes batch
        .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_2 }] }); // saved batch

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      expect(body.data).toHaveLength(2);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();

      // Verify camelCase mapping for first post
      const post = body.data[0];
      expect(post.id).toBe(TEST_POST_ID_1);
      expect(post.authorId).toBe(TEST_AUTHOR_ID);
      expect(post.content).toBe('Discover post content');
      expect(post.mediaUrls).toEqual(['https://media.example.com/photo.jpg']);
      expect(post.mediaType).toBe('image');
      expect(post.mediaMeta).toEqual({ width: 800, height: 600 });
      expect(post.tags).toEqual(['travel', 'photography']);
      expect(post.likesCount).toBe(10);
      expect(post.commentsCount).toBe(5);
      expect(post.createdAt).toBe('2026-02-15T12:00:00Z');
      expect(post.isLiked).toBe(true); // TEST_POST_ID_1 is in likes batch
      expect(post.isSaved).toBe(false);

      // Verify author sub-object
      expect(post.author.id).toBe(TEST_AUTHOR_ID);
      expect(post.author.username).toBe('discoverer');
      expect(post.author.fullName).toBe('Discover User');
      expect(post.author.displayName).toBe('Discoverer');
      expect(post.author.avatarUrl).toBe('https://media.example.com/avatar.jpg');
      expect(post.author.isVerified).toBe(false);
      expect(post.author.accountType).toBe('personal');

      // Second post should be saved but not liked
      expect(body.data[1].isLiked).toBe(false);
      expect(body.data[1].isSaved).toBe(true);
    });

    it('should handle null/missing optional fields with defaults', async () => {
      const postRow = makePostRow({
        media_urls: null,
        media_meta: null,
        tags: null,
        likes_count: null,
        comments_count: null,
        video_status: null,
        hls_url: null,
        thumbnail_url: null,
        video_variants: null,
        video_duration: null,
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] })
        .mockResolvedValueOnce({ rows: [postRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const post = JSON.parse(result.body).data[0];

      expect(post.mediaUrls).toEqual([]);
      expect(post.mediaMeta).toEqual({});
      expect(post.tags).toEqual([]);
      expect(post.likesCount).toBe(0);
      expect(post.commentsCount).toBe(0);
      expect(post.videoStatus).toBeNull();
      expect(post.hlsUrl).toBeNull();
      expect(post.thumbnailUrl).toBeNull();
      expect(post.videoVariants).toBeNull();
      expect(post.videoDuration).toBeNull();
    });

    it('should not batch-fetch likes/saved for unauthenticated users', async () => {
      const postRow = makePostRow();

      mockDb.query.mockResolvedValueOnce({ rows: [postRow] }); // feed query only

      const event = makeEvent({ cognitoSub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      // isLiked and isSaved should both be false (no userId)
      expect(body.data[0].isLiked).toBe(false);
      expect(body.data[0].isSaved).toBe(false);

      // Only 1 query (feed), no profile lookup, no likes/saved batch
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // 3. Pagination: cursor (offset-based) and limit parameters
  // ---------------------------------------------------------------
  describe('pagination', () => {
    it('should use default limit of 20 when not specified', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // feed query (unauthenticated)

      const event = makeEvent({ cognitoSub: null });
      await handler(event);

      // The feed query should use LIMIT 21 (limit+1 for hasMore check)
      const feedQueryCall = mockDb.query.mock.calls[0];
      const feedSql: string = feedQueryCall[0];
      expect(feedSql).toContain('LIMIT');
      // params should include 21 (20+1) and offset 0
      const feedParams: unknown[] = feedQueryCall[1];
      expect(feedParams).toContain(21);
      expect(feedParams).toContain(0);
    });

    it('should cap limit at 50', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { limit: '100' },
      });
      await handler(event);

      const feedParams: unknown[] = mockDb.query.mock.calls[0][1];
      // limit is capped at 50, so param is 51 (50+1)
      expect(feedParams).toContain(51);
    });

    it('should pass cursor as offset parameter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { cursor: '40' },
      });
      await handler(event);

      const feedParams: unknown[] = mockDb.query.mock.calls[0][1];
      expect(feedParams).toContain(40); // offset = 40
    });

    it('should cap offset at MAX_OFFSET (500)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { cursor: '9999' },
      });
      await handler(event);

      const feedParams: unknown[] = mockDb.query.mock.calls[0][1];
      expect(feedParams).toContain(500); // capped at 500
    });

    it('should return hasMore=true and nextCursor when more results exist', async () => {
      // Generate 21 rows (limit=20, fetch 21 to detect hasMore)
      const rows = Array.from({ length: 21 }, (_, i) =>
        makePostRow({ id: `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}` })
      );

      mockDb.query.mockResolvedValueOnce({ rows }); // feed query

      const event = makeEvent({ cognitoSub: null });
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBe('20'); // offset 0 + limit 20 = "20"
      expect(body.data).toHaveLength(20); // trimmed to 20 (not 21)
    });

    it('should calculate nextCursor based on current offset', async () => {
      // 11 rows returned (limit 10 + 1 extra)
      const rows = Array.from({ length: 11 }, (_, i) =>
        makePostRow({ id: `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}` })
      );

      mockDb.query.mockResolvedValueOnce({ rows }); // feed query

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { cursor: '30', limit: '10' },
      });
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBe('40'); // offset 30 + limit 10 = "40"
      expect(body.data).toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------
  // 4. Empty: return empty data when no posts
  // ---------------------------------------------------------------
  describe('empty results', () => {
    it('should return empty data array when no posts match', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [] }); // feed query — empty

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should return empty data when user profile not found (authenticated but no profile)', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // profile lookup — not found
        .mockResolvedValueOnce({ rows: [] }); // feed query

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // 5. Error: database errors produce 500
  // ---------------------------------------------------------------
  describe('error handling', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when feed query throws', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] }) // profile lookup ok
        .mockRejectedValueOnce(new Error('Query timeout')); // feed query fails

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when profile lookup throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Profile lookup failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // 6. Interest filtering
  // ---------------------------------------------------------------
  describe('interest filtering', () => {
    it('should pass interests as array parameter when provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { interests: 'travel,food,photography' },
      });
      await handler(event);

      const feedQueryCall = mockDb.query.mock.calls[0];
      const feedSql: string = feedQueryCall[0];
      const feedParams: unknown[] = feedQueryCall[1];

      // SQL should include tags overlap clause
      expect(feedSql).toContain('tags');
      expect(feedSql).toContain('::text[]');
      // Params should include parsed interests array
      expect(feedParams).toContainEqual(['travel', 'food', 'photography']);
    });

    it('should cap interests at MAX_INTERESTS (10)', async () => {
      const manyInterests = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(',');

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        cognitoSub: null,
        queryStringParameters: { interests: manyInterests },
      });
      await handler(event);

      const feedParams: unknown[] = mockDb.query.mock.calls[0][1];
      // The interests array should be capped to 10
      const interestsParam = feedParams.find(p => Array.isArray(p)) as string[];
      expect(interestsParam).toHaveLength(10);
    });
  });

  // ---------------------------------------------------------------
  // 7. SQL query structure for authenticated users
  // ---------------------------------------------------------------
  describe('query structure', () => {
    it('should exclude followed, blocked, and muted users for authenticated requests', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_USER_ID }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [] }); // feed query

      const event = makeEvent();
      await handler(event);

      // Second call is the feed query
      const feedSql: string = mockDb.query.mock.calls[1][0];

      // Should filter out followed users
      expect(feedSql).toContain('NOT IN (SELECT following_id FROM follows');
      // Should exclude own posts
      expect(feedSql).toContain('author_id !=');
      // Should exclude blocked users
      expect(feedSql).toContain('blocked_users');
      // Should exclude muted users
      expect(feedSql).toContain('muted_users');
      // Should filter public posts and non-banned profiles
      expect(feedSql).toContain("visibility = 'public'");
      expect(feedSql).toContain('moderation_status');
      // Should order by engagement score
      expect(feedSql).toContain('p.likes_count * 2 + p.comments_count');
    });
  });
});
