/**
 * Tests for events/get Lambda handler
 * Standalone handler — fetches a single event by ID with creator info.
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

import { handler } from '../../events/get';
import { isValidUUID } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EVENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const CREATOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const eventRow = {
  id: EVENT_ID,
  title: 'Morning Run',
  description: 'A nice run',
  category_slug: 'running',
  category_name: 'Running',
  category_icon: 'run',
  category_color: '#FF0000',
  location_name: 'Central Park',
  address: 'NYC',
  latitude: '40.785091',
  longitude: '-73.968285',
  starts_at: '2026-03-01T08:00:00Z',
  ends_at: null,
  timezone: 'UTC',
  max_participants: 20,
  current_participants: 5,
  is_free: true,
  price: null,
  currency: 'EUR',
  is_public: true,
  is_fans_only: false,
  status: 'upcoming',
  cover_image_url: null,
  images: [],
  has_route: false,
  route_distance_km: null,
  route_difficulty: null,
  route_waypoints: null,
  route_polyline: null,
  created_at: '2026-02-19T12:00:00Z',
  updated_at: '2026-02-19T12:00:00Z',
  creator_id: CREATOR_ID,
  creator_username: 'creator1',
  creator_display_name: 'Creator One',
  creator_avatar_url: null,
  creator_is_verified: false,
};

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
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

describe('events/get handler', () => {
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

    // Default: event exists, participation query returns nothing
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('JOIN profiles creator')) {
        return Promise.resolve({ rows: [eventRow] });
      }
      if (typeof sql === 'string' && sql.includes('event_participants')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. OPTIONS ──

  describe('OPTIONS', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when eventId is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { eventId: 'bad-uuid' } });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when eventId is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
    it('should return 404 when event does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(404);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toBe('Event not found');
    });
  });

  // ── 4. Happy path ──

  describe('happy path', () => {
    it('should return 200 with event data', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.success).toBe(true);
      expect(body.event.id).toBe(EVENT_ID);
      expect(body.event.title).toBe('Morning Run');
    });

    it('should include creator data', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.creator).toBeDefined();
      expect(body.event.creator.id).toBe(CREATOR_ID);
      expect(body.event.creator.username).toBe('creator1');
    });

    it('should include isCreator=false when user is not the creator', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.isCreator).toBe(false);
    });

    it('should include isCreator=true when user is the creator', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(CREATOR_ID);

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.isCreator).toBe(true);
    });

    it('should include userParticipation when user is a participant', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [eventRow] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants')) {
          return Promise.resolve({ rows: [{ status: 'registered' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.userParticipation).toBe('registered');
    });

    it('should include userParticipation=null when user is not a participant', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.userParticipation).toBeNull();
    });

    it('should release the client', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5. Unauthenticated access ──

  describe('unauthenticated access', () => {
    it('should still return event for unauthenticated users', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.userParticipation).toBeNull();
      expect(body.event.isCreator).toBe(false);
    });
  });

  // ── 6. Database errors ──

  describe('database errors', () => {
    it('should return 500 when query throws', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
