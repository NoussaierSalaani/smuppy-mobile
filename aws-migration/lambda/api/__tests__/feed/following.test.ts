/**
 * Tests for feed/following Lambda handler
 * Validates following feed retrieval via createFeedHandler factory.
 * Pipeline: auth -> rate limit -> pagination -> DB -> resolve profile ->
 * compound cursor -> execute query -> batch-fetch is_liked/is_saved ->
 * camelCase transform (with video fields) -> paginated response.
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
import { handler } from '../../feed/following';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

// --- Test data constants ---
const TEST_COGNITO_SUB = 'cognito-sub-a1b2c3d4';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const _TEST_POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-def1-234567890123';

function makePostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_POST_ID_1,
    author_id: TEST_AUTHOR_ID,
    content: 'Following feed post',
    media_urls: ['https://media.example.com/photo.jpg'],
    media_type: 'image',
    media_meta: { width: 800, height: 600 },
    tags: ['lifestyle'],
    likes_count: 7,
    comments_count: 3,
    created_at: '2026-02-15T12:00:00Z',
    video_status: null,
    hls_url: null,
    thumbnail_url: null,
    video_variants: null,
    video_duration: null,
    profile_id: TEST_AUTHOR_ID,
    username: 'followeduser',
    full_name: 'Followed User',
    display_name: 'FollowedUser',
    avatar_url: 'https://media.example.com/avatar.jpg',
    is_verified: false,
    account_type: 'personal',
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
    path: '/feed/following',
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

describe('feed/following handler', () => {
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
  // 1. Auth: unauthenticated requests return 401
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
    expect(JSON.parse(result.body).message).toBe('Too many requests');
  });

  // ---------------------------------------------------------------
  // 3. No profile returns empty 200
  // ---------------------------------------------------------------
  it('should return 200 with empty data when user has no profile', async () => {
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
  // 4. Happy path: returns following feed posts with correct shape
  // ---------------------------------------------------------------
  it('should return posts with correct camelCase shape (200)', async () => {
    const postRow = makePostRow();
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow] })   // feed query
      .mockResolvedValueOnce({ rows: [{ post_id: TEST_POST_ID_1 }] }) // liked batch
      .mockResolvedValueOnce({ rows: [] });          // saved batch

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);

    const post = body.data[0];
    expect(post.id).toBe(TEST_POST_ID_1);
    expect(post.authorId).toBe(TEST_AUTHOR_ID);
    expect(post.content).toBe('Following feed post');
    expect(post.mediaUrls).toEqual(['https://media.example.com/photo.jpg']);
    expect(post.likesCount).toBe(7);
    expect(post.commentsCount).toBe(3);
    expect(post.isLiked).toBe(true);
    expect(post.isSaved).toBe(false);
    expect(post.author.username).toBe('followeduser');
    expect(post.author.fullName).toBe('Followed User');
  });

  // ---------------------------------------------------------------
  // 5. Video fields included (includeVideoFields: true)
  // ---------------------------------------------------------------
  it('should include video fields in response', async () => {
    const postRow = makePostRow({
      video_status: 'ready',
      hls_url: 'https://cdn.example.com/video.m3u8',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg',
      video_variants: ['720p', '1080p'],
      video_duration: 45,
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const post = JSON.parse(result.body).data[0];
    expect(post.videoStatus).toBe('ready');
    expect(post.hlsUrl).toBe('https://cdn.example.com/video.m3u8');
    expect(post.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(post.videoVariants).toEqual(['720p', '1080p']);
    expect(post.videoDuration).toBe(45);
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
  it('should detect hasMore and return nextCursor when more results exist', async () => {
    // Default limit=20, so 21 rows means hasMore=true
    const rows = Array.from({ length: 21 }, (_, i) =>
      makePostRow({
        id: `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}`,
        created_at: `2026-02-${String(15 - i).padStart(2, '0')}T12:00:00Z`,
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

  it('should return hasMore=false when fewer results than limit', async () => {
    const rows = [makePostRow()];
    mockQuery
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { limit: '10' } });
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    expect(body.data).toHaveLength(1);
  });

  // ---------------------------------------------------------------
  // 8. Invalid cursor: compound cursor with bad date
  // ---------------------------------------------------------------
  it('should return 400 for invalid compound cursor (bad date)', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'not-a-date|' + TEST_POST_ID_1 },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  // ---------------------------------------------------------------
  // 9. Invalid cursor: compound cursor with bad UUID
  // ---------------------------------------------------------------
  it('should return 400 for invalid compound cursor (bad UUID)', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    const validDate = new Date().toISOString();
    const event = makeEvent({
      queryStringParameters: { cursor: `${validDate}|not-a-uuid` },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  // ---------------------------------------------------------------
  // 10. Invalid cursor: legacy cursor with bad date
  // ---------------------------------------------------------------
  it('should return 400 for invalid legacy cursor (bad date)', async () => {
    const event = makeEvent({
      queryStringParameters: { cursor: 'not-a-date' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
  });

  // ---------------------------------------------------------------
  // 11. Empty feed returns empty data
  // ---------------------------------------------------------------
  it('should return empty data when no posts match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  // ---------------------------------------------------------------
  // 12. SQL query references following table
  // ---------------------------------------------------------------
  it('should build SQL query that filters by following list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    await handler(event);

    const feedSql: string = mockQuery.mock.calls[0][0];
    expect(feedSql).toContain('follows');
    expect(feedSql).toContain('blocked_users');
    expect(feedSql).toContain('muted_users');
    expect(feedSql).toContain('channel_subscriptions');
    expect(feedSql).toContain('ORDER BY p.created_at DESC');
  });

  // ---------------------------------------------------------------
  // 13. DB error returns 500
  // ---------------------------------------------------------------
  it('should return 500 when database query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 14. getPool failure returns 500
  // ---------------------------------------------------------------
  it('should return 500 when getPool throws', async () => {
    mockedGetPool.mockRejectedValueOnce(new Error('Pool creation failed'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 15. No batch-fetch when feed is empty
  // ---------------------------------------------------------------
  it('should not batch-fetch liked/saved when feed is empty', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // Only 1 query (the feed query), no likes/saved batch
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
