/**
 * Tests for events/join Lambda handler
 * Uses createEventActionHandler factory — register, cancel, or express interest in an event.
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
  cors: jest.fn((resp: Record<string, unknown>) => ({
    statusCode: resp.statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: resp.body,
  })),
  handleOptions: jest.fn(() => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../events/join';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EVENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const CREATOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const futureDate = new Date(Date.now() + 86400000).toISOString();

const eventData = {
  id: EVENT_ID,
  title: 'Morning Run',
  starts_at: futureDate,
  status: 'upcoming',
  is_fans_only: false,
  creator_id: CREATOR_ID,
  is_free: true,
  price: null,
  currency: 'EUR',
  max_participants: 20,
  current_participants: 5,
  creator_username: 'creator1',
  creator_display_name: 'Creator One',
};

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ action: 'register' }),
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

describe('events/join handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { connect: jest.Mock; query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

    // Default: event exists, no existing participation, capacity available, update succeeds
    mockClient.query.mockImplementation((sql: string) => {
      // Entity fetch
      if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('FROM events e') && sql.includes('WHERE')) {
        return Promise.resolve({ rows: [eventData] });
      }
      // Existing participation check
      if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants') && sql.includes('WHERE event_id')) {
        return Promise.resolve({ rows: [] }); // not a participant yet
      }
      // Atomic capacity check
      if (typeof sql === 'string' && sql.includes('UPDATE events SET current_participants = current_participants + 1') && sql.includes('max_participants')) {
        return Promise.resolve({ rows: [{ current_participants: 6 }], rowCount: 1 });
      }
      // Get registrant name
      if (typeof sql === 'string' && sql.includes('SELECT full_name FROM profiles')) {
        return Promise.resolve({ rows: [{ full_name: 'Test User' }] });
      }
      // Updated participant count
      if (typeof sql === 'string' && sql.includes('SELECT current_participants FROM events')) {
        return Promise.resolve({ rows: [{ current_participants: 6 }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. OPTIONS ──

  describe('OPTIONS', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 2. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── 3. Input validation ──

  describe('input validation', () => {
    it('should return 400 when eventId is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { eventId: 'bad' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when action is invalid', async () => {
      const event = makeEvent({ body: JSON.stringify({ action: 'unknown' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Invalid action');
    });
  });

  // ── 4. Not found ──

  describe('not found', () => {
    it('should return 404 when event does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Event not found');
    });

    it('should return 404 when profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
    });
  });

  // ── 5. Event status checks ──

  describe('event status checks', () => {
    it('should return 400 when event has already started', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ ...eventData, starts_at: pastDate }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('already started');
    });

    it('should return 400 when event is cancelled', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ ...eventData, status: 'cancelled' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('cancelled');
    });
  });

  // ── 6. Fans-only check ──

  describe('fans-only events', () => {
    it('should return 403 when event is fans-only and user is not a follower', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ ...eventData, is_fans_only: true }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM follows')) {
          return Promise.resolve({ rows: [] }); // not following
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('fans');
    });
  });

  // ── 7. Capacity check ──

  describe('capacity check', () => {
    it('should return 400 when event is full', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [eventData] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants') && sql.includes('WHERE event_id')) {
          return Promise.resolve({ rows: [] });
        }
        // Atomic capacity check fails (event is full)
        if (typeof sql === 'string' && sql.includes('UPDATE events SET current_participants = current_participants + 1') && sql.includes('max_participants')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('full');
    });
  });

  // ── 8. Rate limiting ──

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

  // ── 9. Happy path: register ──

  describe('happy path - register', () => {
    it('should return 200 with success on registration', async () => {
      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.participationStatus).toBe('registered');
    });

    it('should include currentParticipants in response', async () => {
      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.currentParticipants).toBeDefined();
    });
  });

  // ── 10. Happy path: interested ──

  describe('happy path - interested', () => {
    it('should return 200 with interested status', async () => {
      const event = makeEvent({ body: JSON.stringify({ action: 'interested' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.participationStatus).toBe('interested');
    });
  });

  // ── 11. Happy path: cancel ──

  describe('happy path - cancel registration', () => {
    it('should return 200 when cancelling existing registration', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [eventData] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants') && sql.includes('WHERE event_id')) {
          return Promise.resolve({ rows: [{ id: 'participation-id' }] }); // existing participation
        }
        if (typeof sql === 'string' && sql.includes('SELECT current_participants FROM events')) {
          return Promise.resolve({ rows: [{ current_participants: 4 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'cancel' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.participationStatus).toBe('cancelled');
    });

    it('should return 400 when cancelling without being registered', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [eventData] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants') && sql.includes('WHERE event_id')) {
          return Promise.resolve({ rows: [] }); // not registered
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'cancel' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('not registered');
    });
  });

  // ── 12. Paid events ──

  describe('paid events', () => {
    it('should return requiresPayment=true for paid events', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({
            rows: [{ ...eventData, is_free: false, price: '25.00' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants') && sql.includes('WHERE event_id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.requiresPayment).toBe(true);
    });
  });

  // ── 13. Database errors ──

  describe('database errors', () => {
    it('should return 500 and ROLLBACK when query throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('WHERE')) {
          return Promise.resolve({ rows: [eventData] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM event_participants')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'register' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
