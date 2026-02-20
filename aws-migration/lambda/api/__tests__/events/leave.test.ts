/**
 * Tests for events/leave Lambda handler
 * Uses createEventActionHandler (entity action pattern)
 * Validates auth, rate limit, validation, leave logic
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../events/leave';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_EVENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const CREATOR_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
    pathParameters: { eventId: VALID_EVENT_ID },
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

describe('events/leave handler', () => {
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

    // Default: event exists, user is participant with active status
    mockClient.query.mockImplementation((sql: string) => {
      // Entity query - event lookup
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('FROM events') && sql.includes('WHERE')) {
        return Promise.resolve({
          rows: [{
            id: VALID_EVENT_ID,
            title: 'Test Event',
            status: 'active',
            creator_id: CREATOR_ID,
            max_participants: 50,
          }],
        });
      }
      // Participant check
      if (typeof sql === 'string' && sql.includes('FROM event_participants') && sql.includes('WHERE event_id')) {
        return Promise.resolve({
          rows: [{ id: 'part-id', status: 'confirmed' }],
        });
      }
      // Update events (participant count)
      if (typeof sql === 'string' && sql.includes('UPDATE events SET current_participants')) {
        return Promise.resolve({ rows: [] });
      }
      // Get updated event
      if (typeof sql === 'string' && sql.includes('SELECT current_participants, max_participants FROM events')) {
        return Promise.resolve({
          rows: [{ current_participants: 9, max_participants: 50 }],
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
        body: JSON.stringify({ success: false, message: 'Too many requests.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 3. Invalid event ID
  describe('event ID validation', () => {
    it('should return 400 when eventId is invalid', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({ pathParameters: { eventId: 'bad-id' } });
      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // 4. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 5. Event not found
  describe('event not found', () => {
    it('should return 404 when event does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Event not found');
    });
  });

  // 6. Creator cannot leave own event
  describe('creator leave prevention', () => {
    it('should return 400 when creator tries to leave own event', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{
              id: VALID_EVENT_ID,
              title: 'Test Event',
              status: 'active',
              creator_id: VALID_PROFILE_ID, // Same as user's profile
              max_participants: 50,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Event creator cannot leave');
    });
  });

  // 7. Not a participant
  describe('not a participant', () => {
    it('should return 400 when user is not a participant', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ id: VALID_EVENT_ID, title: 'Test', status: 'active', creator_id: CREATOR_ID, max_participants: 50 }],
          });
        }
        if (typeof sql === 'string' && sql.includes('FROM event_participants')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('You are not a participant of this event');
    });
  });

  // 8. Already left
  describe('already left', () => {
    it('should return 400 when user already left the event', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ id: VALID_EVENT_ID, title: 'Test', status: 'active', creator_id: CREATOR_ID, max_participants: 50 }],
          });
        }
        if (typeof sql === 'string' && sql.includes('FROM event_participants')) {
          return Promise.resolve({ rows: [{ id: 'part-id', status: 'cancelled' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('You have already left this event');
    });
  });

  // 9. Happy path
  describe('happy path', () => {
    it('should return 200 with success on leaving', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Successfully left the event');
      expect(typeof body.currentParticipants).toBe('number');
    });

    it('should include spotsLeft in response when maxParticipants is set', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(typeof body.spotsLeft).toBe('number');
    });
  });

  // 10. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('DB error'));
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 11. OPTIONS
  describe('OPTIONS request', () => {
    it('should return 200 for OPTIONS', async () => {
      const result = await invoke(makeEvent({ httpMethod: 'OPTIONS' }));
      expect(result.statusCode).toBe(200);
    });
  });
});
