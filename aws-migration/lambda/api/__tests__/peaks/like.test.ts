/**
 * Tests for peaks/like Lambda handler
 * Uses createPeakActionHandler factory — validates toggle like/unlike, notifications, push
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──────────────────────────────────────────────────────────

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
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

import { handler } from '../../peaks/like';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_AUTHOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_PEAK_ID },
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

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/like handler', () => {
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
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (validateUUIDParam as jest.Mock).mockReturnValue(TEST_PEAK_ID);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Peak lookup (factory does this on the pool)
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak lookup
      .mockResolvedValueOnce({ rows: [] }); // block check
  });

  describe('auth checks', () => {
    it('should return 401 when not authenticated', async () => {
      const authResponse = {
        statusCode: 401,
        headers: {},
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
      (requireAuth as jest.Mock).mockReturnValue(authResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation((v) => typeof v !== 'string');

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('UUID validation', () => {
    it('should return 400 when peak ID is invalid', async () => {
      const validationResponse = {
        statusCode: 400,
        headers: {},
        body: JSON.stringify({ message: 'Invalid peak ID format' }),
      };
      (validateUUIDParam as jest.Mock).mockReturnValue(validationResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation((v) => typeof v !== 'string');

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('profile not found');
    });
  });

  describe('peak lookup', () => {
    it('should return 404 when peak not found', async () => {
      mockDb.query.mockReset();
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // peak not found

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });
  });

  describe('block check', () => {
    it('should return 403 when user is blocked by peak author', async () => {
      mockDb.query.mockReset();
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }); // peak found
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // block check positive

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Action not allowed');
    });
  });

  describe('like toggle', () => {
    it('should like a peak when not already liked', async () => {
      // Inside transaction: profile lookup, existing like check (empty), insert, update count, notification
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ full_name: 'Test User' }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [] }) // existing like check - not liked
        .mockResolvedValueOnce({ rows: [] }) // INSERT INTO peak_likes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE likes_count
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(true);
    });

    it('should unlike a peak when already liked', async () => {
      // Inside transaction: profile lookup, existing like check (found), delete, update count
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ full_name: 'Test User' }] }) // profile lookup
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // existing like check - already liked
        .mockResolvedValueOnce({ rows: [] }) // DELETE FROM peak_likes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE likes_count
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.liked).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return 500 and rollback on error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        return Promise.reject(new Error('DB error'));
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
