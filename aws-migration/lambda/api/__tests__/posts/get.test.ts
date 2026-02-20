/**
 * Tests for posts/get Lambda handler
 * Validates UUID validation, rate limiting, post not found, blocked users,
 * private accounts, banned/shadow_banned authors, hidden posts, and happy path.
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

jest.mock('../../utils/validators', () => {
  return {
    requireAuth: jest.fn(),
    validateUUIDParam: jest.fn(),
    isErrorResponse: jest.fn((val: unknown) => typeof val !== 'string'),
  };
});

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
}));

import { handler } from '../../posts/get';
import { requireRateLimit } from '../../utils/rate-limit';
import { validateUUIDParam } from '../../utils/validators';
import { extractCognitoSub } from '../../utils/security';

// ── Constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const AUTHOR_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const AUTHOR_SUB = 'author-cognito-sub-456';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_POST_ID },
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

function makePostRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TEST_POST_ID,
    author_id: AUTHOR_PROFILE_ID,
    content: 'Hello world',
    caption: null,
    media_urls: ['https://cdn.example.com/image.jpg'],
    media_url: null,
    media_type: 'image',
    media_meta: {},
    visibility: 'public',
    likes_count: 5,
    comments_count: 2,
    is_peak: false,
    peak_duration: null,
    peak_expires_at: null,
    save_to_profile: true,
    location: 'Paris, France',
    tags: null,
    created_at: '2026-02-16T12:00:00Z',
    updated_at: '2026-02-16T12:00:00Z',
    video_status: null,
    hls_url: null,
    thumbnail_url: null,
    video_variants: null,
    video_duration: null,
    author_is_private: false,
    author_cognito_sub: AUTHOR_SUB,
    author_moderation_status: 'active',
    author: {
      id: AUTHOR_PROFILE_ID,
      username: 'author_user',
      fullName: 'Author User',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      isVerified: false,
      accountType: 'personal',
      businessName: null,
    },
    ...overrides,
  };
}

// ── Test Suite ──

describe('posts/get handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Default: validateUUIDParam returns the post ID
    (validateUUIDParam as jest.Mock).mockReturnValue(TEST_POST_ID);

    // Default: extractCognitoSub returns authenticated user
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
  });

  // ── 1. Validation ──

  describe('validation', () => {
    it('should return 400 when post ID is invalid', async () => {
      (validateUUIDParam as jest.Mock).mockReturnValue({
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Invalid post ID format' }),
      });

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid');
    });

    it('should return 400 when post ID is missing', async () => {
      (validateUUIDParam as jest.Mock).mockReturnValue({
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Post ID is required' }),
      });

      const event = makeEvent({ pathParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── 2. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // ── 3. Post not found ──

  describe('resource existence', () => {
    it('should return 404 when post is not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 4. Banned/shadow banned author ──

  describe('moderation status filtering', () => {
    it('should return 404 when author is banned and requester is not the author', async () => {
      const post = makePostRow({ author_moderation_status: 'banned' });
      mockDb.query.mockResolvedValueOnce({ rows: [post] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });

    it('should return 404 when author is shadow_banned and requester is not the author', async () => {
      const post = makePostRow({ author_moderation_status: 'shadow_banned' });
      mockDb.query.mockResolvedValueOnce({ rows: [post] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });

    it('should allow author to see their own post even if banned', async () => {
      // currentUserId matches author_cognito_sub
      (extractCognitoSub as jest.Mock).mockReturnValue(AUTHOR_SUB);

      const post = makePostRow({ author_moderation_status: 'banned' });
      // Main query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Block check (not needed since isAuthor, but tagged users query runs)
      // tagged users query (no block check needed since isAuthor)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ sub: AUTHOR_SUB });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 5. Hidden post ──

  describe('hidden visibility', () => {
    it('should return 404 for hidden posts when requester is not the author', async () => {
      const post = makePostRow({ visibility: 'hidden' });
      mockDb.query.mockResolvedValueOnce({ rows: [post] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 6. Block check ──

  describe('block check', () => {
    it('should return 404 when a block exists between requester and author', async () => {
      const post = makePostRow();
      // Main query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Promise.all: [blockCheck, followCheck=noRows (not private), taggedUsers]
      // needsBlockCheck=true, needsFollowCheck=false (not private)
      // 2 real queries: blockCheck + taggedUsers
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // block found
        .mockResolvedValueOnce({ rows: [] }); // tagged users

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 7. Private account check ──

  describe('private account access', () => {
    it('should return 403 when post is from private account and requester is not a follower', async () => {
      const post = makePostRow({ author_is_private: true });
      // Main query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Promise.all: [blockCheck, followCheck, taggedUsers]
      // needsBlockCheck=true, needsFollowCheck=true (private + auth + not author)
      // 3 real queries: blockCheck + followCheck + taggedUsers
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // no block
        .mockResolvedValueOnce({ rows: [] }) // not following
        .mockResolvedValueOnce({ rows: [] }); // tagged users

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('This post is from a private account');
    });

    it('should return 200 when post is from private account and requester is a follower', async () => {
      const post = makePostRow({ author_is_private: true });
      // Main query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Promise.all: [blockCheck, followCheck, taggedUsers]
      // needsBlockCheck=true, needsFollowCheck=true (private + auth + not author)
      // 3 real queries: blockCheck + followCheck + taggedUsers
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })          // no block
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // following
        .mockResolvedValueOnce({ rows: [] });          // tagged users

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 8. Happy path ──

  describe('successful get', () => {
    it('should return 200 with post data and author info', async () => {
      const post = makePostRow();
      // Main post query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // Promise.all: [blockCheck, followCheck=noRows (not private), taggedUsers (with block filter)]
      // needsBlockCheck=true (authenticated + not author), needsFollowCheck=false (not private)
      // So only 2 real queries: blockCheck + taggedUsers (followCheck resolves to noRows without query)
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })  // block check — no block
        .mockResolvedValueOnce({              // tagged users (with block exclusion)
          rows: [{
            id: 'tagged-user-id',
            username: 'taggeduser',
            full_name: 'Tagged User',
            avatar_url: 'https://cdn.example.com/tagged.jpg',
          }],
        });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe(TEST_POST_ID);
      expect(body.authorId).toBe(AUTHOR_PROFILE_ID);
      expect(body.content).toBe('Hello world');
      expect(body.mediaUrls).toEqual(['https://cdn.example.com/image.jpg']);
      expect(body.mediaType).toBe('image');
      expect(body.likesCount).toBe(5);
      expect(body.commentsCount).toBe(2);
      expect(body.author).toBeDefined();
      expect(body.taggedUsers).toHaveLength(1);
      expect(body.taggedUsers[0].username).toBe('taggeduser');
    });

    it('should work for unauthenticated requests on public posts', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      const post = makePostRow();
      // Main query
      mockDb.query.mockResolvedValueOnce({ rows: [post] });
      // tagged users (no block check needed — not authenticated)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 9. DB error ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
