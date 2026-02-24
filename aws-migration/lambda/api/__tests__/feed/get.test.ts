/**
 * Tests for feed/get Lambda handler
 * Validates personalized feed retrieval with Redis caching,
 * visibility filtering, cursor pagination, and batch is_liked/is_saved.
 */

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
    'Cache-Control': 'private, max-age=30',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  CACHE_TTL_SHORT: 15,
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

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { handler } from '../../feed/get';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

// --- Test data constants ---
const TEST_COGNITO_SUB = 'cognito-sub-feed-get-123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const _TEST_POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-def1-234567890123';
const TEST_FOLLOWING_ID = 'e5f6a7b8-c9d0-1234-ef12-345678901234';

function makePostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_POST_ID_1,
    author_id: TEST_AUTHOR_ID,
    content: 'Feed post content',
    media_urls: ['https://media.example.com/photo.jpg'],
    media_type: 'image',
    media_meta: { width: 800, height: 600 },
    tags: ['food'],
    likes_count: 10,
    comments_count: 5,
    created_at: '2026-02-15T12:00:00Z',
    visibility: 'public',
    author: {
      id: TEST_AUTHOR_ID,
      username: 'feeduser',
      full_name: 'Feed User',
      display_name: 'FeedUser',
      avatar_url: 'https://media.example.com/avatar.jpg',
      is_verified: false,
      account_type: 'personal',
      business_name: null,
    },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<{
  cognitoSub: string | null;
  queryStringParameters: Record<string, string> | null;
}> = {}): APIGatewayProxyEvent {
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
    path: '/feed',
    stageVariables: null,
    resource: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: cognitoSub ? { claims: { sub: cognitoSub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('feed/get handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset REDIS_ENDPOINT so Redis is not used by default
    delete process.env.REDIS_ENDPOINT;

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (mockedGetPool as jest.Mock).mockResolvedValue(mockDb);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockedIsValidUUID.mockReturnValue(true);
  });

  // ---------------------------------------------------------------
  // 1. Auth: unauthenticated returns 401
  // ---------------------------------------------------------------
  it('should return 401 when no auth token provided', async () => {
    const event = makeEvent({ cognitoSub: null });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  // ---------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------
  it('should return 429 when rate limited', async () => {
    (mockedRequireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
    });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(429);
    expect(JSON.parse(result.body).message).toContain('Too many requests');
  });

  // ---------------------------------------------------------------
  // 3. No profile returns empty 200
  // ---------------------------------------------------------------
  it('should return 200 with empty feed when user has no profile', async () => {
    mockedResolveProfileId.mockResolvedValue(null);

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
    expect(body.total).toBe(0);
  });

  // ---------------------------------------------------------------
  // 4. Happy path: returns feed with correct shape
  // ---------------------------------------------------------------
  it('should return feed posts with correct response shape (200)', async () => {
    const postRow = makePostRow();

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ following_id: TEST_FOLLOWING_ID }] })   // following list
      .mockResolvedValueOnce({ rows: [{ creator_id: TEST_AUTHOR_ID }] })        // subscriptions
      .mockResolvedValueOnce({ rows: [postRow] })                                // feed query
      .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] })           // liked batch
      .mockResolvedValueOnce({ rows: [] });                                       // saved batch

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);

    const post = body.data[0];
    expect(post.id).toBe(TEST_POST_ID_1);
    expect(post.authorId).toBe(TEST_AUTHOR_ID);
    expect(post.content).toBe('Feed post content');
    expect(post.mediaUrls).toEqual(['https://media.example.com/photo.jpg']);
    expect(post.likesCount).toBe(10);
    expect(post.commentsCount).toBe(5);
    expect(post.isLiked).toBe(true);
    expect(post.isSaved).toBe(false);
  });

  // ---------------------------------------------------------------
  // 5. Null optional fields get defaults
  // ---------------------------------------------------------------
  it('should handle null/missing optional fields with defaults', async () => {
    const postRow = makePostRow({
      media_urls: null,
      media_meta: null,
      tags: null,
      likes_count: null,
      comments_count: null,
    });

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })           // following list (empty)
      .mockResolvedValueOnce({ rows: [] })           // subscriptions (empty)
      .mockResolvedValueOnce({ rows: [postRow] })    // feed query
      .mockResolvedValueOnce({ rows: [] })           // liked
      .mockResolvedValueOnce({ rows: [] });          // saved

    const event = makeEvent();
    const result = await handler(event);

    const post = JSON.parse(result.body).data[0];
    expect(post.mediaUrls).toEqual([]);
    expect(post.mediaMeta).toEqual({});
    expect(post.tags).toEqual([]);
    expect(post.likesCount).toBe(0);
    expect(post.commentsCount).toBe(0);
  });

  // ---------------------------------------------------------------
  // 6. Pagination: hasMore and nextCursor (compound cursor)
  // ---------------------------------------------------------------
  it('should detect hasMore and return compound nextCursor', async () => {
    // limit=20 default, 21 rows -> hasMore=true
    const rows = Array.from({ length: 21 }, (_, i) =>
      makePostRow({
        id: `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}`,
        created_at: `2026-02-${String(15 - i).padStart(2, '0')}T12:00:00Z`,
      })
    );

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })           // following list
      .mockResolvedValueOnce({ rows: [] })           // subscriptions
      .mockResolvedValueOnce({ rows })               // feed query (21 rows)
      .mockResolvedValueOnce({ rows: [] })           // liked
      .mockResolvedValueOnce({ rows: [] });          // saved

    const event = makeEvent();
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    // Compound cursor format: "created_at|id"
    expect(body.nextCursor).toContain('|');
    expect(body.data).toHaveLength(20);
    expect(body.total).toBe(20);
  });

  // ---------------------------------------------------------------
  // 7. Limit capped at 50
  // ---------------------------------------------------------------
  it('should cap limit at 50', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { limit: '200' } });
    await handler(event);

    // The feed query (3rd call) should have limit+1=51 in its params
    const feedCall = mockDb.query.mock.calls[2];
    const feedParams: unknown[] = feedCall[1];
    expect(feedParams).toContain(51);
  });

  // ---------------------------------------------------------------
  // 8. Invalid compound cursor: bad UUID portion
  // ---------------------------------------------------------------
  it('should return 400 for compound cursor with invalid UUID', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      queryStringParameters: { cursor: '2026-02-15T12:00:00Z|not-a-uuid' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid cursor');
  });

  // ---------------------------------------------------------------
  // 9. Invalid compound cursor: bad date portion
  // ---------------------------------------------------------------
  it('should return 400 for compound cursor with invalid date', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'not-a-date|' + TEST_POST_ID_1 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid cursor');
  });

  // ---------------------------------------------------------------
  // 10. Invalid legacy cursor: bad date
  // ---------------------------------------------------------------
  it('should return 400 for invalid legacy cursor (bad date)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      queryStringParameters: { cursor: 'not-a-date' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Invalid cursor');
  });

  // ---------------------------------------------------------------
  // 11. Empty feed: no batch queries for likes/saved
  // ---------------------------------------------------------------
  it('should not batch-fetch liked/saved when feed is empty', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })   // following list
      .mockResolvedValueOnce({ rows: [] })   // subscriptions
      .mockResolvedValueOnce({ rows: [] });  // feed query (empty)

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // 3 queries: following, subscriptions, feed — no likes/saved batch
    expect(mockDb.query).toHaveBeenCalledTimes(3);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
  });

  // ---------------------------------------------------------------
  // 12. DB error returns 500
  // ---------------------------------------------------------------
  it('should return 500 when database query throws', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 13. getPool failure returns 500
  // ---------------------------------------------------------------
  it('should return 500 when getPool throws', async () => {
    (mockedGetPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 14. SQL query includes visibility filtering
  // ---------------------------------------------------------------
  it('should filter by visibility and moderation status in SQL query', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })   // following
      .mockResolvedValueOnce({ rows: [] })   // subscriptions
      .mockResolvedValueOnce({ rows: [] });  // feed

    const event = makeEvent();
    await handler(event);

    // Feed query is the 3rd query call
    const feedSql: string = mockDb.query.mock.calls[2][0];
    expect(feedSql).toContain("visibility != 'hidden'");
    expect(feedSql).toContain("COALESCE(pr.moderation_status, 'active') NOT IN ('banned', 'shadow_banned')");
    expect(feedSql).toContain('blocked_users');
    expect(feedSql).toContain('ORDER BY p.created_at DESC');
  });

  // ---------------------------------------------------------------
  // 15. Additional coverage - isSaved detection
  // ---------------------------------------------------------------
  it('should detect isSaved posts in batch lookup', async () => {
    const postRow = makePostRow();

    mockDb.query
      .mockResolvedValueOnce({ rows: [{ following_id: TEST_FOLLOWING_ID }] })   // following
      .mockResolvedValueOnce({ rows: [] })                                       // subscriptions
      .mockResolvedValueOnce({ rows: [postRow] })                                // feed query
      .mockResolvedValueOnce({ rows: [] })                                       // liked
      .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] });          // saved

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data[0].isSaved).toBe(true);
    expect(body.data[0].isLiked).toBe(false);
  });

  // ---------------------------------------------------------------
  // 16. Additional coverage - valid compound cursor parsing
  // ---------------------------------------------------------------
  it('should accept valid compound cursor with pipe separator', async () => {
    mockedIsValidUUID.mockReturnValue(true);

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })   // following
      .mockResolvedValueOnce({ rows: [] })   // subscriptions
      .mockResolvedValueOnce({ rows: [] });  // feed

    const event = makeEvent({
      queryStringParameters: { cursor: '2026-02-15T12:00:00Z|' + TEST_POST_ID_1 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });

  // ---------------------------------------------------------------
  // 17. Additional coverage - limit=1 (minimum)
  // ---------------------------------------------------------------
  it('should handle limit=1 correctly', async () => {
    const postRow = makePostRow();

    mockDb.query
      .mockResolvedValueOnce({ rows: [] })           // following
      .mockResolvedValueOnce({ rows: [] })           // subscriptions
      .mockResolvedValueOnce({ rows: [postRow, makePostRow({ id: 'extra-id' })] }) // feed (2 rows = hasMore)
      .mockResolvedValueOnce({ rows: [] })           // liked
      .mockResolvedValueOnce({ rows: [] });          // saved

    const event = makeEvent({ queryStringParameters: { limit: '1' } });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(true);
  });
});
