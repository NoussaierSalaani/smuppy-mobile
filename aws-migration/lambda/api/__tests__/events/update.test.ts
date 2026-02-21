/**
 * Tests for events/update Lambda handler
 * Standalone handler — updates an existing event (creator only).
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
  sanitizeText: jest.fn((text: string) => text.replace(/<[^>]*>/g, '').trim()),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
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
  MAX_EVENT_TITLE_LENGTH: 200,
  MIN_EVENT_PARTICIPANTS: 2,
  MAX_EVENT_PARTICIPANTS: 10000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, violations: [], severity: 'none' }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass', maxScore: 0, topCategory: null, categories: [],
  }),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler as _handler } from '../../events/update';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EVENT_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const futureDate = new Date(Date.now() + 86400000).toISOString();

const updatedEventRow = {
  id: EVENT_ID,
  title: 'Updated Title',
  description: null,
  location_name: 'Central Park',
  address: null,
  latitude: '40.785091',
  longitude: '-73.968285',
  starts_at: futureDate,
  ends_at: null,
  timezone: 'UTC',
  max_participants: null,
  current_participants: 5,
  is_free: true,
  price: null,
  currency: 'EUR',
  is_public: true,
  is_fans_only: false,
  cover_image_url: null,
  images: [],
  has_route: false,
  route_distance_km: null,
  route_difficulty: null,
  route_polyline: null,
  route_waypoints: null,
  status: 'upcoming',
  created_at: '2026-02-19T12:00:00Z',
  updated_at: new Date().toISOString(),
};

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'PUT',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ title: 'Updated Title' }),
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

describe('events/update handler', () => {
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

    // Default: ownership check passes, update succeeds
    mockPool.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, status FROM events WHERE')) {
        return Promise.resolve({
          rows: [{ id: EVENT_ID, status: 'upcoming' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
        return Promise.resolve({ rows: [updatedEventRow] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT username, display_name')) {
        return Promise.resolve({
          rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: null, is_verified: false }],
        });
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

  // ── 2. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result?.statusCode).toBe(401);
    });
  });

  // ── 3. Input validation ──

  describe('input validation', () => {
    it('should return 400 when eventId is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { eventId: 'bad' } });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when title is empty', async () => {
      const event = makeEvent({ body: JSON.stringify({ title: '' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when title is too long', async () => {
      const event = makeEvent({ body: JSON.stringify({ title: 'x'.repeat(201) }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when maxParticipants is out of bounds', async () => {
      const event = makeEvent({ body: JSON.stringify({ maxParticipants: 1 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when coordinates are invalid', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 999, longitude: 0 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when start date is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const event = makeEvent({ body: JSON.stringify({ startsAt: pastDate }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when body has no fields to update', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('No fields to update');
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json' });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid JSON');
    });
  });

  // ── 4. Not found / ownership ──

  describe('not found and ownership', () => {
    it('should return 404 when profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(404);
    });

    it('should return 404 when event does not belong to user', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM events WHERE')) {
          return Promise.resolve({ rows: [] }); // not found or not owner
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(404);
    });

    it('should return 400 when event is already cancelled', async () => {
      mockPool.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, status FROM events WHERE')) {
          return Promise.resolve({
            rows: [{ id: EVENT_ID, status: 'cancelled' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('cancelled');
    });
  });

  // ── 5. Rate limiting ──

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

  // ── 6. Content moderation ──

  describe('content moderation', () => {
    it('should return 400 when text filter blocks content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate_speech'],
        severity: 'critical',
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when toxicity blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block', maxScore: 0.9, topCategory: 'HATE_SPEECH', categories: [],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });
  });

  // ── 7. Account status ──

  describe('account status', () => {
    it('should return 403 when account is suspended', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        headers: {},
        body: JSON.stringify({ message: 'Account suspended' }),
      });
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(403);
    });
  });

  // ── 8. Happy path ──

  describe('happy path', () => {
    it('should return 200 with updated event data', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.success).toBe(true);
      expect(body.event).toBeDefined();
      expect(body.event.id).toBe(EVENT_ID);
    });

    it('should use a transaction', async () => {
      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should release the client', async () => {
      const event = makeEvent();
      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── 9. All optional field branches ──

  describe('optional field branches', () => {
    it('should update description field', async () => {
      const event = makeEvent({ body: JSON.stringify({ description: 'New description' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('description');
    });

    it('should update locationName field', async () => {
      const event = makeEvent({ body: JSON.stringify({ locationName: 'New Park' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('location_name');
    });

    it('should update address field', async () => {
      const event = makeEvent({ body: JSON.stringify({ address: '123 Main St' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('address');
    });

    it('should update latitude and longitude fields', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 48.8566, longitude: 2.3522 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('latitude');
      expect(updateCall[0]).toContain('longitude');
    });

    it('should update startsAt field with future date', async () => {
      const event = makeEvent({ body: JSON.stringify({ startsAt: futureDate }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('starts_at');
    });

    it('should update endsAt with a valid date value', async () => {
      const endDate = new Date(Date.now() + 172800000).toISOString();
      const event = makeEvent({ body: JSON.stringify({ endsAt: endDate }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('ends_at');
    });

    it('should update endsAt with null value (clear end date)', async () => {
      const event = makeEvent({ body: JSON.stringify({ endsAt: null }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('ends_at');
      // The param should be null (the ternary: body.endsAt ? new Date(body.endsAt) : null)
      expect(updateCall[1]).toContain(null);
    });

    it('should update timezone field', async () => {
      const event = makeEvent({ body: JSON.stringify({ timezone: 'America/New_York' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('timezone');
    });

    it('should update maxParticipants field', async () => {
      const event = makeEvent({ body: JSON.stringify({ maxParticipants: 50 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('max_participants');
    });

    it('should update isFree field', async () => {
      const event = makeEvent({ body: JSON.stringify({ isFree: false }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('is_free');
    });

    it('should update price field', async () => {
      const event = makeEvent({ body: JSON.stringify({ price: 19.99 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('price');
    });

    it('should update currency field', async () => {
      const event = makeEvent({ body: JSON.stringify({ currency: 'USD' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('currency');
    });

    it('should update isPublic field', async () => {
      const event = makeEvent({ body: JSON.stringify({ isPublic: false }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('is_public');
    });

    it('should update isFansOnly field', async () => {
      const event = makeEvent({ body: JSON.stringify({ isFansOnly: true }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('is_fans_only');
    });

    it('should update coverImageUrl field', async () => {
      const event = makeEvent({ body: JSON.stringify({ coverImageUrl: 'https://example.com/img.jpg' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('cover_image_url');
    });

    it('should update images field', async () => {
      const event = makeEvent({ body: JSON.stringify({ images: ['img1.jpg', 'img2.jpg'] }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('images');
    });

    it('should update hasRoute field', async () => {
      const event = makeEvent({ body: JSON.stringify({ hasRoute: true }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('has_route');
    });

    it('should update routeDistanceKm field', async () => {
      const event = makeEvent({ body: JSON.stringify({ routeDistanceKm: 15.5 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('route_distance_km');
    });

    it('should update routeDifficulty field', async () => {
      const event = makeEvent({ body: JSON.stringify({ routeDifficulty: 'hard' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('route_difficulty');
    });

    it('should update routePolyline field', async () => {
      const event = makeEvent({ body: JSON.stringify({ routePolyline: 'encoded_polyline_string' }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('route_polyline');
    });

    it('should update routeWaypoints with value (JSON stringified)', async () => {
      const waypoints = [{ lat: 48.8566, lng: 2.3522, name: 'Paris' }];
      const event = makeEvent({ body: JSON.stringify({ routeWaypoints: waypoints }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('route_waypoints');
      // The param should be a JSON string
      expect(updateCall[1]).toContain(JSON.stringify(waypoints));
    });

    it('should update routeWaypoints with null value', async () => {
      const event = makeEvent({ body: JSON.stringify({ routeWaypoints: null }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('route_waypoints');
      // The param should contain null for waypoints
      expect(updateCall[1]).toContain(null);
    });

    it('should update multiple fields at once', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          title: 'Multi update',
          description: 'Updated desc',
          isFree: true,
          maxParticipants: 100,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE events SET')
      );
      expect(updateCall[0]).toContain('title');
      expect(updateCall[0]).toContain('description');
      expect(updateCall[0]).toContain('is_free');
      expect(updateCall[0]).toContain('max_participants');
    });
  });

  // ── 10. Input validation edge cases ──

  describe('input validation edge cases', () => {
    it('should return 400 when title is a non-string type', async () => {
      const event = makeEvent({ body: JSON.stringify({ title: 123 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Title cannot be empty');
    });

    it('should return 400 when eventId path parameter is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid ID format');
    });

    it('should handle null body (default to empty object)', async () => {
      // Construct event directly to bypass makeEvent default body
      const event = {
        httpMethod: 'PUT',
        headers: {},
        body: null,
        queryStringParameters: null,
        pathParameters: { eventId: EVENT_ID },
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
        isBase64Encoded: false,
        path: '/',
        resource: '/',
        stageVariables: null,
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: { sub: TEST_SUB } },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      // With null body, JSON.parse('{}') returns empty object, no fields to update => 400
      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('No fields to update');
    });

    it('should return 400 when maxParticipants exceeds maximum', async () => {
      const event = makeEvent({ body: JSON.stringify({ maxParticipants: 20000 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Max participants');
    });

    it('should return 400 when only latitude is provided (triggers NaN check)', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 45 }) });
      const result = await handler(event);

      // longitude is undefined => Number(undefined) = NaN => invalid coordinates
      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid coordinates');
    });

    it('should return 400 when only longitude is provided (triggers NaN check)', async () => {
      const event = makeEvent({ body: JSON.stringify({ longitude: 90 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid coordinates');
    });

    it('should return 400 when latitude is out of range (> 90)', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 91, longitude: 0 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when longitude is out of range (< -180)', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 0, longitude: -181 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when longitude is out of range (> 180)', async () => {
      const event = makeEvent({ body: JSON.stringify({ latitude: 0, longitude: 181 }) });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });
  });

  // ── 11. Response mapping branches ──

  describe('response mapping', () => {
    it('should map price as float when price is present', async () => {
      const rowWithPrice = { ...updatedEventRow, price: '29.99', is_free: false };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.resolve({ rows: [rowWithPrice] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT username, display_name')) {
          return Promise.resolve({
            rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: null, is_verified: false }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.price).toBe(29.99);
    });

    it('should map price as null when price is not present', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.price).toBeNull();
    });

    it('should map route data when has_route is true', async () => {
      const rowWithRoute = {
        ...updatedEventRow,
        has_route: true,
        route_distance_km: '25.5',
        route_difficulty: 'hard',
        route_polyline: 'encoded_polyline',
        route_waypoints: [{ lat: 48.8, lng: 2.35 }],
      };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.resolve({ rows: [rowWithRoute] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT username, display_name')) {
          return Promise.resolve({
            rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: null, is_verified: false }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.route).toBeDefined();
      expect(body.event.route.distanceKm).toBe(25.5);
      expect(body.event.route.difficulty).toBe('hard');
      expect(body.event.route.polyline).toBe('encoded_polyline');
      expect(body.event.route.waypoints).toBeDefined();
    });

    it('should map route as null when has_route is false', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.route).toBeNull();
    });

    it('should map route.distanceKm as null when route_distance_km is null', async () => {
      const rowWithRouteNoDistance = {
        ...updatedEventRow,
        has_route: true,
        route_distance_km: null,
        route_difficulty: 'easy',
        route_polyline: null,
        route_waypoints: null,
      };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.resolve({ rows: [rowWithRouteNoDistance] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT username, display_name')) {
          return Promise.resolve({
            rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: null, is_verified: false }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(200);
      const body = JSON.parse(result?.body as string);
      expect(body.event.route).toBeDefined();
      expect(body.event.route.distanceKm).toBeNull();
    });

    it('should return 404 when UPDATE returns 0 rows after transaction', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.resolve({ rows: [] }); // 0 rows returned
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(404);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Event not found');
    });
  });

  // ── 12. Database errors ──

  describe('database errors', () => {
    it('should return 500 when UPDATE throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should ROLLBACK and release client when transaction fails', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('UPDATE events SET')) {
          return Promise.reject(new Error('Transaction error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
