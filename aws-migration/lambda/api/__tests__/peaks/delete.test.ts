/**
 * Tests for peaks/delete Lambda handler
 * Uses createDeleteHandler factory — validates auth, rate limit, UUID, ownership, delete, and media cleanup
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

jest.mock('../../utils/media-cleanup', () => ({
  cleanupMedia: jest.fn().mockResolvedValue(undefined),
}));

import { handler } from '../../peaks/delete';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { cleanupMedia } from '../../utils/media-cleanup';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
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

describe('peaks/delete handler', () => {
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

      const event = makeEvent({ pathParameters: { id: 'bad-id' } });
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

  describe('ownership check', () => {
    it('should return 404 when peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });

    it('should return 403 when user is not the peak author', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_PEAK_ID,
          author_id: 'some-other-user-id',
          video_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Not authorized');
    });
  });

  describe('successful deletion', () => {
    it('should return 200 on successful delete', async () => {
      // Ownership query returns peak owned by the test user
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_PEAK_ID,
          author_id: TEST_PROFILE_ID,
          video_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
    });

    it('should delete notifications and peak in transaction', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_PEAK_ID,
          author_id: TEST_PROFILE_ID,
          video_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        }],
      });

      const event = makeEvent();
      await handler(event);

      // Transaction: BEGIN, delete notifications, delete peak, COMMIT
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      const deleteNotifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM notifications')
      );
      expect(deleteNotifCall).toBeDefined();
      const deletePeakCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM peaks')
      );
      expect(deletePeakCall).toBeDefined();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should call cleanupMedia after deletion', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_PEAK_ID,
          author_id: TEST_PROFILE_ID,
          video_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        }],
      });

      const event = makeEvent();
      await handler(event);

      expect(cleanupMedia).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 and rollback on transaction error', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_PEAK_ID,
          author_id: TEST_PROFILE_ID,
          video_url: 'https://cdn.example.com/video.mp4',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        }],
      });
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql.includes('DELETE')) return Promise.reject(new Error('TX error'));
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
