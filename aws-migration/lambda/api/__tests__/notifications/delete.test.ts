/**
 * Tests for notifications/delete Lambda handler
 * Covers: auth, rate limiting, input validation, happy path, not found, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

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

import { handler } from '../../notifications/delete';

// ── Test constants ───────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_NOTIFICATION_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
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

// ── Test suite ───────────────────────────────────────────────────────────

describe('notifications/delete handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = { query: jest.fn() };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should reject when authorizer is missing entirely', async () => {
      const event = {
        httpMethod: 'DELETE',
        headers: {},
        body: null,
        queryStringParameters: null,
        pathParameters: { id: TEST_NOTIFICATION_ID },
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Rate limiting ────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 3. Profile not found ────────────────────────────────────────────

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 4. Input validation ─────────────────────────────────────────────

  describe('input validation', () => {
    it('should return 400 when notification ID is missing', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Notification ID is required');
    });

    it('should return 400 when notification ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid notification ID format');
    });
  });

  // ── 5. Happy path ──────────────────────────────────────────────────

  describe('happy path', () => {
    it('should delete notification and return 200', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_NOTIFICATION_ID }],
      });

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Notification deleted');
    });

    it('should return 404 when notification does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Notification not found');
    });

    it('should pass notification ID and profile ID to the DELETE query', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_NOTIFICATION_ID }],
      });

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM notifications'),
        [TEST_NOTIFICATION_ID, TEST_PROFILE_ID],
      );
    });
  });

  // ── 6. Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when database query throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeEvent({ pathParameters: { id: TEST_NOTIFICATION_ID } });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
