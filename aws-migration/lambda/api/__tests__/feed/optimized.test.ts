/**
 * Tests for feed/optimized Lambda handler
 * Validates optimized feed retrieval via createFeedHandler factory.
 * Pipeline: auth -> rate limit -> pagination -> DB -> resolve profile ->
 * compound cursor -> execute query -> batch-fetch is_liked/is_saved ->
 * camelCase transform (NO video fields) -> paginated response.
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
    'Cache-Control': 'private, max-age=30',
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
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { handler } from '../../feed/optimized';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

// --- Test data constants ---
const TEST_COGNITO_SUB = 'cognito-sub-opt-12345';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const _TEST_POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-def1-234567890123';

function makePostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_POST_ID_1,
    author_id: TEST_AUTHOR_ID,
    content: 'Optimized feed post',
    media_urls: ['https://media.example.com/img.jpg'],
    media_type: 'image',
    media_meta: { width: 1024, height: 768 },
    tags: ['nature'],
    likes_count: 12,
    comments_count: 4,
    created_at: '2026-02-15T10:00:00Z',
    profile_id: TEST_AUTHOR_ID,
    username: 'optuser',
    full_name: 'Opt User',
    display_name: 'OptUser',
    avatar_url: 'https://media.example.com/avatar.jpg',
    is_verified: true,
    account_type: 'pro_creator',
    business_name: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/feed/optimized',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_COGNITO_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('feed/optimized handler', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockedIsValidUUID.mockReturnValue(true);
  });

  // ---------------------------------------------------------------
  // 1. Auth: unauthenticated returns 401
  // ---------------------------------------------------------------
  it('should return 401 when no auth token provided', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  // ---------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------
  it('should return 429 when rate limited', async () => {
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(429);
  });

  // ---------------------------------------------------------------
  // 3. No profile returns empty 200
  // ---------------------------------------------------------------
  it('should return 200 with empty data when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  // ---------------------------------------------------------------
  // 4. Happy path: returns optimized feed with correct shape
  // ---------------------------------------------------------------
  it('should return posts with correct camelCase shape (200)', async () => {
    const postRow = makePostRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow] })   // feed query
      .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] }) // liked
      .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] }); // saved

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);

    const post = body.data[0];
    expect(post.id).toBe(TEST_POST_ID_1);
    expect(post.authorId).toBe(TEST_AUTHOR_ID);
    expect(post.content).toBe('Optimized feed post');
    expect(post.mediaUrls).toEqual(['https://media.example.com/img.jpg']);
    expect(post.likesCount).toBe(12);
    expect(post.commentsCount).toBe(4);
    expect(post.isLiked).toBe(true);
    expect(post.isSaved).toBe(true);
    expect(post.author.username).toBe('optuser');
    expect(post.author.isVerified).toBe(true);
    expect(post.author.accountType).toBe('pro_creator');
  });

  // ---------------------------------------------------------------
  // 5. Video fields NOT included (includeVideoFields: false)
  // ---------------------------------------------------------------
  it('should NOT include video fields in response', async () => {
    const postRow = {
      ...makePostRow(),
      video_status: 'ready',
      hls_url: 'https://cdn.example.com/video.m3u8',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg',
      video_variants: ['720p'],
      video_duration: 30,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    const post = JSON.parse(result.body).data[0];
    expect(post.videoStatus).toBeUndefined();
    expect(post.hlsUrl).toBeUndefined();
    expect(post.thumbnailUrl).toBeUndefined();
    expect(post.videoVariants).toBeUndefined();
    expect(post.videoDuration).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // 6. Null optional fields get defaults
  // ---------------------------------------------------------------
  it('should handle null optional fields with defaults', async () => {
    const postRow = makePostRow({
      media_urls: null,
      media_meta: null,
      tags: null,
      likes_count: null,
      comments_count: null,
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

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
  // 7. Pagination: hasMore and nextCursor
  // ---------------------------------------------------------------
  it('should detect hasMore and return nextCursor', async () => {
    const rows = Array.from({ length: 21 }, (_, i) =>
      makePostRow({
        id: `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}`,
        created_at: `2026-02-${String(15 - i).padStart(2, '0')}T10:00:00Z`,
      })
    );
    mockQuery
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    expect(body.data).toHaveLength(20);
  });

  // ---------------------------------------------------------------
  // 8. Limit capped at 50
  // ---------------------------------------------------------------
  it('should cap limit at 50', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      queryStringParameters: { limit: '200' },
    });
    await handler(event);

    // Verify the last param in the feed query is 51 (50+1)
    const feedParams: unknown[] = mockQuery.mock.calls[0][1];
    expect(feedParams).toContain(51);
  });

  // ---------------------------------------------------------------
  // 9. Invalid cursor: compound cursor with bad date
  // ---------------------------------------------------------------
  it('should return 400 for invalid compound cursor (bad date)', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'invalid-date|' + TEST_POST_ID_1 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  // ---------------------------------------------------------------
  // 10. Invalid cursor: compound cursor with bad UUID
  // ---------------------------------------------------------------
  it('should return 400 for invalid compound cursor (bad UUID)', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    const validDate = new Date().toISOString();
    const event = makeEvent({
      queryStringParameters: { cursor: `${validDate}|not-uuid` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  // ---------------------------------------------------------------
  // 11. SQL query structure
  // ---------------------------------------------------------------
  it('should build SQL query filtering public posts and excluding blocked users', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    await handler(event);

    const feedSql: string = mockQuery.mock.calls[0][0];
    expect(feedSql).toContain("visibility = 'public'");
    expect(feedSql).toContain('blocked_users');
    expect(feedSql).toContain("COALESCE(pr.moderation_status, 'active') NOT IN ('banned', 'shadow_banned')");
    expect(feedSql).toContain('ORDER BY p.created_at DESC');
  });

  // ---------------------------------------------------------------
  // 12. DB error returns 500
  // ---------------------------------------------------------------
  it('should return 500 when database query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Query timeout'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 13. getPool failure returns 500
  // ---------------------------------------------------------------
  it('should return 500 when getPool throws', async () => {
    mockedGetPool.mockRejectedValueOnce(new Error('Pool creation failed'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 14. Empty feed: no batch queries
  // ---------------------------------------------------------------
  it('should not batch-fetch liked/saved when feed is empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    await handler(event);

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
