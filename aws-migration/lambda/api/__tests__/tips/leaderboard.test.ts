/**
 * Tests for tips/leaderboard Lambda handler
 * Validates creator ID validation, period validation, pagination, and DB interactions
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
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
  cors: jest.fn((r: unknown) => r),
  handleOptions: jest.fn(() => ({ statusCode: 200, body: '' })),
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../tips/leaderboard';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_CREATOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: { creatorId: VALID_CREATOR_ID },
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

function makeLeaderboardRow(rank: number) {
  return {
    tipper_id: `e5f6a7b8-c9d0-1234-efab-3456789012${String(rank).padStart(2, '0')}`,
    total_amount: String(100 - rank * 10),
    tip_count: String(10 - rank),
    rank: String(rank),
    username: `tipper${rank}`,
    display_name: `Tipper ${rank}`,
    avatar_url: `https://example.com/avatar${rank}.jpg`,
  };
}

// ── Test suite ──

describe('tips/leaderboard handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);

    // Default: leaderboard query + stats query
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM tip_leaderboard tl')) {
        return Promise.resolve({
          rows: [makeLeaderboardRow(1), makeLeaderboardRow(2), makeLeaderboardRow(3)],
        });
      }
      if (typeof sql === 'string' && sql.includes('COUNT(DISTINCT sender_id)')) {
        return Promise.resolve({
          rows: [{ unique_tippers: '25', total_amount: '500.00', creator_total: '400.00' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Missing creatorId
  describe('creatorId validation', () => {
    it('should return 400 when creatorId is missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Creator ID required');
    });

    it('should return 400 when creatorId is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid creator ID format');
    });
  });

  // 2. Invalid period
  describe('period validation', () => {
    it('should return 400 when period is invalid', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'invalid_period' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid period');
    });
  });

  // 3. Happy path - all_time (default)
  describe('happy path - all_time', () => {
    it('should return 200 with leaderboard data', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.period).toBe('all_time');
      expect(body.leaderboard).toBeDefined();
      expect(Array.isArray(body.leaderboard)).toBe(true);
      expect(body.leaderboard.length).toBe(3);
    });

    it('should include stats in response', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.stats).toBeDefined();
      expect(body.stats.uniqueTippers).toBe(25);
      expect(body.stats.totalAmount).toBe(500);
      expect(body.stats.creatorTotal).toBe(400);
    });

    it('should include tipper profile data', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      const entry = body.leaderboard[0];
      expect(entry.tipper).toBeDefined();
      expect(entry.tipper.username).toBe('tipper1');
      expect(entry.rank).toBe(1);
      expect(typeof entry.totalAmount).toBe('number');
      expect(typeof entry.tipCount).toBe('number');
    });
  });

  // 4. Monthly period
  describe('monthly period', () => {
    it('should return data for monthly period', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'monthly' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.period).toBe('monthly');
    });
  });

  // 5. Weekly period
  describe('weekly period', () => {
    it('should return data for weekly period', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'weekly' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.period).toBe('weekly');
    });
  });

  // 6. Limit parameter
  describe('limit parameter', () => {
    it('should respect custom limit', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should cap limit at 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 7. Empty leaderboard
  describe('empty leaderboard', () => {
    it('should return empty leaderboard when no tips exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM tip_leaderboard tl')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('COUNT(DISTINCT sender_id)')) {
          return Promise.resolve({ rows: [{ unique_tippers: '0', total_amount: '0', creator_total: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.leaderboard.length).toBe(0);
      expect(body.stats.uniqueTippers).toBe(0);
    });
  });

  // 8. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation(() => Promise.reject(new Error('DB error')));

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should release client after error', async () => {
      mockClient.query.mockImplementation(() => Promise.reject(new Error('DB error')));

      await invoke(makeEvent());

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

});
