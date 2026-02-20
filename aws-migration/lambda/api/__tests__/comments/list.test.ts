/**
 * Tests for comments/list Lambda handler
 * Standalone handler — lists comments for a post with pagination.
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn().mockReturnValue('cognito-sub-test123'),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../comments/list';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID, extractCognitoSub } from '../../utils/security';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const COMMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: POST_ID },
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

const NOW = new Date('2026-02-19T12:00:00Z');

// ── Test suite ──

describe('comments/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);

    // Default: post exists, requester profile exists, comments query returns data
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM posts')) {
        return Promise.resolve({ rows: [{ id: POST_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles')) {
        return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('FROM comments c')) {
        return Promise.resolve({
          rows: [{
            id: COMMENT_ID,
            text: 'Hello world',
            parent_comment_id: null,
            created_at: NOW,
            updated_at: NOW,
            author_id: TEST_PROFILE_ID,
            author_username: 'testuser',
            author_full_name: 'Test User',
            author_avatar_url: 'https://example.com/avatar.jpg',
            author_is_verified: false,
            author_account_type: 'personal',
            author_business_name: null,
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Input validation ──

  describe('input validation', () => {
    it('should return 400 when post ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Post ID is required');
    });

    it('should return 400 when post ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid post ID format');
    });
  });

  // ── 2. Not found ──

  describe('not found', () => {
    it('should return 404 when post does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM posts')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 3. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 4. Happy path ──

  describe('happy path', () => {
    it('should return 200 with formatted comments', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.comments).toBeDefined();
      expect(body.comments).toHaveLength(1);
      expect(body.comments[0].id).toBe(COMMENT_ID);
      expect(body.comments[0].text).toBe('Hello world');
      expect(body.comments[0].parentCommentId).toBeNull();
    });

    it('should include formatted author data in each comment', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      const comment = body.comments[0];
      expect(comment.author).toBeDefined();
      expect(comment.author.id).toBe(TEST_PROFILE_ID);
      expect(comment.author.username).toBe('testuser');
      expect(comment.author.fullName).toBe('Test User');
      expect(comment.author.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(comment.author.isVerified).toBe(false);
      expect(comment.author.accountType).toBe('personal');
      expect(comment.author.businessName).toBeNull();
    });

    it('should return hasMore=false when results fit in one page', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(false);
      expect(body.cursor).toBeNull();
    });

    it('should return hasMore=true and cursor when there are more results', async () => {
      // Return limit + 1 rows to trigger hasMore
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i <= 20; i++) {
        rows.push({
          id: `comment-${i}`,
          text: `Comment ${i}`,
          parent_comment_id: null,
          created_at: new Date(NOW.getTime() - i * 1000),
          updated_at: new Date(NOW.getTime() - i * 1000),
          author_id: TEST_PROFILE_ID,
          author_username: 'testuser',
          author_full_name: 'Test User',
          author_avatar_url: null,
          author_is_verified: false,
          author_account_type: 'personal',
          author_business_name: null,
        });
      }

      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM posts')) {
          return Promise.resolve({ rows: [{ id: POST_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM comments c')) {
          return Promise.resolve({ rows });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.cursor).toBeDefined();
      expect(body.comments).toHaveLength(20);
    });

    it('should support cursor-based pagination', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: String(NOW.getTime()), limit: '10' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should cap limit at 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });
      await handler(event);

      // Verify the LIMIT clause uses 51 (50 + 1 for hasMore check)
      const commentsQuery = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('FROM comments c'),
      );
      expect(commentsQuery).toBeDefined();
      // The last param should be 51 (limit + 1)
      const params = commentsQuery![1] as unknown[];
      expect(params[params.length - 1]).toBe(51);
    });
  });

  // ── 5. Unauthenticated access ──

  describe('unauthenticated access', () => {
    it('should still list comments for unauthenticated users', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(null);

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 6. Database errors ──

  describe('database errors', () => {
    it('should return 500 when db.query throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Pool exhausted'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
