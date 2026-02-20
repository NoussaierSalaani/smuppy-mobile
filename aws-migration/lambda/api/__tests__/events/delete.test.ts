/**
 * Tests for events/delete Lambda handler
 * Uses createDeleteHandler factory — soft-deletes (cancels) an event.
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../events/delete';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EVENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const OTHER_PROFILE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { eventId: EVENT_ID },
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

describe('events/delete handler', () => {
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

    // Default: requireAuth returns userId
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);

    // Default: validateUUIDParam returns the event ID
    (validateUUIDParam as jest.Mock).mockReturnValue(EVENT_ID);

    // Default: resolveProfileId returns the profile ID
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

    // Default: account status passes (must re-set each time to prevent leaks)
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      profileId: TEST_PROFILE_ID,
      username: 'testuser',
      moderationStatus: 'active',
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);

    // Default: event exists and belongs to user
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('events')) {
        return Promise.resolve({
          rows: [{ id: EVENT_ID, creator_id: TEST_PROFILE_ID, title: 'Test Event', status: 'upcoming' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: transaction queries succeed, no participants to notify
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT user_id FROM event_participants')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const authResponse = {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
      (requireAuth as jest.Mock).mockReturnValue(authResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation(
        (val: unknown) => typeof val !== 'string',
      );

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when eventId is not a valid UUID', async () => {
      const validationResponse = {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Invalid event ID format' }),
      };
      (validateUUIDParam as jest.Mock).mockReturnValue(validationResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation(
        (val: unknown) => typeof val !== 'string',
      );

      const event = makeEvent({ pathParameters: { eventId: 'bad' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
    it('should return 404 when event does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('events')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Event not found');
    });

    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 4. Authorization ──

  describe('authorization', () => {
    it('should return 404 when user is not the creator', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('events')) {
          return Promise.resolve({
            rows: [{ id: EVENT_ID, creator_id: OTHER_PROFILE_ID, title: 'Test', status: 'upcoming' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('not the creator');
    });
  });

  // ── 5. Already cancelled ──

  describe('already cancelled', () => {
    it('should return 400 when event is already cancelled', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('events')) {
          return Promise.resolve({
            rows: [{ id: EVENT_ID, creator_id: TEST_PROFILE_ID, title: 'Test', status: 'cancelled' }],
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

  // ── 6. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // ── 7. Account status ──

  describe('account status', () => {
    it('should return error when account is not active', async () => {
      const accountResponse = {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Account suspended' }),
      };
      (requireActiveAccount as jest.Mock).mockResolvedValue(accountResponse);
      (isAccountError as unknown as jest.Mock).mockReturnValue(true);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
    });
  });

  // ── 8. Happy path ──

  describe('happy path', () => {
    it('should return 200 with success message on cancel', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });

    it('should use a transaction', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should soft-delete the event (set status to cancelled)', async () => {
      const event = makeEvent();
      await handler(event);

      const cancelCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('UPDATE events SET') &&
          (call[0] as string).includes('cancelled'),
      );
      expect(cancelCall).toBeDefined();
    });

    it('should cancel all active participants', async () => {
      const event = makeEvent();
      await handler(event);

      const cancelParticipants = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('UPDATE event_participants'),
      );
      expect(cancelParticipants).toBeDefined();
    });

    it('should notify affected participants', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT user_id FROM event_participants')) {
          return Promise.resolve({
            rows: [
              { user_id: 'user-1' },
              { user_id: 'user-2' },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === 'string' &&
          (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
    });

    it('should release the client', async () => {
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
    });

    it('should ROLLBACK when transaction fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET') && sql.includes('cancelled')) {
          return Promise.reject(new Error('DB error'));
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
