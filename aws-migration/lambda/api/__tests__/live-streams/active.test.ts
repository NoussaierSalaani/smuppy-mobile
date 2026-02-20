/**
 * Tests for live-streams/active Lambda handler
 * Validates auth, profile resolution, block filtering, and stream listing
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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../live-streams/active';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
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

describe('live-streams/active handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  describe('OPTIONS', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });
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

    it('should return 401 when sub is missing', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('happy path', () => {
    it('should return 200 with active streams', async () => {
      // First query: resolve profile
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID }] })
        // Second query: active streams
        .mockResolvedValueOnce({
          rows: [{
            id: 'stream-1',
            channel_name: 'live_host1',
            title: 'My Stream',
            started_at: '2026-02-20T12:00:00Z',
            host_id: 'host-id',
            host_username: 'streamer1',
            host_display_name: 'Streamer One',
            host_avatar_url: 'https://example.com/avatar.jpg',
            viewer_count: '15',
          }],
        });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].channelName).toBe('live_host1');
      expect(body.data[0].viewerCount).toBe(15);
      expect(body.data[0].host.username).toBe('streamer1');
    });

    it('should return empty array when no active streams', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(0);
    });

    it('should use block-filtered query when profile exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: VALID_PROFILE_ID }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      // Second query should include block filter with profile ID parameter
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const secondCall = mockDb.query.mock.calls[1];
      expect(secondCall[0]).toContain('blocked_users');
      expect(secondCall[1]).toEqual([VALID_PROFILE_ID]);
    });

    it('should use unfiltered query when profile not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // no profile found
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      // Second query should NOT have blocked_users check (no params)
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const secondCall = mockDb.query.mock.calls[1];
      expect(secondCall[1]).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
