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

    it('should return 400 for invalid cursor format (no pipe separator)', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          cursor: 'bad-cursor',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid cursor format');
    });

    it('should return 400 for cursor with invalid UUID', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          cursor: '2026-03-01T08:00:00Z|not-a-uuid',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('bad UUID');
    });

    it('should return 400 for cursor with invalid date', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          cursor: 'not-a-date|b2c3d4e5-f6a7-8901-bcde-f12345678901',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('bad date');
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

    it('should return 400 for invalid endDate', async () => {
      const event = makeEvent({
        queryStringParameters: {
          endDate: 'not-a-date',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid endDate');
    });

    it('should apply valid startDate filter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          startDate: '2026-01-01T00:00:00Z',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      // Verify the query includes the starts_at >= param
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('e.starts_at >=');
    });

    it('should apply valid endDate filter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          endDate: '2026-12-31T23:59:59Z',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('e.starts_at <=');
    });

    it('should detect hasMore and return nextCursor for starts_at pagination', async () => {
      // Return limitNum+1 rows (default limit 20, so return 21 rows)
      const manyRows = Array.from({ length: 21 }, (_, i) => ({
        ...eventRow,
        id: `b2c3d4e5-f6a7-8901-bcde-f1234567${String(i).padStart(4, '0')}`,
        starts_at: `2026-03-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      }));
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: manyRows });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextCursor).toContain('|');
      expect(body.events).toHaveLength(20);
    });

    it('should use offset-based cursor for nearby filter with coords', async () => {
      const manyRows = Array.from({ length: 21 }, (_, i) => ({
        ...eventRow,
        id: `b2c3d4e5-f6a7-8901-bcde-f1234567${String(i).padStart(4, '0')}`,
        distance_km: i * 1.5,
      }));
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: manyRows });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
          cursor: '0',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.pagination.hasMore).toBe(true);
      // nextCursor should be a numeric offset string (0 + 20 = "20")
      expect(body.pagination.nextCursor).toBe('20');
    });

    it('should handle nearby cursor with non-numeric value (defaults to 0)', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
          cursor: 'bad',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });
  });

  // ── 5. Filter branches ──

  describe('filter branches', () => {
    it('should handle nearby filter with coordinates', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      // Verify distance expression is in the query
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('distance_km');
    });

    it('should handle nearby filter with custom radiusKm', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
          radiusKm: '100',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });

    it('should clamp radiusKm to range [1, 500]', async () => {
      // Test with NaN radiusKm (defaults to 50)
      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
          radiusKm: 'invalid',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });

    it('should handle category filter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'upcoming',
          category: 'running',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('ec.slug');
    });

    it('should handle my-events filter for authenticated user', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'my-events',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('e.creator_id');
    });

    it('should handle joined filter for authenticated user', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'joined',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('event_participants ep');
    });

    it('should apply isFree=true filter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          isFree: 'true',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('e.is_free = TRUE');
    });

    it('should not apply isFree filter when value is not "true"', async () => {
      const event = makeEvent({
        queryStringParameters: {
          isFree: 'false',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).not.toContain('e.is_free = TRUE');
    });

    it('should apply hasRoute=true filter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          hasRoute: 'true',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).toContain('e.has_route = TRUE');
    });

    it('should not apply hasRoute filter when value is not "true"', async () => {
      const event = makeEvent({
        queryStringParameters: {
          hasRoute: 'false',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).not.toContain('e.has_route = TRUE');
    });
  });

  // ── 6. Data mapping branches ──

  describe('data mapping branches', () => {
    it('should map distance_km when present', async () => {
      const rowWithDistance = { ...eventRow, distance_km: 3.456 };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowWithDistance] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].distance).toBe(3.5);
    });

    it('should return null distance when distance_km is not present', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].distance).toBeNull();
    });

    it('should map price when present', async () => {
      const rowWithPrice = { ...eventRow, price: '9.99', is_free: false };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowWithPrice] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].price).toBe(9.99);
    });

    it('should return null price when price is not present', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].price).toBeNull();
    });

    it('should map route data when has_route is true', async () => {
      const rowWithRoute = {
        ...eventRow,
        has_route: true,
        route_distance_km: '15.5',
        route_elevation_gain_m: 200,
        route_difficulty: 'moderate',
      };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowWithRoute] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].route).toBeDefined();
      expect(body.events[0].route.distanceKm).toBe(15.5);
      expect(body.events[0].route.elevationGainM).toBe(200);
      expect(body.events[0].route.difficulty).toBe('moderate');
    });

    it('should return null route when has_route is false', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].route).toBeNull();
    });

    it('should return null route.distanceKm when route_distance_km is null', async () => {
      const rowWithRouteNoDistance = {
        ...eventRow,
        has_route: true,
        route_distance_km: null,
        route_elevation_gain_m: 100,
        route_difficulty: 'easy',
      };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowWithRouteNoDistance] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].route).toBeDefined();
      expect(body.events[0].route.distanceKm).toBeNull();
    });

    it('should return null spotsLeft when max_participants is null', async () => {
      const rowNoMax = { ...eventRow, max_participants: null };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowNoMax] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].participants.spotsLeft).toBeNull();
    });

    it('should map userParticipation when user has participated', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [eventRow] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [{ event_id: EVENT_ID, status: 'registered' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].userParticipation).toBe('registered');
    });

    it('should return null userParticipation when user has not participated', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].userParticipation).toBeNull();
    });

    it('should skip participation query when no rows returned', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events).toHaveLength(0);
      // The participation query should not have been called
      const participationCalls = mockClient.query.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('event_participants') && (c[0] as string).includes('ANY')
      );
      expect(participationCalls).toHaveLength(0);
    });

    it('should skip participation query for unauthenticated user', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.events[0].userParticipation).toBeNull();
    });
  });

  // ── 7. Unauthenticated access ──

  describe('unauthenticated access', () => {
    it('should still list events for unauthenticated users', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });

    it('should use sourceIp as rate limit identifier when no sub', async () => {
      const event = makeEvent({ sub: null });
      await handler(event);

      expect(requireRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: '127.0.0.1' }),
        expect.any(Object),
      );
    });
  });

  // ── 8. Database errors ──

  describe('database errors', () => {
    it('should return 500 when query throws', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 9. Edge cases ──

  describe('edge cases', () => {
    it('should handle custom limit parameter', async () => {
      const event = makeEvent({
        queryStringParameters: {
          limit: '5',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.pagination.limit).toBe(5);
    });

    it('should handle nearby filter without coordinates (no distance expression)', async () => {
      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          // No latitude/longitude — hasCoords is falsy
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      // Should not include the computed distance alias expression (AS distance_km)
      expect(mainQuery).not.toContain('AS distance_km');
    });

    it('should handle both startDate and endDate together', async () => {
      const event = makeEvent({
        queryStringParameters: {
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2026-12-31T23:59:59Z',
        },
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
    });

    it('should not apply block exclusion for unauthenticated user', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [eventRow] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const mainQuery = mockClient.query.mock.calls[0][0];
      expect(mainQuery).not.toContain('blocked_users');
    });

    it('should handle hasMore=false with nearby filter (no nextCursor)', async () => {
      // Return only 1 row (less than limit+1)
      const rowWithDistance = { ...eventRow, distance_km: 1.5 };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM events e')) {
          return Promise.resolve({ rows: [rowWithDistance] });
        }
        if (typeof sql === 'string' && sql.includes('event_participants') && sql.includes('ANY')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        queryStringParameters: {
          filter: 'nearby',
          latitude: '40.785091',
          longitude: '-73.968285',
        },
      });
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.pagination.hasMore).toBe(false);
      expect(body.pagination.nextCursor).toBeNull();
    });
  });
});
