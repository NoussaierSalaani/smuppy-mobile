/**
 * Tests for hashtags/trending Lambda handler
 * Validates rate limiting, query params, DB query, and error handling
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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=30',
  })),
  getSecureHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
}));

jest.mock('../../utils/constants', () => ({
  CACHE_TTL_TRENDING: 300,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../hashtags/trending';
import { requireRateLimit } from '../../utils/rate-limit';

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
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('hashtags/trending handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
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
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  describe('happy path', () => {
    it('should return 200 with trending hashtags', async () => {
      mockDb.query.mockResolvedValue({
        rows: [
          { tag: 'fitness', count: '42' },
          { tag: 'cooking', count: '31' },
        ],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0]).toEqual({ tag: 'fitness', count: 42 });
      expect(body.data[1]).toEqual({ tag: 'cooking', count: 31 });
    });

    it('should return empty array when no hashtags found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(0);
    });

    it('should include cache headers on success', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.headers!['Cache-Control']).toContain('max-age=300');
    });
  });

  describe('query parameters', () => {
    it('should use default limit of 20 when no limit param', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const queryParams = mockDb.query.mock.calls[0][1];
      expect(queryParams[0]).toBe(20);
    });

    it('should respect custom limit parameter', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '10' },
      });
      await handler(event);

      const queryParams = mockDb.query.mock.calls[0][1];
      expect(queryParams[0]).toBe(10);
    });

    it('should cap limit at 50', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });
      await handler(event);

      const queryParams = mockDb.query.mock.calls[0][1];
      expect(queryParams[0]).toBe(50);
    });

    it('should default to 20 for invalid limit', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: 'abc' },
      });
      await handler(event);

      const queryParams = mockDb.query.mock.calls[0][1];
      expect(queryParams[0]).toBe(20);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.error).toBe('Internal server error');
    });

    it('should return 500 when getPool fails', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Pool error'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});
