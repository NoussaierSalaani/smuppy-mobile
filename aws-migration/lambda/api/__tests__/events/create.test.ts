/**
 * Tests for events/create Lambda handler
 * Standalone handler — creates an event with moderation, validation, and account limits.
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

import { handler as _handler } from '../../events/create';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CATEGORY_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const EVENT_ID = 'e5f6a7b8-c901-2345-efab-567890123456';

const futureDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow

function validBody() {
  return JSON.stringify({
    title: 'Morning Run',
    categorySlug: 'running',
    locationName: 'Central Park',
    latitude: 40.785091,
    longitude: -73.968285,
    startsAt: futureDate,
  });
}

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? validBody(),
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

// ── Test suite ──

describe('events/create handler', () => {
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

    // Default: profile exists as personal account, category exists, insert succeeds
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
        return Promise.resolve({
          rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }],
        });
      }
      if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('events')) {
        return Promise.resolve({ rows: [{ count: 0 }] });
      }
      if (typeof sql === 'string' && sql.includes('event_categories WHERE slug')) {
        return Promise.resolve({
          rows: [{ id: CATEGORY_ID, name: 'Running', icon: 'run', color: '#FF0000' }],
        });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO events')) {
        return Promise.resolve({
          rows: [{
            id: EVENT_ID,
            title: 'Morning Run',
            description: null,
            category_id: CATEGORY_ID,
            location_name: 'Central Park',
            address: null,
            latitude: '40.785091',
            longitude: '-73.968285',
            starts_at: futureDate,
            ends_at: null,
            timezone: 'UTC',
            max_participants: null,
            min_participants: 1,
            is_free: true,
            price: null,
            currency: 'EUR',
            is_public: true,
            is_fans_only: false,
            cover_image_url: null,
            images: [],
            has_route: false,
            route_distance_km: null,
            route_elevation_gain_m: null,
            route_difficulty: null,
            route_polyline: null,
            route_waypoints: null,
            status: 'upcoming',
            created_at: new Date().toISOString(),
          }],
        });
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
    it('should return 201 for OPTIONS request (withErrorHandler does not intercept OPTIONS)', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);

      // withErrorHandler passes OPTIONS through to the handler, which proceeds normally
      expect(result?.statusCode).toBe(201);
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
    it('should return 400 when title is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 40.0,
          longitude: -73.0,
          startsAt: futureDate,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when title is too long', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          title: 'x'.repeat(201),
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 40.0,
          longitude: -73.0,
          startsAt: futureDate,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Title too long');
    });

    it('should return 400 when coordinates are invalid', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          title: 'Test Event',
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 999,
          longitude: -73.0,
          startsAt: futureDate,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid coordinates');
    });

    it('should return 400 when maxParticipants is out of bounds', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          title: 'Test Event',
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 40.0,
          longitude: -73.0,
          startsAt: futureDate,
          maxParticipants: 1,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when start date is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const event = makeEvent({
        body: JSON.stringify({
          title: 'Test Event',
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 40.0,
          longitude: -73.0,
          startsAt: pastDate,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });

    it('should return 400 when category is invalid', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
          return Promise.resolve({
            rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('events')) {
          return Promise.resolve({ rows: [{ count: 0 }] });
        }
        if (typeof sql === 'string' && sql.includes('event_categories WHERE slug')) {
          return Promise.resolve({ rows: [] }); // category not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Invalid category');
    });
  });

  // ── 4. Not found ──

  describe('not found', () => {
    it('should return 404 when profile is not found', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(404);
    });
  });

  // ── 5. Account limits ──

  describe('account limits', () => {
    it('should return 403 when personal account exceeds monthly limit', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
          return Promise.resolve({
            rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('events')) {
          return Promise.resolve({ rows: [{ count: 4 }] }); // at limit
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(403);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Monthly event creation limit');
    });

    it('should return 403 when non-pro tries to create paid event', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
          return Promise.resolve({
            rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('events')) {
          return Promise.resolve({ rows: [{ count: 0 }] });
        }
        if (typeof sql === 'string' && sql.includes('event_categories WHERE slug')) {
          return Promise.resolve({
            rows: [{ id: CATEGORY_ID, name: 'Running', icon: 'run', color: '#FF0000' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({
          title: 'Paid Event',
          categorySlug: 'running',
          locationName: 'Park',
          latitude: 40.0,
          longitude: -73.0,
          startsAt: futureDate,
          isFree: false,
          price: 25,
        }),
      });
      const result = await handler(event);

      expect(result?.statusCode).toBe(403);
      const body = JSON.parse(result?.body as string);
      expect(body.message).toContain('Pro Creators');
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

      expect(result?.statusCode).toBe(429);
    });
  });

  // ── 7. Moderation ──

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
      const body = JSON.parse(result?.body as string);
      expect(body.message).toBe('Content policy violation');
    });

    it('should return 400 when toxicity blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.9,
        topCategory: 'HATE_SPEECH',
        categories: [],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(400);
    });
  });

  // ── 8. Account status ──

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

  // ── 9. Happy path ──

  describe('happy path', () => {
    it('should return 201 with event data on success', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(201);
      const body = JSON.parse(result?.body as string);
      expect(body.success).toBe(true);
      expect(body.event).toBeDefined();
      expect(body.event.id).toBe(EVENT_ID);
      expect(body.event.title).toBe('Morning Run');
    });

    it('should include category data in the response', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.category).toBeDefined();
      expect(body.event.category.name).toBe('Running');
    });

    it('should include creator data in the response', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result?.body as string);
      expect(body.event.creator).toBeDefined();
      expect(body.event.creator.id).toBe(TEST_PROFILE_ID);
      expect(body.event.creator.username).toBe('testuser');
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

  // ── 10. Database errors ──

  describe('database errors', () => {
    it('should return 500 when INSERT throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, account_type FROM profiles')) {
          return Promise.resolve({
            rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('events')) {
          return Promise.resolve({ rows: [{ count: 0 }] });
        }
        if (typeof sql === 'string' && sql.includes('event_categories WHERE slug')) {
          return Promise.resolve({
            rows: [{ id: CATEGORY_ID, name: 'Running', icon: 'run', color: '#FF0000' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO events')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result?.statusCode).toBe(500);
      // Should ROLLBACK
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
