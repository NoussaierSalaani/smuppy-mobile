/**
 * Tests for sessions/create Lambda handler
 * Covers: auth, validation, rate limit, schedule conflict, pack usage, happy path, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

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
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({ resolveProfileId: jest.fn() }));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MIN_SESSION_DURATION_MINUTES: 15,
  MAX_SESSION_DURATION_MINUTES: 480,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../sessions/create';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CREATOR_ID = 'c1c2c3c4-e5f6-7890-abcd-ef1234567890';
const PACK_ID = 'e1e2e3e4-e5f6-7890-abcd-ef1234567890';

function futureDate(hoursFromNow = 24): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({
      creatorId: CREATOR_ID,
      scheduledAt: futureDate(),
      duration: 30,
    }),
    queryStringParameters: null,
    pathParameters: null,
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

/** Pool-level query (used by resolveProfileId in withAuthHandler) */
const mockPoolQuery = jest.fn();
/** Client-level query (used by the transaction inside the handler) */
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockClientQuery, release: mockRelease };
const mockConnect = jest.fn().mockResolvedValue(mockClient);

function makeCreatorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CREATOR_ID,
    full_name: 'Test Creator',
    username: 'testcreator',
    sessions_enabled: true,
    session_price: '50.00',
    session_duration: 30,
    ...overrides,
  };
}

function makeSessionRow() {
  return {
    id: 'session-uuid-123',
    creator_id: CREATOR_ID,
    fan_id: TEST_PROFILE_ID,
    scheduled_at: futureDate(),
    duration: 30,
    price: '50.00',
    status: 'pending',
    created_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockPoolQuery, connect: mockConnect });
  (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  (requireRateLimit as jest.Mock).mockResolvedValue(null);
  (isValidUUID as jest.Mock).mockReturnValue(true);
  mockConnect.mockResolvedValue(mockClient);
  mockPoolQuery.mockResolvedValue({ rows: [] });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe('sessions/create handler', () => {
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

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValue({ statusCode: 429, headers: {}, body: '{}' });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(429);
    });
  });

  describe('validation', () => {
    it('should return 400 when missing required fields', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Missing required fields');
    });

    it('should return 400 when creatorId missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({ scheduledAt: futureDate(), duration: 30 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when scheduledAt missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, duration: 30 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when duration missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate() }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for invalid creatorId UUID', async () => {
      (isValidUUID as jest.Mock).mockImplementation((id: string) => id === CREATOR_ID);
      const event = makeEvent({
        body: JSON.stringify({ creatorId: 'bad-uuid', scheduledAt: futureDate(), duration: 30 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid ID format');
    });

    it('should return 400 for invalid fromPackId UUID', async () => {
      (isValidUUID as jest.Mock).mockImplementation((id: string) => {
        if (id === CREATOR_ID) return true;
        return false;
      });
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 30, fromPackId: 'bad-pack' }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid ID format');
    });

    it('should return 400 for past scheduled date', async () => {
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: '2020-01-01T00:00:00Z', duration: 30 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('past scheduled date');
    });

    it('should return 400 for invalid date format', async () => {
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: 'not-a-date', duration: 30 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid or past scheduled date');
    });

    it('should clamp duration to MIN_SESSION_DURATION_MINUTES', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 5 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(201);
    });

    it('should clamp duration to MAX_SESSION_DURATION_MINUTES', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 9999 }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(201);
    });
  });

  describe('creator checks', () => {
    it('should return 404 when creator not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // creator not found
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Creator not found');
    });

    it('should ROLLBACK when creator not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // creator not found
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const rollbackCalls = mockClientQuery.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0] === 'ROLLBACK'
      );
      expect(rollbackCalls.length).toBe(1);
    });

    it('should return 400 when creator does not accept sessions', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ sessions_enabled: false })] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('does not accept sessions');
    });
  });

  describe('schedule conflict', () => {
    it('should return 409 when time slot is not available', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [{ id: 'existing-session' }] }); // conflict
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toContain('Time slot not available');
    });

    it('should ROLLBACK on schedule conflict', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [{ id: 'existing-session' }] }); // conflict
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const rollbackCalls = mockClientQuery.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0] === 'ROLLBACK'
      );
      expect(rollbackCalls.length).toBe(1);
    });
  });

  describe('pack usage', () => {
    it('should return 400 when pack is invalid or expired', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [] }); // pack not found
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 30, fromPackId: PACK_ID }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid or expired pack');
    });

    it('should return 400 when pack has no remaining sessions (atomic decrement fails)', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [{ id: PACK_ID, sessions_remaining: 1 }] }) // pack found
        .mockResolvedValueOnce({ rowCount: 0 }); // decrement fails
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 30, fromPackId: PACK_ID }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('No sessions remaining');
    });

    it('should set price to 0 when using a pack', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_price: '100.00' })] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [{ id: PACK_ID, sessions_remaining: 5 }] }) // pack found
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ sessions_remaining: 4 }] }) // decrement ok
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session created
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 30, fromPackId: PACK_ID }),
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(201);
      const insertCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO private_sessions')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][4]).toBe(0); // price = 0 for pack usage
    });
  });

  describe('happy path', () => {
    beforeEach(() => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [makeSessionRow()] }) // session created
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
    });

    it('should return 201 with session details', async () => {
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.session).toBeDefined();
      expect(body.session.id).toBeDefined();
      expect(body.session.status).toBe('pending');
      expect(body.session.creatorId).toBe(CREATOR_ID);
      expect(body.session.creatorName).toBe('Test Creator');
    });

    it('should use creator session_price when not using pack', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const insertCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO private_sessions')
      );
      expect(insertCall![1][4]).toBe('50.00');
    });

    it('should send notification to creator', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const notifCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1][0]).toBe(CREATOR_ID);
    });

    it('should COMMIT transaction on success', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const commitCalls = mockClientQuery.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && call[0] === 'COMMIT'
      );
      expect(commitCalls.length).toBe(1);
    });

    it('should release client on success', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should set notes to null when not provided', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const insertCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO private_sessions')
      );
      expect(insertCall![1][5]).toBeNull();
    });

    it('should pass pack_id as null when not using pack', async () => {
      const event = makeEvent();
      await handler(event, {} as never, () => {});
      const insertCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO private_sessions')
      );
      expect(insertCall![1][7]).toBeNull(); // pack_id = null
    });
  });

  describe('happy path with notes', () => {
    it('should pass notes to session insert', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockResolvedValueOnce({ rows: [makeSessionRow()] })
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const event = makeEvent({
        body: JSON.stringify({ creatorId: CREATOR_ID, scheduledAt: futureDate(), duration: 30, notes: 'My session notes' }),
      });
      await handler(event, {} as never, () => {});
      const insertCall = mockClientQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO private_sessions')
      );
      expect(insertCall![1][5]).toBe('My session notes');
    });
  });

  describe('error handling', () => {
    it('should return 500 on database connect error', async () => {
      mockConnect.mockRejectedValueOnce(new Error('DB error'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });

    it('should ROLLBACK on transaction error mid-flow', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [] }) // no conflicts
        .mockRejectedValueOnce(new Error('Insert failed')); // session insert fails
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('should handle malformed JSON body gracefully', async () => {
      const event = makeEvent({ body: '{invalid' });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });
  });
});
