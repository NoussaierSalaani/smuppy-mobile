/**
 * Tests for posts/like Lambda handler
 * Validates auth, validation, like toggle (like/unlike), idempotency, block checks, and error handling.
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

import { handler } from '../../posts/like';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { sendPushToUser } from '../../services/push-notification';

// ── Constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  postId?: string | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_USER_ID : overrides.sub;
  const postId = overrides.postId === undefined ? VALID_POST_ID : overrides.postId;
  return {
    httpMethod: 'POST',
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

describe('posts/like handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
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
    it('should return 429 when per-minute rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce({
          statusCode: 429,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
        });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });

    it('should return 429 when daily like limit is exceeded', async () => {
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce(null)   // per-minute passes
        .mockResolvedValueOnce({
          statusCode: 429,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
        });  // daily limit hit

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 4. Profile / Post not found ──

  describe('resource existence', () => {
    it('should return 404 when user profile is not found', async () => {
      // withAuthHandler resolves profileId -> null means profile not found
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });

    it('should return 404 when post is not found', async () => {
      // withAuthHandler resolves profileId successfully
      // First handler db.query: post lookup returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 5. Block check ──

  describe('block check', () => {
    it('should return 403 when a bidirectional block exists', async () => {
      // Post lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_AUTHOR_ID, likes_count: 5 }],
      });
      // Block check returns a row (block exists)
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Action not allowed');
    });
  });

  // ── 6. Happy path: successful like ──

  describe('successful like', () => {
    it('should insert a like and return liked=true with updated count', async () => {
      // Post lookup (different author so notification fires)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_AUTHOR_ID, likes_count: 5 }],
      });
      // Block check: no block
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liker name lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Liker User' }],
      });

      // Transaction client queries:
      // 1. BEGIN
      // 2. SELECT existing like -> not found (new like)
      // 3. INSERT INTO likes
      // 4. SELECT updated likes_count
      // 5. INSERT INTO notifications (ON CONFLICT DO NOTHING)
      // 6. COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // existing like check -> none
        .mockResolvedValueOnce({ rows: [] })                          // INSERT INTO likes
        .mockResolvedValueOnce({ rows: [{ likes_count: 6 }] })       // updated count
        .mockResolvedValueOnce({ rows: [] })                          // notification insert
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(true);
      expect(body.likesCount).toBe(6);

      // Verify client was released
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should NOT send notification or insert notification when liker is the post author', async () => {
      // Post lookup: author_id === profileId (VALID_PROFILE_ID)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_PROFILE_ID, likes_count: 3 }],
      });
      // Block check: no block
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liker name lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Self User' }],
      });

      // Transaction client queries:
      // 1. BEGIN
      // 2. existing like check -> none
      // 3. INSERT INTO likes
      // 4. SELECT updated likes_count
      // (NO notification insert because author === liker)
      // 5. COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // existing like check
        .mockResolvedValueOnce({ rows: [] })                          // INSERT INTO likes
        .mockResolvedValueOnce({ rows: [{ likes_count: 4 }] })       // updated count
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.liked).toBe(true);
      expect(body.likesCount).toBe(4);

      // No notification queries should have been made for self-like
      const notificationCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notificationCalls).toHaveLength(0);

      // No push notification
      expect(sendPushToUser).not.toHaveBeenCalled();
    });
  });

  // ── 7. Unlike (toggle off) ──

  describe('unlike (toggle)', () => {
    it('should remove the like and return liked=false when already liked', async () => {
      // Post lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_AUTHOR_ID, likes_count: 5 }],
      });
      // Block check: no block
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liker name lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Test User' }],
      });

      // Transaction client queries:
      // 1. BEGIN
      // 2. existing like check -> found (already liked)
      // 3. DELETE FROM likes
      // 4. SELECT updated likes_count
      // 5. COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'like-id' }] })        // existing like found
        .mockResolvedValueOnce({ rows: [] })                          // DELETE
        .mockResolvedValueOnce({ rows: [{ likes_count: 4 }] })       // updated count
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(false);
      expect(body.likesCount).toBe(4);

      // No push notification on unlike
      expect(sendPushToUser).not.toHaveBeenCalled();

      // Client released
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── 8. Idempotency: duplicate like handled via ON CONFLICT DO NOTHING ──

  describe('idempotency', () => {
    it('should handle notification insert idempotently via ON CONFLICT DO NOTHING', async () => {
      // Post lookup (different author)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_AUTHOR_ID, likes_count: 10 }],
      });
      // Block check: no block
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liker name lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Test User' }],
      });

      // Transaction: new like path with notification ON CONFLICT DO NOTHING
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockResolvedValueOnce({ rows: [] })                          // existing like check -> none
        .mockResolvedValueOnce({ rows: [] })                          // INSERT INTO likes
        .mockResolvedValueOnce({ rows: [{ likes_count: 11 }] })      // updated count
        .mockResolvedValueOnce({ rows: [] })                          // notification ON CONFLICT DO NOTHING
        .mockResolvedValueOnce({ rows: [] });                         // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).liked).toBe(true);

      // Verify the notification insert uses ON CONFLICT DO NOTHING
      const notificationCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notificationCall).toBeDefined();
      expect(notificationCall![0]).toContain('ON CONFLICT');
      expect(notificationCall![0]).toContain('DO NOTHING');
    });
  });

  // ── 9. Database error ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs during post lookup', async () => {
      // Post lookup throws
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when transaction fails', async () => {
      // Post lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_POST_ID, author_id: VALID_AUTHOR_ID, likes_count: 5 }],
      });
      // Block check: no block
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Liker name lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ full_name: 'Test User' }],
      });

      // Transaction: BEGIN succeeds, then SELECT fails
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockRejectedValueOnce(new Error('deadlock detected'));       // existing like check fails

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
  });
});
