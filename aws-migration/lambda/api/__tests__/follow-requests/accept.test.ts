/**
 * Tests for follow-requests/accept Lambda handler
 *
 * Uses createFollowRequestHandler factory with:
 *   authRole='target', paramName='id', useTransaction=true.
 *
 * Covers:
 * - Factory integration (auth, UUID validation, profile resolution, request loading,
 *   authRole enforcement, status=pending check, rate limiting, transaction lifecycle)
 * - onAction callback (block check, UPDATE follow_requests, INSERT follows,
 *   profile name fallback, notification idempotency key, push notification,
 *   push failure resilience)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be declared before any import that triggers module loading) ──

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
import { sendPushToUser } from '../../services/push-notification';

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

  // ── 1. Authentication ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer is undefined', async () => {
      const event = {
        ...makeEvent(),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: undefined,
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should not query the database when auth fails', async () => {
      const event = makeEvent({ sub: null });
      await handler(event);

      expect(getPool).not.toHaveBeenCalled();
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
      expect(JSON.parse(result.body).message).toContain('request');
    });

    it('should return 400 when request ID path parameter is missing', async () => {
      (isValidUUID as jest.Mock).mockImplementation((val: string) => !val ? false : true);

      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid');
    });

    it('should return 400 when pathParameters is null', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = {
        ...makeEvent(),
        pathParameters: null,
      } as unknown as APIGatewayProxyEvent;
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should call isValidUUID with the path parameter value', async () => {
      const event = makeEvent({ pathParameters: { id: REQUEST_ID } });
      await handler(event);

      expect(isValidUUID).toHaveBeenCalledWith(REQUEST_ID);
    });
  });

  // ── 3. Rate limiting ──

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

    it('should call requireRateLimit with correct follow-accept prefix and window', async () => {
      const event = makeEvent();
      await handler(event);

      expect(requireRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'follow-accept',
          identifier: TEST_SUB,
          windowSeconds: 30,
          maxRequests: 10,
        }),
        expect.any(Object),
      );
    });

    it('should not query the database when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests.' }),
      });

      const event = makeEvent();
      await handler(event);

      // getPool is not called because rate limit short-circuits before DB access
      expect(getPool).not.toHaveBeenCalled();
    });
  });

  // ── 4. Profile resolution ──

  describe('profile resolution', () => {
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
  });

  // ── 5. Follow request loading ──

  describe('follow request loading', () => {
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

    it('should load follow request by ID from path parameters', async () => {
      const event = makeEvent();
      await handler(event);

      const frCall = mockDb.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('SELECT id, requester_id, target_id, status FROM follow_requests'),
      );
      expect(frCall).toBeDefined();
      expect(frCall![1]).toEqual([REQUEST_ID]);
    });
  });

  // ── 6. Authorization (authRole = 'target') ──

  describe('authorization', () => {
    it('should return 403 when user is not the target of the follow request', async () => {
      // The auth user resolves to the requester, not the target
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: REQUESTER_PROFILE_ID }] });
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
      expect(JSON.parse(result.body).message).toContain('accept');
    });

    it('should not start a transaction when authRole check fails', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: REQUESTER_PROFILE_ID }] });
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
      await handler(event);

      expect(mockDb.connect).not.toHaveBeenCalled();
    });
  });

  // ── 7. Already processed request (status != pending) ──

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

    it('should return 400 when request is already declined', async () => {
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
              status: 'declined',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('already declined');
    });

    it('should return 400 when request is already cancelled', async () => {
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
              status: 'cancelled',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('already cancelled');
    });
  });

  // ── 8. Block check (onAction) ──

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

    it('should check blocks using the transaction client (not the pool)', async () => {
      const event = makeEvent();
      await handler(event);

      // The block check runs on the transaction client (mockClient), not the pool (mockDb)
      const blockCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('blocked_users'),
      );
      expect(blockCall).toBeDefined();
    });

    it('should check blocks with correct user IDs (profileId and requester_id)', async () => {
      const event = makeEvent();
      await handler(event);

      // The block check query should contain both the profileId (target) and requester_id
      const blockCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('blocked_users'),
      );
      expect(blockCall).toBeDefined();
      const params = blockCall![1];
      expect(params).toContain(TARGET_PROFILE_ID);
      expect(params).toContain(REQUESTER_PROFILE_ID);
    });

    it('should not update follow_requests or follows when blocked', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      await handler(event);

      const updateCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('UPDATE follow_requests'),
      );
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO follows'),
      );
      expect(updateCall).toBeUndefined();
      expect(insertCall).toBeUndefined();
    });
  });

  // ── 9. Happy path ──

  describe('happy path', () => {
    it('should return 200 with success message on accept', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Follow request accepted');
    });

    it('should use a transaction (BEGIN + COMMIT)', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should BEGIN before COMMIT', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      const beginIndex = clientCalls.indexOf('BEGIN');
      const commitIndex = clientCalls.indexOf('COMMIT');
      expect(beginIndex).toBeLessThan(commitIndex);
    });

    it('should update follow request status to accepted', async () => {
      const event = makeEvent();
      await handler(event);

      const updateCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('UPDATE follow_requests'),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(['accepted', REQUEST_ID]);
    });

    it('should create a follow relationship with correct IDs', async () => {
      const event = makeEvent();
      await handler(event);

      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO follows'),
      );
      expect(insertCall).toBeDefined();
      // follower_id = requester, following_id = target (profileId)
      expect(insertCall![1]).toEqual([REQUESTER_PROFILE_ID, TARGET_PROFILE_ID]);
    });

    it('should use ON CONFLICT for upsert on follows table', async () => {
      const event = makeEvent();
      await handler(event);

      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO follows'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![0]).toContain('ON CONFLICT');
      expect(insertCall![0]).toContain('DO UPDATE SET');
    });

    it('should query the accepter profile for display_name', async () => {
      const event = makeEvent();
      await handler(event);

      const profileCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('SELECT display_name, username FROM profiles'),
      );
      expect(profileCall).toBeDefined();
      expect(profileCall![1]).toEqual([TARGET_PROFILE_ID]);
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
      // First param = requester_id (notification recipient)
      expect(notifCall![1][0]).toBe(REQUESTER_PROFILE_ID);
    });

    it('should include display_name in notification body', async () => {
      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      // body param (index 1) should contain the display name
      expect(notifCall![1][1]).toBe('Target User accepted your follow request');
    });

    it('should include senderId in notification data', async () => {
      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      const notifData = JSON.parse(notifCall![1][2]);
      expect(notifData.senderId).toBe(TARGET_PROFILE_ID);
    });

    it('should use idempotency key with daily bucket for notification dedup', async () => {
      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      const idempotencyKey: string = notifCall![1][3];
      expect(idempotencyKey).toMatch(
        new RegExp(`^follow_accepted:${TARGET_PROFILE_ID}:${REQUESTER_PROFILE_ID}:\\d+$`),
      );
    });

    it('should use ON CONFLICT DO NOTHING for idempotent notification', async () => {
      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![0]).toContain('ON CONFLICT');
      expect(notifCall![0]).toContain('DO NOTHING');
    });

    it('should send push notification to the requester', async () => {
      const event = makeEvent();
      await handler(event);

      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb,
        REQUESTER_PROFILE_ID,
        expect.objectContaining({
          title: 'Follow Request Accepted',
          body: 'Target User accepted your follow request',
          data: { type: 'follow_accepted', userId: TARGET_PROFILE_ID },
        }),
        TARGET_PROFILE_ID,
      );
    });

    it('should release the client after the transaction', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should execute queries in correct order within transaction', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) =>
        typeof c[0] === 'string' ? c[0] : '',
      );

      const beginIdx = clientCalls.findIndex((s: string) => s === 'BEGIN');
      const blockIdx = clientCalls.findIndex((s: string) => s.includes('blocked_users'));
      const updateIdx = clientCalls.findIndex((s: string) => s.includes('UPDATE follow_requests'));
      const insertFollowIdx = clientCalls.findIndex((s: string) => s.includes('INSERT INTO follows'));
      const selectProfileIdx = clientCalls.findIndex((s: string) => s.includes('SELECT display_name'));
      const insertNotifIdx = clientCalls.findIndex((s: string) => s.includes('INSERT INTO notifications'));
      const commitIdx = clientCalls.findIndex((s: string) => s === 'COMMIT');

      // Verify order: BEGIN -> block check -> update request -> insert follow -> select profile -> insert notif -> COMMIT
      expect(beginIdx).toBeLessThan(blockIdx);
      expect(blockIdx).toBeLessThan(updateIdx);
      expect(updateIdx).toBeLessThan(insertFollowIdx);
      expect(insertFollowIdx).toBeLessThan(selectProfileIdx);
      expect(selectProfileIdx).toBeLessThan(insertNotifIdx);
      expect(insertNotifIdx).toBeLessThan(commitIdx);
    });
  });

  // ── 10. Display name fallback ──

  describe('display name fallback', () => {
    it('should use "Someone" when display_name is null', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
          return Promise.resolve({
            rows: [{ display_name: null, username: 'targetuser' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1][1]).toBe('Someone accepted your follow request');
    });

    it('should use "Someone" when display_name is empty string', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
          return Promise.resolve({
            rows: [{ display_name: '', username: 'targetuser' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1][1]).toBe('Someone accepted your follow request');
    });

    it('should use "Someone" when profile row is missing (no rows)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
          return Promise.resolve({ rows: [] }); // no rows returned
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1][1]).toBe('Someone accepted your follow request');
    });

    it('should use display_name in push notification body when available', async () => {
      const event = makeEvent();
      await handler(event);

      expect(sendPushToUser).toHaveBeenCalledWith(
        expect.anything(),
        REQUESTER_PROFILE_ID,
        expect.objectContaining({
          body: 'Target User accepted your follow request',
        }),
        TARGET_PROFILE_ID,
      );
    });

    it('should use "Someone" in push notification body when display_name is absent', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      await handler(event);

      expect(sendPushToUser).toHaveBeenCalledWith(
        expect.anything(),
        REQUESTER_PROFILE_ID,
        expect.objectContaining({
          body: 'Someone accepted your follow request',
        }),
        TARGET_PROFILE_ID,
      );
    });
  });

  // ── 11. Push notification resilience ──

  describe('push notification resilience', () => {
    it('should return 200 even when push notification fails', async () => {
      (sendPushToUser as jest.Mock).mockRejectedValueOnce(new Error('Push service down'));

      const event = makeEvent();
      const result = await handler(event);

      // The push error is caught by .catch() and should not affect the response
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });

    it('should still COMMIT the transaction when push notification fails', async () => {
      (sendPushToUser as jest.Mock).mockRejectedValueOnce(new Error('Push service down'));

      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('COMMIT');
      // ROLLBACK should NOT be present
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeUndefined();
    });

    it('should pass the pool (not the client) to sendPushToUser', async () => {
      const event = makeEvent();
      await handler(event);

      // First argument to sendPushToUser should be the pool (mockDb), not the transaction client
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ── 12. Database errors ──

  describe('database errors', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when db.connect throws', async () => {
      mockDb.connect.mockRejectedValueOnce(new Error('Cannot acquire client'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK when block check query fails inside transaction', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.reject(new Error('Query timeout'));
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

    it('should ROLLBACK when UPDATE follow_requests fails', async () => {
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

    it('should ROLLBACK when INSERT INTO follows fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE follow_requests')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO follows')) {
          return Promise.reject(new Error('Unique constraint violation'));
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

    it('should ROLLBACK when INSERT INTO notifications fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT display_name, username FROM profiles')) {
          return Promise.resolve({
            rows: [{ display_name: 'Target User', username: 'targetuser' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO notifications')) {
          return Promise.reject(new Error('Notification insert failed'));
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

    it('should always release the client even when ROLLBACK itself fails', async () => {
      let rollbackCalled = false;
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.reject(new Error('Original error'));
        }
        if (sql === 'ROLLBACK') {
          rollbackCalled = true;
          return Promise.reject(new Error('ROLLBACK also failed'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(rollbackCalled).toBe(true);
      // Client must still be released via finally block
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should return 500 when profile query fails in factory', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB read timeout'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should not leak internal error details to client', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.reject(new Error('FATAL: connection to server lost'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal server error');
      // Ensure error details are not leaked
      expect(body.error).toBeUndefined();
      expect(body.stack).toBeUndefined();
      expect(result.body).not.toContain('FATAL');
      expect(result.body).not.toContain('connection');
    });
  });

  // ── 13. Response headers ──

  describe('response headers', () => {
    it('should include CORS headers on success response', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Content-Type']).toBe('application/json');
      expect(result.headers!['Access-Control-Allow-Origin']).toBeDefined();
    });

    it('should include CORS headers on error response', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.headers).toBeDefined();
      expect(result.headers!['Content-Type']).toBe('application/json');
    });
  });

  // ── 14. Idempotency key structure ──

  describe('idempotency key', () => {
    it('should use daily bucket based on Date.now / 86400000', async () => {
      const fakeNow = 1708387200000; // 2024-02-20 00:00:00 UTC
      jest.spyOn(Date, 'now').mockReturnValue(fakeNow);

      const expectedBucket = Math.floor(fakeNow / 86400000);

      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      const idempotencyKey: string = notifCall![1][3];
      expect(idempotencyKey).toBe(
        `follow_accepted:${TARGET_PROFILE_ID}:${REQUESTER_PROFILE_ID}:${expectedBucket}`,
      );

      jest.restoreAllMocks();
    });
  });

  // ── 15. Edge case: null pathParameters ──

  describe('edge cases', () => {
    it('should handle missing pathParameters gracefully', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = {
        ...makeEvent(),
        pathParameters: null,
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should handle concurrent accept requests (idempotent follow insert)', async () => {
      // The INSERT INTO follows uses ON CONFLICT DO UPDATE, so running twice should not error
      const event = makeEvent();
      const result1 = await handler(event);
      const result2 = await handler(event);

      expect(result1.statusCode).toBe(200);
      expect(result2.statusCode).toBe(200);
    });
  });

  // ── 16. Defensive null guard (line 25) ──

  describe('onAction defensive null guard', () => {
    it('should return 404 if request is null (defensive guard)', async () => {
      // This tests the defensive `if (!request)` guard inside onAction.
      // In normal factory flow with paramName='id', request is never null,
      // but the guard exists for safety. We test it by capturing onAction
      // via a mocked factory and calling it directly with request: null.
      let capturedOnAction: Function | null = null;

      jest.isolateModules(() => {
        jest.doMock('../../utils/create-follow-request-handler', () => ({
          createFollowRequestHandler: (config: { onAction: Function }) => {
            capturedOnAction = config.onAction;
            return jest.fn();
          },
        }));
        // Re-require the module so the factory captures onAction
        require('../../follow-requests/accept');
      });

      expect(capturedOnAction).not.toBeNull();

      const headers = { 'Content-Type': 'application/json' };
      const result = await capturedOnAction!({
        db: mockDb,
        client: mockClient,
        request: null,
        profileId: TARGET_PROFILE_ID,
        headers,
      });

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Follow request not found');
    });
  });
});
