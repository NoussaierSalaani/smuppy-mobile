/**
 * Tests for follows/delete Lambda handler
 * Standalone handler — unfollows a user, tracks cooldown for anti-spam.
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

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../follows/delete';
import { requireRateLimit } from '../../utils/rate-limit';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const FOLLOWER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FOLLOWING_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { userId: FOLLOWING_ID },
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

describe('follows/delete handler', () => {
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

    // Default: follower profile exists
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: FOLLOWER_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: follow exists, delete + cooldown succeed
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, status FROM follows')) {
        return Promise.resolve({
          rows: [{ id: 'follow-id', status: 'accepted' }],
        });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO follow_cooldowns')) {
        return Promise.resolve({
          rows: [{ unfollow_count: 1, cooldown_until: null }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer has no sub', async () => {
      const event = {
        ...makeEvent(),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when userId path parameter is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('userId is required');
    });

    it('should return 400 when userId is not a valid UUID', async () => {
      const event = makeEvent({ pathParameters: { userId: 'not-a-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });

    it('should return 400 for SQL injection attempt in userId', async () => {
      const event = makeEvent({
        pathParameters: { userId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890'; DROP TABLE follows;--" },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
    it('should return 404 when follower profile is not found', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Your profile not found');
    });
  });

  // ── 4. Idempotent unfollow ──

  describe('idempotent unfollow', () => {
    it('should return 200 when not following the user (idempotent)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM follows')) {
          return Promise.resolve({ rows: [] }); // no follow relationship
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Not following this user');
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
    it('should return 200 with success message on unfollow', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Successfully unfollowed user');
    });

    it('should use a transaction for the unfollow', async () => {
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

    it('should delete the follow record', async () => {
      const event = makeEvent();
      await handler(event);

      const deleteCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('DELETE FROM follows'),
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall![1]).toContain(FOLLOWER_ID);
      expect(deleteCall![1]).toContain(FOLLOWING_ID);
    });
  });

  // ── 7. Cooldown tracking ──

  describe('cooldown tracking', () => {
    it('should return cooldown info when threshold is reached', async () => {
      const cooldownUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM follows')) {
          return Promise.resolve({
            rows: [{ id: 'follow-id', status: 'accepted' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO follow_cooldowns')) {
          return Promise.resolve({
            rows: [{ unfollow_count: 2, cooldown_until: cooldownUntil }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.cooldown).toBeDefined();
      expect(body.cooldown.blocked).toBe(true);
      expect(body.cooldown.until).toBe(cooldownUntil);
    });

    it('should still succeed even if cooldown table does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM follows')) {
          return Promise.resolve({
            rows: [{ id: 'follow-id', status: 'accepted' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO follow_cooldowns')) {
          return Promise.reject(new Error('relation "follow_cooldowns" does not exist'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Successfully unfollowed user');
    });
  });

  // ── 8. Database errors ──

  describe('database errors', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 and ROLLBACK when transaction fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM follows')) {
          return Promise.resolve({
            rows: [{ id: 'follow-id', status: 'accepted' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('DELETE FROM follows')) {
          return Promise.reject(new Error('FK constraint'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');

      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
