/**
 * Tests for posts/unlike Lambda handler
 * Validates auth, validation, like exists/doesn't exist, transaction, rollback on error.
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

jest.mock('../../utils/error-handler', () => {
  const actual = jest.requireActual('../../utils/error-handler');
  return {
    ...actual,
    withErrorHandler: (name: string, fn: Function) => {
      const { createHeaders } = require('../../utils/cors');
      const { createLogger } = require('../../utils/logger');
      const handlerLog = createLogger(name);
      return async (event: any) => {
        const headers = createHeaders(event);
        handlerLog.initFromEvent(event);
        try {
          return await fn(event, { headers, log: handlerLog });
        } catch (error: unknown) {
          handlerLog.error(`Error in ${name}`, error);
          return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
        }
      };
    },
  };
});

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../posts/unlike';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  postId?: string | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_USER_ID : overrides.sub;
  const postId = overrides.postId === undefined ? VALID_POST_ID : overrides.postId;
  return {
    httpMethod: 'DELETE',
    headers: {},
    body: null,
    pathParameters: postId !== null ? { id: postId } : null,
    queryStringParameters: null,
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

describe('posts/unlike handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = buildEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Validation ──

  describe('validation', () => {
    it('should return 400 when post ID path parameter is missing', async () => {
      const event = buildEvent({ postId: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Post ID is required');
    });

    it('should return 400 when post ID is not a valid UUID', async () => {
      const event = buildEvent({ postId: 'not-a-uuid' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid post ID format');
    });
  });

  // ── 3. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 4. Profile not found ──

  describe('resource existence', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 5. Like does not exist (idempotent unlike) ──

  describe('like does not exist', () => {
    it('should return 200 with liked=false and current count when like does not exist', async () => {
      // Like check returns empty (no existing like)
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Post lookup for current likes_count
      mockDb.query.mockResolvedValueOnce({ rows: [{ likes_count: 10 }] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(false);
      expect(body.message).toBe('Post was not liked');
      expect(body.likesCount).toBe(10);
    });

    it('should return 200 with likesCount=0 when post has no likes_count row', async () => {
      // Like check returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Post lookup returns empty (edge case: post might have been deleted concurrently)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.liked).toBe(false);
      expect(body.likesCount).toBe(0);
    });
  });

  // ── 6. Happy path: successful unlike ──

  describe('successful unlike', () => {
    it('should delete the like and return liked=false with updated count', async () => {
      // Like check: like exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });

      // Transaction client queries:
      // 1. BEGIN
      // 2. DELETE FROM likes
      // 3. SELECT updated likes_count
      // 4. COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // DELETE FROM likes
        .mockResolvedValueOnce({ rows: [{ likes_count: 4 }] })       // updated count
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(false);
      expect(body.message).toBe('Post unliked successfully');
      expect(body.likesCount).toBe(4);

      // Verify client was released
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return likesCount=0 when post count is missing after unlike', async () => {
      // Like exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });

      // Transaction:
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // DELETE
        .mockResolvedValueOnce({ rows: [{}] })                        // post row with no likes_count
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.likesCount).toBe(0);
    });

    it('should use a transaction (BEGIN/COMMIT) for the delete', async () => {
      // Like exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // DELETE
        .mockResolvedValueOnce({ rows: [{ likes_count: 3 }] })       // count
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should release the client after a successful transaction', async () => {
      // Like exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ likes_count: 2 }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 7. Error handling ──

  describe('error handling', () => {
    it('should return 500 when database error occurs during like check', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when transaction fails', async () => {
      // Like exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });

      // Transaction: BEGIN succeeds, then DELETE fails
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockRejectedValueOnce(new Error('deadlock detected'));       // DELETE fails

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();

      // Verify client was released even after error
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 500 when db.connect fails', async () => {
      // Like exists so handler tries to open a transaction
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'like-id-123' }] });
      mockDb.connect.mockRejectedValueOnce(new Error('Pool exhausted'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  // ── 8. Parameterized queries ──

  describe('query safety', () => {
    it('should use parameterized queries for the like existence check', async () => {
      // Like does not exist
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Post count fallback
      mockDb.query.mockResolvedValueOnce({ rows: [{ likes_count: 5 }] });

      const event = buildEvent({});

      await handler(event);

      // First db.query call should be the like existence check with $1, $2 params
      const likeCheckCall = mockDb.query.mock.calls[0];
      expect(likeCheckCall[0]).toContain('$1');
      expect(likeCheckCall[0]).toContain('$2');
      expect(likeCheckCall[1]).toEqual([VALID_PROFILE_ID, VALID_POST_ID]);
    });
  });
});
