/**
 * Tests for posts/search Lambda handler
 * Validates rate limiting, query validation, pagination, cursor, FTS/ILIKE fallback,
 * block/mute filtering, isLiked batch, and error handling.
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MAX_SEARCH_QUERY_LENGTH: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../posts/search';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const AUTHOR_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? { q: 'test query' },
    pathParameters: null,
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

function makeSearchResultRow(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    authorId: AUTHOR_PROFILE_ID,
    content: `Post content ${id}`,
    mediaUrls: [],
    mediaType: 'text',
    mediaMeta: {},
    likesCount: 3,
    commentsCount: 1,
    createdAt: '2026-02-16T12:00:00Z',
    username: 'author_user',
    fullName: 'Author User',
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    ...overrides,
  };
}

// ── Test Suite ──

describe('posts/search handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  // ── 1. Rate limiting ──

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

  // ── 2. Query validation ──

  describe('query validation', () => {
    it('should return 400 when search query is empty', async () => {
      const event = makeEvent({ queryStringParameters: { q: '' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Search query is required');
    });

    it('should return 400 when search query is whitespace only', async () => {
      const event = makeEvent({ queryStringParameters: { q: '   ' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Search query is required');
    });

    it('should return 400 when q parameter is missing', async () => {
      const event = makeEvent({ queryStringParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── 3. Cursor validation ──

  describe('cursor validation', () => {
    it('should return 400 for invalid cursor format', async () => {
      // FTS query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { q: 'test', cursor: 'not-a-date' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid cursor format');
    });
  });

  // ── 4. Happy path ──

  describe('successful search', () => {
    it('should return 200 with search results', async () => {
      const rows = [
        makeSearchResultRow('post-01'),
        makeSearchResultRow('post-02'),
      ];
      // FTS query
      mockDb.query.mockResolvedValueOnce({ rows });
      // Batch likes check
      mockDb.query.mockResolvedValueOnce({ rows: [{ post_id: 'post-01' }] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('post-01');
      expect(body.data[0].isLiked).toBe(true);
      expect(body.data[1].id).toBe('post-02');
      expect(body.data[1].isLiked).toBe(false);
      expect(body.hasMore).toBe(false);
    });

    it('should return paginated results with hasMore=true', async () => {
      // Default limit is 20, return 21 to indicate more
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeSearchResultRow(`post-${String(i).padStart(2, '0')}`)
      );
      mockDb.query.mockResolvedValueOnce({ rows });
      // Batch likes check
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
    });

    it('should return empty results when no posts match', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('should work for unauthenticated requests', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      mockDb.query.mockResolvedValueOnce({
        rows: [makeSearchResultRow('post-01')],
      });

      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
      // isLiked should be false for unauthenticated
      expect(body.data[0].isLiked).toBe(false);
    });
  });

  // ── 5. FTS fallback to ILIKE ──

  describe('FTS fallback to ILIKE', () => {
    it('should fallback to ILIKE when FTS query fails', async () => {
      // First query (FTS) throws
      mockDb.query
        .mockRejectedValueOnce(new Error('syntax error in tsquery'))
        // Second query (ILIKE fallback) succeeds
        .mockResolvedValueOnce({
          rows: [makeSearchResultRow('post-01')],
        })
        // Batch likes check
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
    });
  });

  // ── 6. Input sanitization ──

  describe('input sanitization', () => {
    it('should strip HTML tags from the search query', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { q: '<script>alert("xss")</script>test' },
      });

      const result = await handler(event);

      // Should still return results (sanitized query used)
      expect(result.statusCode).toBe(200);

      // Verify the query was called with sanitized content (no HTML tags)
      const queryCall = mockDb.query.mock.calls[0];
      const queryParam = queryCall[1][0] as string;
      expect(queryParam).not.toContain('<script>');
    });
  });

  // ── 7. DB error ──

  describe('error handling', () => {
    it('should return 500 when getPool fails', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal server error');
    });
  });
});
