/**
 * Comprehensive tests for sessions/accept Lambda handler
 * Covers: OPTIONS, auth, validation, rate limit, profile resolution,
 *         session lookup, happy path (transaction + agora + notification), DB errors
 */

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  corsHeaders: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
}));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee') }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/constants', () => ({ RATE_WINDOW_1_MIN: 60 }));
jest.mock('../../utils/auth', () => ({ resolveProfileId: jest.fn() }));

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { handler } from '../../sessions/accept';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FAN_ID = 'f1f2f3f4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: SESSION_ID },
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

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (isValidUUID as jest.Mock).mockReturnValue(true);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
});

describe('sessions/accept handler', () => {
  // ─── 1. OPTIONS preflight ────────────────────────────────────────────
  describe('OPTIONS preflight', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('');
    });
  });

  // ─── 2. Authentication ───────────────────────────────────────────────
  describe('authentication', () => {
    it('should return 401 when cognitoSub is missing', async () => {
      const event = makeEvent({ sub: null });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Unauthorized');
    });
  });

  // ─── 3. Session ID validation ────────────────────────────────────────
  describe('session ID validation', () => {
    it('should return 400 when session ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Valid session ID required');
    });

    it('should return 400 when session ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Valid session ID required');
    });

    it('should call isValidUUID with the session ID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'some-value' } });
      await handler(event, {} as never, () => {});
      expect(isValidUUID).toHaveBeenCalledWith('some-value');
    });
  });

  // ─── 4. Rate limiting ────────────────────────────────────────────────
  describe('rate limiting', () => {
    it('should return rate limit response when rate limited', async () => {
      const rateLimitRes = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitRes);

      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toBe('Rate limit exceeded');
    });

    it('should call requireRateLimit with correct parameters', async () => {
      const event = makeEvent();
      // Provide enough mocks so handler proceeds past rate limit check
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT session
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK

      await handler(event, {} as never, () => {});
      expect(requireRateLimit).toHaveBeenCalledWith(
        {
          prefix: 'session-accept',
          identifier: TEST_SUB,
          windowSeconds: 60,
          maxRequests: 10,
        },
        expect.objectContaining({ 'Content-Type': 'application/json' })
      );
    });
  });

  // ─── 5. Profile not found ────────────────────────────────────────────
  describe('profile resolution', () => {
    it('should return 404 when profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Profile not found');
    });

    it('should call resolveProfileId with pool and cognitoSub', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const pool = await getPool();
      expect(resolveProfileId).toHaveBeenCalledWith(pool, TEST_SUB);
    });
  });

  // ─── 6. Session not found (empty result) ─────────────────────────────
  describe('session not found', () => {
    it('should return 404 when session does not exist or is already processed', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT session — empty
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK

      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Session not found or already processed');
    });

    it('should ROLLBACK the transaction when session is not found', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT session — empty
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK

      const event = makeEvent();
      await handler(event, {} as never, () => {});

      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockQuery).toHaveBeenNthCalledWith(3, 'ROLLBACK');
    });

    it('should release the client when session is not found', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT session — empty
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK

      const event = makeEvent();
      await handler(event, {} as never, () => {});
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 7. Happy path ───────────────────────────────────────────────────
  describe('happy path', () => {
    const sessionRow = {
      id: SESSION_ID,
      creator_id: TEST_PROFILE_ID,
      fan_id: FAN_ID,
      status: 'pending',
      scheduled_at: '2026-03-01T10:00:00Z',
      fan_name: 'Test Fan',
    };

    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow] }); // SELECT session
      mockQuery.mockResolvedValueOnce({}); // UPDATE private_sessions
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
    });

    it('should return 200 with session data', async () => {
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Session confirmed');
      expect(body.session.id).toBe(SESSION_ID);
      expect(body.session.status).toBe('confirmed');
    });

    it('should generate agora channel using mocked uuid (first 8 chars: aaaaaaaa)', async () => {
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);

      const expectedChannel = `session_${SESSION_ID}_aaaaaaaa`;
      expect(body.session.agoraChannel).toBe(expectedChannel);
    });

    it('should execute BEGIN and COMMIT in proper order', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});

      expect(mockQuery).toHaveBeenCalledTimes(5);
      expect(mockQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockQuery).toHaveBeenNthCalledWith(5, 'COMMIT');
    });

    it('should SELECT the session with correct parameters', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});

      const selectCall = mockQuery.mock.calls[1];
      expect(selectCall[0]).toContain('SELECT');
      expect(selectCall[0]).toContain('private_sessions');
      expect(selectCall[0]).toContain("status = 'pending'");
      expect(selectCall[1]).toEqual([SESSION_ID, TEST_PROFILE_ID]);
    });

    it('should UPDATE session status to confirmed with agora channel', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});

      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE private_sessions');
      expect(updateCall[0]).toContain("status = 'confirmed'");
      expect(updateCall[0]).toContain('agora_channel');
      const expectedChannel = `session_${SESSION_ID}_aaaaaaaa`;
      expect(updateCall[1]).toEqual([expectedChannel, SESSION_ID]);
    });

    it('should INSERT a notification for the fan', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});

      const insertCall = mockQuery.mock.calls[3];
      expect(insertCall[0]).toContain('INSERT INTO notifications');
      expect(insertCall[0]).toContain('session_confirmed');
      expect(insertCall[1][0]).toBe(FAN_ID);
      expect(insertCall[1][1]).toBe('Votre session a ete confirmee');

      const notificationData = JSON.parse(insertCall[1][2]);
      expect(notificationData.sessionId).toBe(SESSION_ID);
      expect(notificationData.scheduledAt).toBe('2026-03-01T10:00:00Z');
      expect(notificationData.creatorId).toBe(TEST_PROFILE_ID);
    });

    it('should release the client after success', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 8. Database error ────────────────────────────────────────────────
  describe('database error', () => {
    it('should return 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Failed to accept session');
    });

    it('should ROLLBACK the transaction on error', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({ rows: [{ fan_id: FAN_ID, scheduled_at: '2026-03-01T10:00:00Z' }] }); // SELECT
      mockQuery.mockRejectedValueOnce(new Error('UPDATE failed')); // UPDATE throws
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK

      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);

      // Find the ROLLBACK call (should be the last call after the error)
      const rollbackCalls = mockQuery.mock.calls.filter(
        (call) => call[0] === 'ROLLBACK'
      );
      expect(rollbackCalls.length).toBe(1);
    });

    it('should release the client even when an error occurs', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const event = makeEvent();
      await handler(event, {} as never, () => {});
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 9. Agora channel format verification ────────────────────────────
  describe('agora channel format', () => {
    it('should use the format session_{sessionId}_{first8CharsOfUuid}', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          fan_id: FAN_ID,
          status: 'pending',
          scheduled_at: '2026-03-01T10:00:00Z',
          fan_name: 'Fan',
        }],
      }); // SELECT
      mockQuery.mockResolvedValueOnce({}); // UPDATE
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT

      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);

      // uuid mock returns 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      // .substring(0, 8) = 'aaaaaaaa'
      expect(body.session.agoraChannel).toBe(`session_${SESSION_ID}_aaaaaaaa`);
      expect(body.session.agoraChannel).toMatch(/^session_[0-9a-f-]+_[a-z0-9]{8}$/);
    });
  });
});
