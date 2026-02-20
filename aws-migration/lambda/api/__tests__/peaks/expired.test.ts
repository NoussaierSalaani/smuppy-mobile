/**
 * Tests for peaks/expired Lambda handler
 * Validates fetching expired peaks that need user decision
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

jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));

import { handler } from '../../peaks/expired';
import { requireAuth, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
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

function makeExpiredPeakRow(id: string) {
  return {
    id,
    video_url: 'https://cdn.example.com/video.mp4',
    thumbnail_url: 'https://cdn.example.com/thumb.jpg',
    caption: 'Expired peak',
    duration: 15,
    likes_count: 5,
    comments_count: 2,
    views_count: 100,
    created_at: '2026-02-05T12:00:00Z',
    expires_at: '2026-02-07T12:00:00Z',
    filter_id: null,
    filter_intensity: null,
    overlays: null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/expired handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
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

  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  describe('expired peaks listing', () => {
    it('should return empty array when no expired peaks', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should return formatted expired peaks', async () => {
      const expiredPeaks = [
        makeExpiredPeakRow('peak-1'),
        makeExpiredPeakRow('peak-2'),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: expiredPeaks });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);

      // Verify camelCase mapping
      expect(body.data[0].id).toBe('peak-1');
      expect(body.data[0].videoUrl).toBe('https://cdn.example.com/video.mp4');
      expect(body.data[0].thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
      expect(body.data[0].caption).toBe('Expired peak');
      expect(body.data[0].likesCount).toBe(5);
      expect(body.data[0].commentsCount).toBe(2);
      expect(body.data[0].viewsCount).toBe(100);
      expect(body.data[0].expiresAt).toBeDefined();
    });

    it('should query only peaks owned by the current user with no save decision', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      const queryStr = mockDb.query.mock.calls[0][0];
      expect(queryStr).toContain('author_id = $1');
      expect(queryStr).toContain('saved_to_profile IS NULL');
      expect(queryStr).toContain('expires_at');

      const params = mockDb.query.mock.calls[0][1];
      expect(params[0]).toBe(TEST_PROFILE_ID);
    });

    it('should handle peaks with null expires_at (fallback to created_at)', async () => {
      const peakNoExpiry = {
        ...makeExpiredPeakRow('peak-no-expiry'),
        expires_at: null,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [peakNoExpiry] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data[0].expiresAt).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB error'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
