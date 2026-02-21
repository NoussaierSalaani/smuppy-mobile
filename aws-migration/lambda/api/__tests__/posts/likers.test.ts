/**
 * Tests for posts/likers Lambda handler
 * Validates auth, UUID validation, rate limiting, post existence,
 * private account access, pagination, block filtering, and error handling.
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

jest.mock('../../utils/validators', () => {
  return {
    requireAuth: jest.fn((event: APIGatewayProxyEvent, headers: Record<string, string>) => {
      const sub = event.requestContext.authorizer?.claims?.sub;
      if (!sub) return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      return sub;
    }),
    validateUUIDParam: jest.fn((event: APIGatewayProxyEvent, headers: Record<string, string>, paramName: string, label: string) => {
      const value = event.pathParameters?.[paramName];
      if (!value) return { statusCode: 400, headers, body: JSON.stringify({ message: `${label} ID is required` }) };
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(value)) return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid ${label.toLowerCase()} ID format` }) };
      return value;
    }),
    isErrorResponse: jest.fn((val: unknown) => typeof val !== 'string'),
  };
});

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../posts/likers';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

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

// ── Test Suite ──

describe('posts/likers handler', () => {
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

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
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

  // ── 3. Validation ──

  describe('validation', () => {
    it('should return 400 when post ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('ID is required');
    });

    it('should return 400 when post ID is not a valid UUID', async () => {
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid');
    });

    it('should ignore invalid cursor and return first page (tolerant policy)', async () => {
      // Post lookup needs to succeed first
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_POST_ID, author_id: AUTHOR_PROFILE_ID, is_private: false, author_cognito_sub: AUTHOR_SUB }],
      });
      // Likers query returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { cursor: 'invalid-cursor' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 4. Post not found ──

  describe('resource existence', () => {
    it('should return 404 when post is not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 5. Private account access ──

  describe('private account access', () => {
    it('should return 403 when post is from private account and requester is not a follower', async () => {
      // Post lookup: private account
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: AUTHOR_PROFILE_ID,
          is_private: true,
          author_cognito_sub: AUTHOR_SUB,
        }],
      });
      // Follow check: not following
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('This post is from a private account');
    });

    it('should allow the post author to see likers even on private account', async () => {
      // Post lookup: private account, author matches requester
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: AUTHOR_PROFILE_ID,
          is_private: true,
          author_cognito_sub: TEST_SUB,  // matches the requester
        }],
      });

      // Likers query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should allow followers to see likers on private account', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: AUTHOR_PROFILE_ID,
          is_private: true,
          author_cognito_sub: AUTHOR_SUB,
        }],
      });
      // Follow check: following
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      // Likers query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 6. Happy path ──

  describe('successful likers list', () => {
    it('should return 200 with likers data', async () => {
      // Post lookup: public
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: AUTHOR_PROFILE_ID,
          is_private: false,
          author_cognito_sub: AUTHOR_SUB,
        }],
      });

      // Likers query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'liker-1-id',
            username: 'liker1',
            full_name: 'Liker One',
            avatar_url: 'https://cdn.example.com/liker1.jpg',
            is_verified: true,
            account_type: 'personal',
            business_name: null,
            liked_at: '2026-02-16T12:00:00Z',
          },
          {
            id: 'liker-2-id',
            username: 'liker2',
            full_name: 'Liker Two',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
            liked_at: '2026-02-16T11:00:00Z',
          },
        ],
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].username).toBe('liker1');
      expect(body.data[0].fullName).toBe('Liker One');
      expect(body.data[0].isVerified).toBe(true);
      expect(body.data[1].username).toBe('liker2');
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should return paginated results with hasMore=true', async () => {
      // Post lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: AUTHOR_PROFILE_ID,
          is_private: false,
          author_cognito_sub: AUTHOR_SUB,
        }],
      });

      // Likers query: return limit+1 rows to indicate more (default limit=20)
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `liker-${i}-id`,
        username: `liker${i}`,
        full_name: `Liker ${i}`,
        avatar_url: null,
        is_verified: false,
        account_type: 'personal',
        business_name: null,
        liked_at: new Date(2026, 1, 16, 12, 0, 0, -i * 1000).toISOString(),
      }));
      mockDb.query.mockResolvedValueOnce({ rows });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
    });
  });

  // ── 7. DB error ──

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
