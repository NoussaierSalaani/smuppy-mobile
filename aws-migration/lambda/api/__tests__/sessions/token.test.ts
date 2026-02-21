/**
 * Tests for sessions/token Lambda handler
 * Covers: auth, validation, rate limit, session lookup, time window, token generation, error handling
 *
 * NOTE: This handler uses withAuthHandler, which calls resolveProfileId(db, cognitoSub)
 * before the inner handler runs. That consumes one db.query() call (to resolve the profile).
 * The resolveProfileId mock returns the profileId directly, so the db.query from resolveProfileId
 * is NOT consumed from mockPoolQuery. However, the inner handler uses `db.query()` directly
 * (not via a client), so all mockPoolQuery calls are consumed by the inner handler.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));
jest.mock('../../utils/rate-limit', () => ({
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('agora-access-token', () => ({
  RtcTokenBuilder: {
    buildTokenWithUid: jest.fn().mockReturnValue('mock-agora-token'),
  },
  RtcRole: { PUBLISHER: 1 },
}));

import { handler } from '../../sessions/token';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';
import { RtcTokenBuilder } from 'agora-access-token';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CREATOR_ID = 'c1c2c3c4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';

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

const mockPoolQuery = jest.fn();

/** Makes a session row that is currently in the valid time window */
function makeSessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();
  return {
    id: SESSION_ID,
    creator_id: CREATOR_ID,
    fan_id: TEST_PROFILE_ID,
    scheduled_at: new Date(now - 2 * 60 * 1000).toISOString(), // Started 2 min ago
    duration: 30, // 30 min session
    agora_channel: null,
    started_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockPoolQuery });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (isValidUUID as jest.Mock).mockReturnValue(true);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  mockPoolQuery.mockResolvedValue({ rows: [] });
});

describe('sessions/token handler', () => {
  describe('authentication', () => {
    it('should return 401 when unauthenticated', async () => {
      const event = makeEvent({ sub: null });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(401);
    });

    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(404);
    });
  });

  describe('validation', () => {
    it('should return 400 for invalid session ID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'bad' } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Valid session ID required');
    });

    it('should return 400 when session ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when pathParameters is null', async () => {
      const event = makeEvent();
      (event as Record<string, unknown>).pathParameters = null;
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValue({
        statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
      });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(429);
    });
  });

  describe('session lookup', () => {
    it('should return 404 when session not found', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Session not found');
    });

    it('should return 404 when session exists but user is not a participant', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(404);
    });
  });

  describe('time window validation', () => {
    it('should return 400 when session has not started yet (more than 5 min before)', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min in future
      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeSessionRow({ scheduled_at: futureDate })],
      });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('not started yet');
      expect(body.startsIn).toBeDefined();
      expect(body.startsIn).toBeGreaterThan(0);
    });

    it('should return 400 when session has ended', async () => {
      const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeSessionRow({ scheduled_at: pastDate, duration: 30 })], // ended 30 min ago
      });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Session has ended');
    });

    it('should allow token generation within 5 min before scheduled time', async () => {
      const nearFuture = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 min from now
      mockPoolQuery.mockResolvedValue({ rows: [] }); // default for update queries
      mockPoolQuery.mockResolvedValueOnce({
        rows: [makeSessionRow({ scheduled_at: nearFuture })],
      });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });
  });

  describe('happy path — token generation', () => {
    it('should return 200 with token and channel info', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockResolvedValueOnce({ rows: [] }) // update agora_channel
        .mockResolvedValueOnce({ rows: [] }); // update started_at
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.token).toBe('mock-agora-token');
      expect(body.channelName).toBeDefined();
      expect(body.uid).toBeDefined();
      expect(body.appId).toBeDefined();
      expect(body.expiresIn).toBeDefined();
      expect(body.expiresIn).toBeGreaterThan(0);
    });

    it('should set isCreator to false when user is the fan', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);
      expect(body.isCreator).toBe(false);
    });

    it('should set isCreator to true when user is the creator', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(CREATOR_ID);
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);
      expect(body.isCreator).toBe(true);
    });

    it('should generate channel name when not already set', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow({ agora_channel: null })] })
        .mockResolvedValueOnce({ rows: [] }) // update agora_channel
        .mockResolvedValueOnce({ rows: [] }); // update started_at
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);
      expect(body.channelName).toBe(`session_${SESSION_ID}`);
      // Verify the UPDATE query was called to set agora_channel
      const updateCall = mockPoolQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions SET agora_channel')
      );
      expect(updateCall).toBeDefined();
    });

    it('should use existing channel name when already set', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [makeSessionRow({ agora_channel: 'existing_channel_123' })],
        })
        .mockResolvedValueOnce({ rows: [] }); // update started_at (no agora_channel update)
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);
      expect(body.channelName).toBe('existing_channel_123');
      // Verify no UPDATE for agora_channel
      const updateChannelCall = mockPoolQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE private_sessions SET agora_channel')
      );
      expect(updateChannelCall).toBeUndefined();
    });

    it('should update session to in_progress when not started', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow({ started_at: null })] })
        .mockResolvedValueOnce({ rows: [] }) // update agora_channel
        .mockResolvedValueOnce({ rows: [] }); // update started_at
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const updateCall = mockPoolQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('in_progress')
      );
      expect(updateCall).toBeDefined();
    });

    it('should not update session status when already started', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({
          rows: [makeSessionRow({ started_at: new Date().toISOString(), agora_channel: 'chan_123' })],
        });
      // No more queries needed — agora_channel already set, started_at already set
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      const updateStatusCall = mockPoolQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('in_progress')
      );
      expect(updateStatusCall).toBeUndefined();
    });

    it('should call RtcTokenBuilder.buildTokenWithUid with correct params', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      expect(RtcTokenBuilder.buildTokenWithUid).toHaveBeenCalledTimes(1);
      const args = (RtcTokenBuilder.buildTokenWithUid as jest.Mock).mock.calls[0];
      expect(args[0]).toBe(''); // AGORA_APP_ID
      expect(args[1]).toBe(''); // AGORA_APP_CERTIFICATE
      expect(args[2]).toBe(`session_${SESSION_ID}`); // channelName
      expect(typeof args[3]).toBe('number'); // uid
      expect(args[4]).toBe(1); // RtcRole.PUBLISHER
      expect(typeof args[5]).toBe('number'); // tokenExpireSeconds
      expect(args[5]).toBeGreaterThan(0);
    });

    it('should generate deterministic UID from profile ID', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res1 = await handler(event, {} as never, () => {});
      const body1 = JSON.parse((res1 as { body: string }).body);

      // Reset and call again
      jest.clearAllMocks();
      (getPool as jest.Mock).mockResolvedValue({ query: mockPoolQuery });
      (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
      (isValidUUID as jest.Mock).mockReturnValue(true);
      (requireRateLimit as jest.Mock).mockResolvedValue(null);
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res2 = await handler(event, {} as never, () => {});
      const body2 = JSON.parse((res2 as { body: string }).body);
      expect(body1.uid).toBe(body2.uid);
    });

    it('should return a positive UID number', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      expect(typeof body.uid).toBe('number');
      expect(body.uid).toBeGreaterThanOrEqual(0);
      expect(body.uid).toBeLessThan(1000000000);
    });
  });

  describe('error handling', () => {
    it('should return 500 on session query database error', async () => {
      mockPoolQuery.mockRejectedValueOnce(new Error('DB error'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });

    it('should return 500 when agora_channel update fails', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockRejectedValueOnce(new Error('Update failed')); // agora_channel update fails
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });

    it('should return 500 when started_at update fails', async () => {
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session found
        .mockResolvedValueOnce({ rows: [] }) // agora_channel update ok
        .mockRejectedValueOnce(new Error('Status update failed')); // started_at update fails
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });
  });
});
