/**
 * Tests for live-streams/end Lambda handler
 * Validates auth, rate limit, profile resolution, stream ending, and cleanup
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
  handleOptions: jest.fn(() => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../live-streams/end';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const STREAM_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: { sub: VALID_USER_ID },
      },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('live-streams/end handler', () => {
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
  });

  describe('authentication', () => {
    it('should return 401 when no authorizer claims present', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

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

  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  describe('no active stream', () => {
    it('should return 404 when no active live stream found', async () => {
      // Profile resolved via resolveProfileId mock (beforeEach)

      // Transaction: BEGIN, no active stream
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // no active stream
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('No active live stream found');
    });
  });

  describe('happy path', () => {
    it('should return 200 with stream stats on success', async () => {
      const startedAt = '2026-02-20T12:00:00Z';
      const endedAt = '2026-02-20T13:00:00Z';

      // Profile resolved via resolveProfileId mock (beforeEach)

      // Transaction queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: STREAM_ID, channel_name: 'live_test', started_at: startedAt }] }) // find stream
        .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // viewer count
        .mockResolvedValueOnce({
          rows: [{
            id: STREAM_ID,
            started_at: startedAt,
            ended_at: endedAt,
            max_viewers: 10,
            total_comments: 5,
            total_reactions: 20,
          }],
        }) // UPDATE RETURNING
        .mockResolvedValueOnce({ rows: [] }) // DELETE viewers
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(STREAM_ID);
      expect(body.data.maxViewers).toBe(10);
      expect(body.data.totalComments).toBe(5);
      expect(body.data.totalReactions).toBe(20);
      expect(body.data.durationSeconds).toBe(3600);
    });

    it('should release client after successful transaction', async () => {
      // Profile resolved via resolveProfileId mock (beforeEach)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: STREAM_ID, channel_name: 'live_test', started_at: '2026-02-20T12:00:00Z' }] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [{ id: STREAM_ID, started_at: '2026-02-20T12:00:00Z', ended_at: '2026-02-20T12:05:00Z', max_viewers: 0, total_comments: 0, total_reactions: 0 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database throws', async () => {
      (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client on transaction error', async () => {
      // Profile resolved via resolveProfileId mock (beforeEach)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('query error')); // stream query fails

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
