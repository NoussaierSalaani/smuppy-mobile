/**
 * Tests for posts/list Lambda handler
 * Validates pagination, cursor, filters, auth optional, blocked users filtering.
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  }));
});

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../posts/list';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const OTHER_USER_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

const NOW_ISO = '2026-02-19T12:00:00.000Z';

function makePost(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    authorId: OTHER_USER_ID,
    content: 'Test post content',
    mediaUrls: ['https://example.com/img.jpg'],
    mediaType: 'image',
    mediaMeta: {},
    isPeak: false,
    location: null,
    tags: [],
    likesCount: '5',
    commentsCount: '2',
    createdAt: NOW_ISO,
    videoStatus: null,
    hlsUrl: null,
    thumbnailUrl: null,
    videoVariants: null,
    videoDuration: null,
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    ...overrides,
  };
}

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  queryParams?: Record<string, string> | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_USER_ID : overrides.sub;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: null,
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

describe('posts/list handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);

    // Reset REDIS_HOST so Redis is not used by default
    delete process.env.REDIS_HOST;
  });

  // ── 1. Unauthenticated access (public feed) ──

  describe('unauthenticated access', () => {
    it('should return 200 with posts for unauthenticated requests (public feed)', async () => {
      const post1 = makePost('p1');
      mockDb.query
        .mockResolvedValueOnce({ rows: [post1] })  // main posts query
        .mockResolvedValueOnce({ rows: [] });       // tags query

      const event = buildEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.posts).toHaveLength(1);
      expect(body.posts[0].id).toBe('p1');
    });

    it('should not call rate limit for unauthenticated users', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ sub: null });

      await handler(event);

      expect(requireRateLimit).not.toHaveBeenCalled();
    });
  });

  // ── 2. Validation ──

  describe('validation', () => {
    it('should return 400 when userId query parameter is not a valid UUID', async () => {
      const event = buildEvent({ queryParams: { userId: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid userId format');
    });
  });

  // ── 3. Pagination ──

  describe('pagination', () => {
    it('should return hasMore=true and nextCursor when more posts exist', async () => {
      // Default limit is 20, so return 21 posts to trigger hasMore
      const posts = Array.from({ length: 21 }, (_, i) =>
        makePost(`post-${i}`, { createdAt: new Date(Date.now() - i * 1000).toISOString() }),
      );
      mockDb.query
        .mockResolvedValueOnce({ rows: posts })    // main posts query
        .mockResolvedValueOnce({ rows: [] });      // tags query

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
      expect(body.posts).toHaveLength(20);
    });

    it('should return hasMore=false when no more posts exist', async () => {
      const posts = [makePost('p1'), makePost('p2')];
      mockDb.query
        .mockResolvedValueOnce({ rows: posts })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
      expect(body.posts).toHaveLength(2);
    });

    it('should clamp limit to maximum of 50', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ queryParams: { limit: '100' } });

      await handler(event);

      // The LIMIT in the query should be 51 (50 + 1 for hasMore check)
      const mainQuery = mockDb.query.mock.calls[0];
      const params = mainQuery[1] as unknown[];
      // First param is limit+1 for explore feed
      expect(params[0]).toBe(51);
    });

    it('should use cursor for pagination when provided', async () => {
      const cursorTimestamp = Date.now().toString();
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ queryParams: { cursor: cursorTimestamp } });

      await handler(event);

      // The query should include the cursor timestamp as a Date param
      const mainQuery = mockDb.query.mock.calls[0];
      const params = mainQuery[1] as unknown[];
      // For authenticated explore feed: limit+1, cursor date, requesterId
      expect(params).toHaveLength(3);
    });
  });

  // ── 4. Following feed requires auth ──

  describe('following feed', () => {
    it('should return 401 when following feed is requested without authentication', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = buildEvent({ sub: null, queryParams: { type: 'following' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Authentication required');
    });

    it('should return 401 when following feed is requested but profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = buildEvent({ queryParams: { type: 'following' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Authentication required');
    });

    it('should return posts from followed users for following feed', async () => {
      const post1 = makePost('follow-post-1');
      mockDb.query
        .mockResolvedValueOnce({ rows: [post1] })  // following feed query
        .mockResolvedValueOnce({ rows: [] })        // tags
        .mockResolvedValueOnce({ rows: [] })        // liked
        .mockResolvedValueOnce({ rows: [] });       // saved

      const event = buildEvent({ queryParams: { type: 'following' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.posts).toHaveLength(1);
    });

    it('should return 400 for invalid compound cursor format in following feed', async () => {
      const event = buildEvent({
        queryParams: { type: 'following', cursor: '2026-02-19T12:00:00.000Z|not-a-uuid' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid cursor format');
    });

    it('should return 400 for invalid legacy cursor in following feed', async () => {
      const event = buildEvent({
        queryParams: { type: 'following', cursor: 'not-a-number' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid cursor format');
    });

    it('should generate compound cursor (ISO|UUID) for following feed with hasMore', async () => {
      const posts = Array.from({ length: 21 }, (_, i) =>
        makePost(`fp-${i}`, { createdAt: new Date(Date.now() - i * 1000).toISOString() }),
      );
      mockDb.query
        .mockResolvedValueOnce({ rows: posts })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ queryParams: { type: 'following' } });

      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toContain('|');
    });
  });

  // ── 5. User profile feed ──

  describe('user profile feed', () => {
    it('should return empty posts for a private profile when not following', async () => {
      // Privacy check returns private
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_private: true }] });
      // Follow check returns no follow
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ queryParams: { userId: OTHER_USER_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.posts).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('should return empty posts for a private profile when unauthenticated', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      // Privacy check returns private
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_private: true }] });

      const event = buildEvent({ sub: null, queryParams: { userId: OTHER_USER_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.posts).toEqual([]);
    });
  });

  // ── 6. Post formatting ──

  describe('response formatting', () => {
    it('should format post data with author object and correct camelCase keys', async () => {
      const post = makePost('fmt-post', {
        likesCount: '10',
        commentsCount: '3',
        isVerified: true,
      });
      mockDb.query
        .mockResolvedValueOnce({ rows: [post] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({ sub: null });

      const result = await handler(event);

      const body = JSON.parse(result.body);
      const formattedPost = body.posts[0];
      expect(formattedPost.author).toBeDefined();
      expect(formattedPost.author.username).toBe('testuser');
      expect(formattedPost.author.fullName).toBe('Test User');
      expect(formattedPost.author.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(formattedPost.author.isVerified).toBe(true);
      expect(formattedPost.likesCount).toBe(10);
      expect(formattedPost.commentsCount).toBe(3);
      expect(formattedPost.isLiked).toBe(false);
      expect(formattedPost.isSaved).toBe(false);
    });

    it('should set isLiked=true and isSaved=true for liked/saved posts when authenticated', async () => {
      const postId = 'liked-post-id-aaaa-bbbb-ccccddddeeee';
      const post = makePost(postId);
      mockDb.query
        .mockResolvedValueOnce({ rows: [post] })                                  // main query
        .mockResolvedValueOnce({ rows: [] })                                       // tags
        .mockResolvedValueOnce({ rows: [{ post_id: postId }] })                   // liked
        .mockResolvedValueOnce({ rows: [{ post_id: postId }] });                  // saved

      const event = buildEvent({ queryParams: { userId: OTHER_USER_ID } });

      // Need to set up the privacy/follow checks first for the user profile feed
      // Re-mock to handle the privacy+follow check, then the posts query
      mockDb.query.mockReset();
      // Privacy check: public profile
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_private: false }] });
      // Follow check
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Main posts query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Tags
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liked posts
      mockDb.query.mockResolvedValueOnce({ rows: [{ post_id: postId }] });
      // Saved posts
      mockDb.query.mockResolvedValueOnce({ rows: [{ post_id: postId }] });

      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.posts[0].isLiked).toBe(true);
      expect(body.posts[0].isSaved).toBe(true);
    });

    it('should include taggedUsers in the response when tags exist', async () => {
      const postId = 'tagged-post-aaaa-bbbb-cccc-dddddddddddd';
      const post = makePost(postId);
      mockDb.query
        .mockResolvedValueOnce({ rows: [post] })
        .mockResolvedValueOnce({
          rows: [{
            post_id: postId,
            id: 'tagged-user-1',
            username: 'taggeduser',
            full_name: 'Tagged User',
            avatar_url: 'https://example.com/tagged.jpg',
          }],
        });

      const event = buildEvent({ sub: null });

      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.posts[0].taggedUsers).toHaveLength(1);
      expect(body.posts[0].taggedUsers[0].username).toBe('taggeduser');
    });
  });

  // ── 7. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded for authenticated user', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // ── 8. Error handling ──

  describe('error handling', () => {
    it('should return 500 when database error occurs', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  // ── 9. Empty results ──

  describe('empty results', () => {
    it('should return empty array when no posts match', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.posts).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
      expect(body.total).toBe(0);
    });
  });
});
