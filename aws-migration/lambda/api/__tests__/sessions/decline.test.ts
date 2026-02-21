/**
 * Tests for sessions/decline Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  corsHeaders: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
}));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/security', () => ({ isValidUUID: jest.fn().mockReturnValue(true) }));
jest.mock('../../utils/auth', () => ({ resolveProfileId: jest.fn() }));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

import { handler } from '../../sessions/decline';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
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
});

describe('sessions/decline handler', () => {
  it('should return 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(401);
  });

  it('should return 400 for invalid session ID', async () => {
    (isValidUUID as jest.Mock).mockReturnValue(false);
    const event = makeEvent({ pathParameters: { id: 'bad' } });
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValue(null);
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 404 when session not found', async () => {
    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(404);
  });

  it('should return 403 when user is not a participant', async () => {
    const otherProfile = 'other-profile-id';
    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({
      rows: [{
        creator_id: 'someone-else',
        fan_id: 'another-person',
        status: 'pending',
        fan_name: 'Fan',
        creator_name: 'Creator',
      }],
    });
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(403);
  });

  it('should return 500 on database error', async () => {
    // Trigger error inside the try/catch block (after pool.connect succeeds)
    // by making the BEGIN query throw
    mockQuery.mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent();
    const res = await handler(event, {} as never, () => {});
    const result = res as { statusCode: number };
    expect(result.statusCode).toBe(500);
  });

  // ── Extended Coverage (Batch 7B) ──

  describe('extended — OPTIONS handling', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('');
    });
  });

  describe('extended — validation edge cases', () => {
    it('should return 400 when session ID is missing from pathParameters', async () => {
      const event = makeEvent({ pathParameters: {} });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Valid session ID required');
    });

    it('should return 400 when pathParameters is null', async () => {
      const event = makeEvent();
      (event as Record<string, unknown>).pathParameters = null;
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });
  });

  describe('extended — creator decline flow', () => {
    it('should return 200 with "Session declined" for creator declining pending session', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: TEST_PROFILE_ID,
          fan_id: 'some-fan-id',
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan Name',
          creator_name: 'Creator Name',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification to fan
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Session declined');
    });

    it('should return 400 when creator tries to decline a confirmed session', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: TEST_PROFILE_ID,
          fan_id: 'some-fan-id',
          status: 'confirmed',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan Name',
          creator_name: 'Creator Name',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Only pending sessions can be declined by creator');
    });
  });

  describe('extended — fan cancellation flow', () => {
    it('should return 200 with "Session cancelled" for fan cancelling a session', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan Name',
          creator_name: 'Creator Name',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification to creator
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Session cancelled');
    });

    it('should allow fan to cancel a confirmed session', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'confirmed',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan Name',
          creator_name: 'Creator Name',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification to creator
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Session cancelled');
    });
  });

  describe('extended — pack refund on cancel', () => {
    it('should refund pack session when cancelled session has a pack_id', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      const packId = 'pack-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: packId,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session status
      mockQuery.mockResolvedValueOnce({}); // UPDATE user_session_packs (refund)
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      // Verify the pack refund query was called
      const packRefundCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('user_session_packs')
      );
      expect(packRefundCall).toBeDefined();
      expect(packRefundCall![1][0]).toBe(packId);
    });
  });

  describe('extended — reason sanitization', () => {
    it('should sanitize HTML tags from user-provided reason', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ reason: '<script>alert("xss")</script>I changed my mind' }),
      });
      const res = await handler(event, {} as never, () => {});
      expect((res as { statusCode: number }).statusCode).toBe(200);
      // Check the UPDATE session call used sanitized reason
      const updateCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions')
      );
      expect(updateCall).toBeDefined();
      const reason = updateCall![1][0] as string;
      expect(reason).not.toContain('<script>');
      expect(reason).toContain('I changed my mind');
    });

    it('should use default reason when reason is not a string', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ reason: 12345 }),
      });
      const res = await handler(event, {} as never, () => {});
      expect((res as { statusCode: number }).statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions')
      );
      const reason = updateCall![1][0] as string;
      expect(reason).toBe('Cancelled by fan');
    });

    it('should truncate reason to 500 characters', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const longReason = 'a'.repeat(1000);
      const event = makeEvent({
        body: JSON.stringify({ reason: longReason }),
      });
      const res = await handler(event, {} as never, () => {});
      expect((res as { statusCode: number }).statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions')
      );
      const reason = updateCall![1][0] as string;
      expect(reason.length).toBeLessThanOrEqual(500);
    });
  });

  describe('extended — DB error / transaction rollback paths', () => {
    it('should ROLLBACK and release client when session UPDATE fails', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockRejectedValueOnce(new Error('Update session failed')); // UPDATE throws
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should ROLLBACK and release client when notification insert fails', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: TEST_PROFILE_ID,
          fan_id: 'some-fan-id',
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session OK
      mockQuery.mockRejectedValueOnce(new Error('Notification failed')); // INSERT notification throws
      mockQuery.mockResolvedValueOnce({}); // ROLLBACK
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should not leak internal error details in 500 response', async () => {
      mockQuery.mockRejectedValueOnce(new Error('SENSITIVE: password=abc123'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(500);
      expect(result.body).not.toContain('SENSITIVE');
      expect(result.body).not.toContain('password');
    });

    it('should handle malformed JSON body gracefully', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      // Body parse will throw, caught by try/catch → 500
      const event = makeEvent({ body: '{invalid-json' });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });
  });

  // ── Additional Coverage (Batch 7B-7D) ──
  // Note: mockQuery.mockReset() is needed to flush any unconsumed mockResolvedValueOnce
  // values left by earlier tests (e.g. the malformed JSON test consumes fewer mocks than queued).
  // jest.clearAllMocks() does NOT clear the once-values queue—only mockReset() does.

  describe('additional — pack refund on creator decline', () => {
    beforeEach(() => { mockQuery.mockReset(); });
    it('should refund pack session when creator declines a session with pack_id', async () => {
      const packId = 'pack-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: TEST_PROFILE_ID,
          fan_id: 'some-fan-id',
          status: 'pending',
          pack_id: packId,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session status
      mockQuery.mockResolvedValueOnce({}); // UPDATE user_session_packs (refund)
      mockQuery.mockResolvedValueOnce({}); // INSERT notification to fan
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const packRefundCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('user_session_packs')
      );
      expect(packRefundCall).toBeDefined();
      expect(packRefundCall![1][0]).toBe(packId);
    });
  });

  describe('additional — empty reason with null body', () => {
    beforeEach(() => { mockQuery.mockReset(); });
    it('should use default reason when body is null', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent({ body: null as unknown as string });
      const res = await handler(event, {} as never, () => {});
      expect((res as { statusCode: number }).statusCode).toBe(200);
      const updateCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions')
      );
      const reason = updateCall![1][0] as string;
      expect(reason).toBe('Cancelled by fan');
    });
  });

  describe('additional — creator notification data shape', () => {
    beforeEach(() => { mockQuery.mockReset(); });
    it('should include creatorId in notification data when creator declines', async () => {
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: TEST_PROFILE_ID,
          fan_id: 'some-fan-id',
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const notifCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall).toBeDefined();
      const data = JSON.parse(notifCall![1][2] as string);
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('scheduledAt');
      expect(data).toHaveProperty('creatorId');
    });
  });

  describe('additional — fan notification data shape', () => {
    beforeEach(() => { mockQuery.mockReset(); });
    it('should include fanId in notification data when fan cancels', async () => {
      const fanId = TEST_PROFILE_ID;
      const creatorId = 'creator-uuid-1234-5678-abcdef123456';
      mockQuery.mockResolvedValueOnce({}); // BEGIN
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          creator_id: creatorId,
          fan_id: fanId,
          status: 'pending',
          pack_id: null,
          scheduled_at: new Date().toISOString(),
          fan_name: 'Fan',
          creator_name: 'Creator',
        }],
      });
      mockQuery.mockResolvedValueOnce({}); // UPDATE session
      mockQuery.mockResolvedValueOnce({}); // INSERT notification
      mockQuery.mockResolvedValueOnce({}); // COMMIT
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const notifCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall).toBeDefined();
      const data = JSON.parse(notifCall![1][2] as string);
      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('scheduledAt');
      expect(data).toHaveProperty('fanId');
    });
  });
});
