/**
 * Unit Tests: createFeedHandler
 *
 * Tests the factory for feed handlers. Pipeline:
 * auth -> rate limit (fail-open) -> parse pagination -> get DB -> resolve profile ->
 * build compound cursor -> execute query -> batch-fetch is_liked/is_saved ->
 * transform to camelCase -> return paginated response.
 */

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
  Logger: jest.fn(),
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
    'Cache-Control': 'public, max-age=15',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  MAX_REPORT_REASON_LENGTH: 500,
  MAX_REPORT_DETAILS_LENGTH: 2000,
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createFeedHandler } from '../../utils/create-feed-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
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

function makePostRow(id: string, createdAt: string) {
  return {
    id,
    author_id: 'author-1',
    content: 'Test post',
    media_urls: ['https://example.com/img.jpg'],
    media_type: 'image',
    media_meta: {},
    tags: ['test'],
    likes_count: 5,
    comments_count: 2,
    created_at: createdAt,
    profile_id: 'profile-1',
    username: 'testuser',
    full_name: 'Test User',
    display_name: 'Test',
    avatar_url: 'https://example.com/avatar.jpg',
    is_verified: false,
    account_type: 'personal',
    business_name: null,
  };
}

describe('createFeedHandler', () => {
  let mockQuery: jest.Mock;
  let mockBuildQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockedIsValidUUID.mockReturnValue(true);

    mockBuildQuery = jest.fn().mockImplementation((_userId, params, _cursor, _limitIdx) => ({
      sql: 'SELECT * FROM posts p WHERE p.author_id = $1 LIMIT $' + params.length,
      params,
    }));
  });

  it('should return 401 when no auth', async () => {
    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent({ sub: null }));

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(429);
  });

  it('should return 200 with empty data when profile not found (not 404)', async () => {
    mockedResolveProfileId.mockResolvedValue(null);

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  it('should return 400 for invalid cursor format (compound)', async () => {
    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent({
      queryStringParameters: { cursor: 'not-a-date|some-id' },
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('should return 400 for invalid compound cursor UUID', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const validDate = new Date().toISOString();
    const result = await handler(makeEvent({
      queryStringParameters: { cursor: `${validDate}|not-a-uuid` },
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('should return 400 for invalid legacy cursor (bad date)', async () => {
    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent({
      queryStringParameters: { cursor: 'not-a-date' },
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  it('should handle compound cursor pagination correctly', async () => {
    const cursorDate = '2025-01-15T10:00:00.000Z';
    const cursorId = POST_ID_1;
    mockedIsValidUUID.mockReturnValue(true);

    // Main query returns 1 row (no hasMore)
    const row = makePostRow(POST_ID_2, '2025-01-14T10:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [row] }) // feed query
      .mockResolvedValueOnce({ rows: [] }) // liked
      .mockResolvedValueOnce({ rows: [] }); // saved

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent({
      queryStringParameters: { cursor: `${cursorDate}|${cursorId}` },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('should handle legacy cursor correctly', async () => {
    const cursorDate = '2025-01-15T10:00:00.000Z';

    const row = makePostRow(POST_ID_1, '2025-01-14T10:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent({
      queryStringParameters: { cursor: cursorDate },
    }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).data).toHaveLength(1);
  });

  it('should detect hasMore and return nextCursor', async () => {
    // Default limit is 20, so we need 21 rows for hasMore = true
    const rows = Array.from({ length: 21 }, (_, i) =>
      makePostRow(`post-${i}`, `2025-01-${String(20 - i).padStart(2, '0')}T10:00:00.000Z`)
    );

    mockQuery
      .mockResolvedValueOnce({ rows }) // feed query returns limit+1
      .mockResolvedValueOnce({ rows: [] }) // liked
      .mockResolvedValueOnce({ rows: [] }); // saved

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    expect(body.data).toHaveLength(20); // trimmed to limit
  });

  it('should batch-fetch is_liked and is_saved', async () => {
    const row = makePostRow(POST_ID_1, '2025-01-15T10:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [row] }) // feed
      .mockResolvedValueOnce({ rows: [{ post_id: POST_ID_1 }] }) // liked
      .mockResolvedValueOnce({ rows: [] }); // saved

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data[0].isLiked).toBe(true);
    expect(body.data[0].isSaved).toBe(false);
  });

  it('should transform rows to camelCase', async () => {
    const row = makePostRow(POST_ID_1, '2025-01-15T10:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    const body = JSON.parse(result.body);
    const post = body.data[0];
    expect(post.authorId).toBe('author-1');
    expect(post.mediaUrls).toEqual(['https://example.com/img.jpg']);
    expect(post.mediaType).toBe('image');
    expect(post.likesCount).toBe(5);
    expect(post.commentsCount).toBe(2);
    expect(post.author).toEqual({
      id: 'profile-1',
      username: 'testuser',
      fullName: 'Test User',
      displayName: 'Test',
      avatarUrl: 'https://example.com/avatar.jpg',
      isVerified: false,
      accountType: 'personal',
      businessName: null,
    });
  });

  it('should include video fields when includeVideoFields is true', async () => {
    const row = {
      ...makePostRow(POST_ID_1, '2025-01-15T10:00:00.000Z'),
      video_status: 'ready',
      hls_url: 'https://example.com/video.m3u8',
      thumbnail_url: 'https://example.com/thumb.jpg',
      video_variants: ['720p', '1080p'],
      video_duration: 30,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
      includeVideoFields: true,
    });

    const result = await handler(makeEvent());

    const body = JSON.parse(result.body);
    const post = body.data[0];
    expect(post.videoStatus).toBe('ready');
    expect(post.hlsUrl).toBe('https://example.com/video.m3u8');
    expect(post.thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(post.videoVariants).toEqual(['720p', '1080p']);
    expect(post.videoDuration).toBe(30);
  });

  it('should NOT include video fields when includeVideoFields is false (default)', async () => {
    const row = {
      ...makePostRow(POST_ID_1, '2025-01-15T10:00:00.000Z'),
      video_status: 'ready',
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    const body = JSON.parse(result.body);
    expect(body.data[0].videoStatus).toBeUndefined();
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should not batch-fetch liked/saved when feed is empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // feed query returns empty

    const { handler } = createFeedHandler({
      loggerName: 'feed-test',
      rateLimitPrefix: 'feed-test',
      buildQuery: mockBuildQuery,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
    // Only the main feed query should have been called, not likes/saved
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
