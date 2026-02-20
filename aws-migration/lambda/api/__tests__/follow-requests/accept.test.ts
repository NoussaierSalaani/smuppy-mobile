/**
 * Tests for follow-requests/accept Lambda handler
 * Uses createFollowRequestHandler factory with authRole='target', paramName='id'.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_30S: 30,
  RATE_WINDOW_1_MIN: 60,
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../follow-requests/accept';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TARGET_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REQUESTER_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const REQUEST_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: REQUEST_ID },
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

describe('follow-requests/accept handler', () => {
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
    (isValidUUID as jest.Mock).mockReturnValue(true);

    // Default: profile exists, follow request exists and is pending, target is the auth user
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: TARGET_PROFILE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, requester_id, target_id, status FROM follow_requests')) {
        return Promise.resolve({
          rows: [{
            id: REQUEST_ID,
            requester_id: REQUESTER_PROFILE_ID,
            target_id: TARGET_PROFILE_ID,
            status: 'pending',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: transaction queries succeed — no blocks, accepter name resolved
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('blocked_users')) {
        return Promise.resolve({ rows: [] }); // no blocks
      }
      if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
        return Promise.resolve({
          rows: [{ display_name: 'Target User', username: 'targetuser' }],
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
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when request ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { id: 'bad-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid');
    });

    it('should return 400 when request ID path parameter is missing', async () => {
      (isValidUUID as jest.Mock).mockImplementation((val: string) => !val ? false : true);

      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
    it('should return 404 when user profile is not found', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });

    it('should return 404 when follow request does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TARGET_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('follow_requests')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Follow request not found');
    });
  });

  // ── 4. Authorization ──

  describe('authorization', () => {
    it('should return 403 when user is not the target of the follow request', async () => {
      // The auth user is the requester, not the target
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: REQUESTER_PROFILE_ID }] }); // auth user is the requester
        }
        if (typeof sql === 'string' && sql.includes('follow_requests')) {
          return Promise.resolve({
            rows: [{
              id: REQUEST_ID,
              requester_id: REQUESTER_PROFILE_ID,
              target_id: TARGET_PROFILE_ID,
              status: 'pending',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Not authorized');
    });
  });

  // ── 5. Already processed ──

  describe('already processed request', () => {
    it('should return 400 when request is already accepted', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TARGET_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('follow_requests')) {
          return Promise.resolve({
            rows: [{
              id: REQUEST_ID,
              requester_id: REQUESTER_PROFILE_ID,
              target_id: TARGET_PROFILE_ID,
              status: 'accepted',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('already accepted');
    });
  });

  // ── 6. Block check ──

  describe('block check', () => {
    it('should return 403 when a bidirectional block exists', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] }); // block found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot accept this follow request');
    });
  });

  // ── 7. Rate limiting ──

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
    });
  });

  // ── 8. Happy path ──

  describe('happy path', () => {
    it('should return 200 with success message on accept', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Follow request accepted');
    });

    it('should use a transaction (useTransaction=true)', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should create a follow relationship', async () => {
      const event = makeEvent();
      await handler(event);

      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO follows'),
      );
      expect(insertCall).toBeDefined();
    });

    it('should create a notification for the requester', async () => {
      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
    });

    it('should release the client after the transaction', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 9. Database errors ──

  describe('database errors', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK when transaction fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE follow_requests')) {
          return Promise.reject(new Error('FK constraint'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
