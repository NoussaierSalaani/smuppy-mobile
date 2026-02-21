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

  // ── 9. Database errors ──

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
  });
});
