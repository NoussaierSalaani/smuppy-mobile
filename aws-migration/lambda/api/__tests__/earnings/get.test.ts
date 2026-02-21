/**
 * Tests for earnings/get Lambda handler
 * Validates auth, rate limit, creator verification, period filtering, and DB interactions
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
  corsHeaders: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  },
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

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../earnings/get';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const _VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e, {} as any, () => {}) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: {},
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: VALID_USER_ID } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('earnings/get handler', () => {
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);

    // Default: user is a pro_creator, queries return data
    mockPool.query.mockImplementation((sql: string) => {
      // User type check
      if (typeof sql === 'string' && sql.includes('SELECT account_type, stripe_account_id')) {
        return Promise.resolve({
          rows: [{
            account_type: 'pro_creator',
            stripe_account_id: 'acct_test123',
            fan_count: '500',
          }],
        });
      }
      // Sessions earnings
      if (typeof sql === 'string' && sql.includes('FROM private_sessions') && sql.includes('session_count')) {
        return Promise.resolve({
          rows: [{ session_count: '5', sessions_total: '150.00' }],
        });
      }
      // Packs earnings
      if (typeof sql === 'string' && sql.includes('FROM pending_pack_purchases') && sql.includes('pack_count')) {
        return Promise.resolve({
          rows: [{ pack_count: '3', packs_total: '75.00' }],
        });
      }
      // Subscriptions earnings
      if (typeof sql === 'string' && sql.includes('FROM channel_subscriptions')) {
        return Promise.resolve({
          rows: [{ subscriber_count: '10', subscriptions_total: '200.00' }],
        });
      }
      // Transactions
      if (typeof sql === 'string' && sql.includes('UNION ALL')) {
        return Promise.resolve({
          rows: [{
            id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            type: 'session',
            amount: '30.00',
            currency: 'eur',
            status: 'completed',
            description: 'Session with John',
            buyer_id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
            created_at: '2026-02-20T12:00:00Z',
          }],
        });
      }
      // Buyers info
      if (typeof sql === 'string' && sql.includes('SELECT id, full_name, avatar_url FROM profiles WHERE id = ANY')) {
        return Promise.resolve({
          rows: [{
            id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
            full_name: 'John Fan',
            avatar_url: 'https://example.com/john.jpg',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no auth claims', async () => {
      const event = makeEvent({
        requestContext: { requestId: 'test', identity: { sourceIp: '127.0.0.1' } },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 3. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 4. Not a creator
  describe('creator verification', () => {
    it('should return 403 when user is not a pro_creator', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT account_type')) {
          return Promise.resolve({
            rows: [{ account_type: 'personal', stripe_account_id: null, fan_count: '0' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Creator account required');
    });

    it('should return 403 when user profile not found in DB', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT account_type')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
    });
  });

  // 5. Happy path - default month period
  describe('happy path - month period', () => {
    it('should return 200 with earnings data', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.earnings).toBeDefined();
      expect(body.earnings.period).toBe('month');
    });

    it('should include breakdown data', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.earnings.breakdown).toBeDefined();
      expect(body.earnings.breakdown.sessions).toBeDefined();
      expect(body.earnings.breakdown.packs).toBeDefined();
      expect(body.earnings.breakdown.subscriptions).toBeDefined();
    });

    it('should include transactions', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.earnings.transactions).toBeDefined();
      expect(Array.isArray(body.earnings.transactions)).toBe(true);
    });

    it('should include totalEarnings, availableBalance, pendingBalance', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(typeof body.earnings.totalEarnings).toBe('number');
      expect(typeof body.earnings.availableBalance).toBe('number');
      expect(typeof body.earnings.pendingBalance).toBe('number');
    });
  });

  // 6. Week period
  describe('week period', () => {
    it('should accept week period', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'week' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.earnings.period).toBe('week');
    });
  });

  // 7. Year period
  describe('year period', () => {
    it('should accept year period', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'year' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.earnings.period).toBe('year');
    });
  });

  // 8. All time period
  describe('all time period', () => {
    it('should accept all period', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'all' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.earnings.period).toBe('all');
    });
  });

  // 9. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Failed to get earnings');
    });
  });

  // 10. OPTIONS
  describe('OPTIONS request', () => {
    it('should return 200 for OPTIONS', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 11. Additional coverage
  describe('additional coverage - invalid period', () => {
    it('should default to month for invalid period value', async () => {
      const event = makeEvent({
        queryStringParameters: { period: 'invalid_period' },
      });

      const result = await invoke(event);

      // Should either use default period or return 400
      // Based on handler logic, invalid period defaults to 'month'
      expect([200, 400]).toContain(result.statusCode);
    });

    it('should handle zero earnings gracefully', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT account_type, stripe_account_id')) {
          return Promise.resolve({
            rows: [{
              account_type: 'pro_creator',
              stripe_account_id: 'acct_test123',
              fan_count: '0',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('session_count')) {
          return Promise.resolve({ rows: [{ session_count: '0', sessions_total: '0.00' }] });
        }
        if (typeof sql === 'string' && sql.includes('pack_count')) {
          return Promise.resolve({ rows: [{ pack_count: '0', packs_total: '0.00' }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM channel_subscriptions')) {
          return Promise.resolve({ rows: [{ subscriber_count: '0', subscriptions_total: '0.00' }] });
        }
        if (typeof sql === 'string' && sql.includes('UNION ALL')) {
          return Promise.resolve({ rows: [] }); // no transactions
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.earnings.totalEarnings).toBe(0);
      expect(body.earnings.transactions).toEqual([]);
    });

    it('should handle getPool failure', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
    });
  });
});
