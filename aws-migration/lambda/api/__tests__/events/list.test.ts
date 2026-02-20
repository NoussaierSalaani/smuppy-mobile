/**
 * Tests for events/list Lambda handler
 * Standalone handler — lists events with filters (upcoming, nearby, category, etc.)
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../events/list';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EVENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const eventRow = {
  id: EVENT_ID,
  title: 'Morning Run',
  description: 'Run together',
  location_name: 'Central Park',
  address: 'NYC',
  latitude: '40.785091',
  longitude: '-73.968285',
  starts_at: '2026-03-01T08:00:00Z',
  ends_at: null,
  timezone: 'UTC',
  max_participants: 20,
  min_participants: 2,
  current_participants: 5,
  is_free: true,
  price: null,
  currency: 'EUR',
  is_public: true,
  is_fans_only: false,
  cover_image_url: null,
  has_route: false,
  route_distance_km: null,
  route_elevation_gain_m: null,
  route_difficulty: null,
  status: 'upcoming',
  view_count: 10,
  created_at: '2026-02-19T12:00:00Z',
  category_id: 'cat-1',
  category_name: 'Running',
  category_slug: 'running',
  category_icon: 'run',
  category_color: '#FF0000',
  creator_id: 'creator-1',
  creator_username: 'runner1',
  creator_display_name: 'Runner One',
  creator_avatar: null,
  creator_verified: false,
};

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
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

// ── Test suite ──

describe('events/list handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

    // Default: returns one event, no participation
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM events e') && sql.includes('JOIN event_categories')) {
        return Promise.resolve({ rows: [eventRow] });
      }
      if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
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

  // ── 2. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(429);
    });
  });

  // ── 3. Happy path ──

  describe('happy path', () => {
    it('should return 200 with events list', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.success).toBe(true);
      expect(body.events).toBeDefined();
      expect(body.events).toHaveLength(1);
      expect(body.events[0].id).toBe(EVENT_ID);
    });

    it('should include pagination info', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should include filter in response', async () => {
      const event = makeEvent({ queryStringParameters: { filter: 'upcoming' } });
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.filter).toBe('upcoming');
    });

    it('should default filter to upcoming', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.filter).toBe('upcoming');
    });

    it('should format location data correctly', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      const ev = body.events[0];
      expect(ev.location).toBeDefined();
      expect(ev.location.name).toBe('Central Park');
      expect(typeof ev.location.latitude).toBe('number');
    });

    it('should format participant data correctly', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      const ev = body.events[0];
      expect(ev.participants).toBeDefined();
      expect(ev.participants.current).toBe(5);
      expect(ev.participants.max).toBe(20);
      expect(ev.participants.spotsLeft).toBe(15);
    });

    it('should release the client', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 4. Pagination ──

  describe('pagination', () => {
    it('should support cursor-based pagination with date|uuid format', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          cursor: '2026-03-01T08:00:00Z|b2c3d4e5-f6a7-8901-bcde-f12345678901',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });

    it('should return 400 for invalid cursor format', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          cursor: 'bad-cursor',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 for invalid startDate', async () => {
      const event = makeEvent({
        queryStringParameters: {
          startDate: 'not-a-date',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });
  });

  // ── 5. Unauthenticated access ──

  describe('unauthenticated access', () => {
    it('should still list events for unauthenticated users', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
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
