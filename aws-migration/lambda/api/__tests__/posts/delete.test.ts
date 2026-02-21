/**
 * Tests for posts/delete Lambda handler
 * Uses createDeleteHandler factory — validates auth, rate limit, UUID validation,
 * profile resolution, ownership, transaction, S3 cleanup, and error handling.
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/validators', () => {
  const actualValidators = jest.requireActual('../../utils/validators');
  return {
    requireAuth: jest.fn((event: APIGatewayProxyEvent, headers: Record<string, string>) => {
      const sub = event.requestContext.authorizer?.claims?.sub;
      if (!sub) return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
      return sub;
    }),
    validateUUIDParam: jest.fn((event: APIGatewayProxyEvent, headers: Record<string, string>, paramName: string, label: string) => {
      const value = event.pathParameters?.[paramName];
      if (!value) return { statusCode: 400, headers, body: JSON.stringify({ message: `${label} ID is required` }) };
      const { isValidUUID } = require('../../utils/security');
      if (!isValidUUID(value)) return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid ${label.toLowerCase()} ID format` }) };
      return value;
    }),
    isErrorResponse: jest.fn((val: unknown) => typeof val !== 'string'),
  };
});

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  DeleteObjectsCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  CreateInvalidationCommand: jest.fn(),
}));

import { handler } from '../../posts/delete';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OTHER_PROFILE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
    headers: {},
    body: overrides.body as string ?? null,
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

describe('posts/delete handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
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
      expect(JSON.parse(result.body).message).toContain('Too many requests');
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
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid');
    });
  });

  // ── 4. Profile not found ──

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 5. Post not found ──

  describe('resource existence', () => {
    it('should return 404 when post is not found', async () => {
      // The factory does SELECT ... FROM posts WHERE id = $1
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ── 6. Ownership check ──

  describe('ownership', () => {
    it('should return 403 when user does not own the post', async () => {
      // ownership SELECT returns a post by a different author
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: OTHER_PROFILE_ID,
          media_urls: [],
          media_url: null,
          media_meta: null,
        }],
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Not authorized to delete');
    });
  });

  // ── 7. Happy path ──

  describe('successful deletion', () => {
    it('should return 200 with success message when post is deleted', async () => {
      // ownership SELECT returns a post owned by the user
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: TEST_PROFILE_ID,
          media_urls: ['https://cdn.example.com/uploads/image.jpg'],
          media_url: null,
          media_meta: null,
        }],
      });

      // Transaction: BEGIN, DELETE notifications, DELETE posts, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // DELETE FROM notifications
        .mockResolvedValueOnce({ rows: [] })  // DELETE FROM posts
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('deleted successfully');

      // Verify transaction was used
      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should clean up notifications referencing the post inside the transaction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: TEST_PROFILE_ID,
          media_urls: [],
          media_url: null,
          media_meta: null,
        }],
      });

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockResolvedValueOnce({ rows: [] })  // DELETE FROM notifications
        .mockResolvedValueOnce({ rows: [] })  // DELETE FROM posts
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent();

      await handler(event);

      // Verify notification cleanup query was executed
      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('DELETE FROM notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1]).toEqual([TEST_POST_ID]);
    });
  });

  // ── 8. DB error ──

  describe('error handling', () => {
    it('should return 500 when database error occurs', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when transaction fails', async () => {
      // ownership SELECT succeeds
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_POST_ID,
          author_id: TEST_PROFILE_ID,
          media_urls: [],
          media_url: null,
          media_meta: null,
        }],
      });

      // Transaction: BEGIN succeeds, then onDelete throws
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })  // BEGIN
        .mockRejectedValueOnce(new Error('deadlock detected'));  // DELETE FROM notifications fails

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
