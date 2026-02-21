/**
 * Tests for peaks/search Lambda handler
 * Validates full-text search, hashtag search, pagination, rate limit
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { createMockDb, TEST_SUB, TEST_PROFILE_ID } from '../helpers';
import type { MockDb } from '../helpers';

// ── Mocks: the 4 standard blocks (db, rate-limit, logger, cors) are
//    auto-mocked by __tests__/helpers/setup.ts ──

// Domain-specific mocks
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MAX_SEARCH_QUERY_LENGTH: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../peaks/search';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// ── Helpers ────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? { q: 'test' },
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

function makePeakRow(id: string) {
  return {
    id,
    authorId: 'author-id-123',
    caption: 'Test peak caption',
    videoUrl: 'https://cdn.example.com/video.mp4',
    thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    duration: 15,
    likesCount: '5',
    commentsCount: '2',
    viewsCount: '100',
    createdAt: '2026-02-08T12:00:00Z',
    filterId: null,
    filterIntensity: null,
    overlays: null,
    username: 'testauthor',
    fullName: 'Test Author',
    avatarUrl: 'https://cdn.example.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/search handler', () => {
  let mockPool: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = createMockDb();
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('validation', () => {
    it('should return 400 when query is empty', async () => {
      const event = makeEvent({ queryStringParameters: { q: '' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Search query is required');
    });

    it('should return 400 when query is missing', async () => {
      const event = makeEvent({ queryStringParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('text search', () => {
    it('should return empty results when no matches', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // FTS query

      const event = makeEvent({ queryStringParameters: { q: 'nonexistent' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should return formatted peak results', async () => {
      const peaks = [makePeakRow('peak-1'), makePeakRow('peak-2')];
      mockPool.query
        .mockResolvedValueOnce({ rows: peaks }) // FTS query
        .mockResolvedValueOnce({ rows: [{ peak_id: 'peak-1' }] }); // isLiked batch query

      const event = makeEvent({ queryStringParameters: { q: 'test caption' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].author).toBeDefined();
      expect(body.data[0].isLiked).toBe(true); // peak-1 is liked
      expect(body.data[1].isLiked).toBe(false); // peak-2 is not liked
    });

    it('should fall back to ILIKE when FTS fails', async () => {
      // FTS query throws
      mockPool.query.mockRejectedValueOnce(new Error('FTS error'));
      // ILIKE fallback
      mockPool.query.mockResolvedValueOnce({ rows: [makePeakRow('peak-1')] });

      // Use multi-word query to avoid hashtag detection (single alphanumeric words match ^[a-z0-9_]+$)
      const event = makeEvent({ queryStringParameters: { q: 'test query' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('hashtag search', () => {
    it('should search by hashtag when query starts with #', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [makePeakRow('peak-ht')] }); // hashtag query

      const event = makeEvent({ queryStringParameters: { q: '#dance' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify the query used peak_hashtags table
      const queryStr = mockPool.query.mock.calls[0][0];
      expect(queryStr).toContain('peak_hashtags');
    });

    it('should search by hashtag for bare tag words', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // hashtag query

      const event = makeEvent({ queryStringParameters: { q: 'fitness' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // "fitness" matches /^[a-z0-9_]+$/i so it goes through hashtag search
      const queryStr = mockPool.query.mock.calls[0][0];
      expect(queryStr).toContain('peak_hashtags');
    });
  });

  describe('pagination', () => {
    it('should handle cursor pagination', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { q: 'test phrase here', cursor: '2026-02-08T12:00:00Z' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Query should include cursor condition
      const queryStr = mockPool.query.mock.calls[0][0];
      expect(queryStr).toContain('created_at <');
    });

    it('should detect hasMore and return nextCursor', async () => {
      // limit defaults to 20, so return 21 rows
      const peaks = Array.from({ length: 21 }, (_, i) =>
        makePeakRow(`peak-${i}`)
      );
      mockPool.query.mockResolvedValueOnce({ rows: peaks });

      const event = makeEvent({ queryStringParameters: { q: 'test phrase here' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.data).toHaveLength(20);
      expect(body.nextCursor).toBeDefined();
    });

    it('should cap limit to 50', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { q: 'test phrase here', limit: '100' },
      });
      await handler(event);

      const params = mockPool.query.mock.calls[0][1];
      // Should be 51 (50 + 1 for hasMore)
      expect(params.at(-1)!).toBe(51);
    });
  });

  describe('unauthenticated search', () => {
    it('should work without authentication', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      mockPool.query.mockResolvedValueOnce({ rows: [makePeakRow('peak-1')] });

      const event = makeEvent({ sub: null, queryStringParameters: { q: 'test phrase here' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Without profile, isLiked should all be false (no batch query)
      expect(body.data[0].isLiked).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return 500 on unexpected error', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Internal server error');
    });
  });
});
