/**
 * Tests for comments/delete Lambda handler
 * Uses createDeleteHandler factory with custom checkOwnership (comment owner OR post owner).
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

jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../comments/delete';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const COMMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OTHER_PROFILE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: COMMENT_ID },
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

// ── Test suite ──

describe('comments/delete handler', () => {
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

    // Default: requireAuth returns userId
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);

    // Default: validateUUIDParam returns the comment ID
    (validateUUIDParam as jest.Mock).mockReturnValue(COMMENT_ID);

    // Default: resolveProfileId returns the profile ID
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

    // Default: comment exists and belongs to user
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('comments')) {
        return Promise.resolve({
          rows: [{ id: COMMENT_ID, user_id: TEST_PROFILE_ID, post_id: POST_ID }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: transaction queries succeed
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM comments WHERE')) {
        return Promise.resolve({
          rows: [{ id: COMMENT_ID }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const authResponse = {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
      (requireAuth as jest.Mock).mockReturnValue(authResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation(
        (val: unknown) => typeof val !== 'string',
      );

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when comment ID is missing', async () => {
      const validationResponse = {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Comment ID is required' }),
      };
      (validateUUIDParam as jest.Mock).mockReturnValue(validationResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation(
        (val: unknown) => typeof val !== 'string',
      );

      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment ID is required');
    });

    it('should return 400 when comment ID is not a valid UUID', async () => {
      const validationResponse = {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Invalid comment ID format' }),
      };
      (validateUUIDParam as jest.Mock).mockReturnValue(validationResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation(
        (val: unknown) => typeof val !== 'string',
      );

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid comment ID format');
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
    it('should return 404 when comment does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('comments')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Comment not found');
    });

    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 4. Authorization ──

  describe('authorization', () => {
    it('should return 403 when user is not comment owner and not post owner', async () => {
      // Comment belongs to someone else
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('comments')) {
          return Promise.resolve({
            rows: [{ id: COMMENT_ID, user_id: OTHER_PROFILE_ID, post_id: POST_ID }],
          });
        }
        // Post also belongs to someone else
        if (typeof sql === 'string' && sql.includes('SELECT author_id FROM posts')) {
          return Promise.resolve({
            rows: [{ author_id: 'e5f6a7b8-c901-2345-efab-567890123456' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Not authorized to delete this comment');
    });

    it('should allow deletion when user is the comment owner', async () => {
      // Comment belongs to user
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('comments')) {
          return Promise.resolve({
            rows: [{ id: COMMENT_ID, user_id: TEST_PROFILE_ID, post_id: POST_ID }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });

    it('should allow deletion when user is the post owner', async () => {
      // Comment belongs to someone else, but user owns the post
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('comments')) {
          return Promise.resolve({
            rows: [{ id: COMMENT_ID, user_id: OTHER_PROFILE_ID, post_id: POST_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT author_id FROM posts')) {
          return Promise.resolve({
            rows: [{ author_id: TEST_PROFILE_ID }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });
  });

  // ── 5. Rate limiting ──

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

  // ── 6. Happy path ──

  describe('happy path', () => {
    it('should return 200 with success message on deletion', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Comment deleted successfully');
    });

    it('should use a transaction for the delete', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should release the client after the transaction', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should delete both the comment and its replies', async () => {
      const event = makeEvent();
      await handler(event);

      const deleteCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('DELETE FROM comments') &&
          (call[0] as string).includes('parent_comment_id'),
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![1]).toContain(COMMENT_ID);
    });
  });

  // ── 7. Database errors ──

  describe('database errors', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when onDelete throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('DELETE FROM comments')) {
          return Promise.reject(new Error('FK constraint'));
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM comments WHERE')) {
          return Promise.resolve({ rows: [{ id: COMMENT_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
