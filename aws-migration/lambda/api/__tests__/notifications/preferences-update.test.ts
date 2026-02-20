/**
 * Tests for notifications/preferences-update Lambda handler
 * Covers: auth, rate limiting, input validation, profile not found, happy path (upsert), DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

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

import { handler } from '../../notifications/preferences-update';

// ── Test constants ───────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'PUT',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
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

function makeDbPreferencesRow(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    likes_enabled: true,
    comments_enabled: true,
    follows_enabled: true,
    messages_enabled: true,
    mentions_enabled: true,
    live_enabled: true,
    ...overrides,
  };
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('notifications/preferences-update handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = { query: jest.fn() };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should reject when authorizer is missing entirely', async () => {
      const event = {
        httpMethod: 'PUT',
        headers: {},
        body: JSON.stringify({ likes: true }),
        queryStringParameters: null,
        pathParameters: null,
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Rate limiting ────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent({ body: JSON.stringify({ likes: false }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 3. Input validation ─────────────────────────────────────────────

  describe('input validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      const event = makeEvent({ body: '{invalid json' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
    });

    it('should return 400 when no valid preference fields are provided', async () => {
      const event = makeEvent({ body: JSON.stringify({ unknownKey: true }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No valid preference fields provided');
    });

    it('should return 400 when empty body is provided', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No valid preference fields provided');
    });

    it('should return 400 when a preference field is not boolean', async () => {
      const event = makeEvent({ body: JSON.stringify({ likes: 'yes' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Field "likes" must be a boolean');
    });

    it('should return 400 when a preference field is a number', async () => {
      const event = makeEvent({ body: JSON.stringify({ comments: 1 }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Field "comments" must be a boolean');
    });

    it('should return 400 when a preference field is null', async () => {
      const event = makeEvent({ body: JSON.stringify({ follows: null }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Field "follows" must be a boolean');
    });

    it('should ignore unknown keys and only validate known keys', async () => {
      // If body has only unknown keys, it should return 400 for "no valid fields"
      const event = makeEvent({
        body: JSON.stringify({ unknownField: true, anotherUnknown: false }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No valid preference fields provided');
    });
  });

  // ── 4. Profile not found ────────────────────────────────────────────

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({ body: JSON.stringify({ likes: false }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 5. Happy path ──────────────────────────────────────────────────

  describe('happy path', () => {
    it('should update a single preference and return all preferences', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [makeDbPreferencesRow({ likes_enabled: false })],
      });

      const event = makeEvent({ body: JSON.stringify({ likes: false }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.preferences.likes).toBe(false);
      expect(body.preferences.comments).toBe(true);
      expect(body.preferences.follows).toBe(true);
      expect(body.preferences.messages).toBe(true);
      expect(body.preferences.mentions).toBe(true);
      expect(body.preferences.live).toBe(true);
    });

    it('should update multiple preferences at once', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [makeDbPreferencesRow({
          likes_enabled: false,
          comments_enabled: false,
          follows_enabled: false,
        })],
      });

      const event = makeEvent({
        body: JSON.stringify({ likes: false, comments: false, follows: false }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.preferences.likes).toBe(false);
      expect(body.preferences.comments).toBe(false);
      expect(body.preferences.follows).toBe(false);
    });

    it('should update all six preference fields', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [makeDbPreferencesRow({
          likes_enabled: false,
          comments_enabled: false,
          follows_enabled: false,
          messages_enabled: false,
          mentions_enabled: false,
          live_enabled: false,
        })],
      });

      const event = makeEvent({
        body: JSON.stringify({
          likes: false, comments: false, follows: false,
          messages: false, mentions: false, live: false,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.preferences).toEqual({
        likes: false,
        comments: false,
        follows: false,
        messages: false,
        mentions: false,
        live: false,
      });
    });

    it('should execute UPSERT query with ON CONFLICT', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [makeDbPreferencesRow({ likes_enabled: false })],
      });

      const event = makeEvent({ body: JSON.stringify({ likes: false }) });
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const queryCall = mockDb.query.mock.calls[0];
      const queryText = queryCall[0] as string;

      expect(queryText).toContain('INSERT INTO notification_preferences');
      expect(queryText).toContain('ON CONFLICT (user_id) DO UPDATE SET');
      expect(queryText).toContain('RETURNING');
    });

    it('should default null columns to true in the response', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          likes_enabled: false,
          comments_enabled: null,
          follows_enabled: true,
          messages_enabled: null,
          mentions_enabled: null,
          live_enabled: true,
        }],
      });

      const event = makeEvent({ body: JSON.stringify({ likes: false }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.preferences.comments).toBe(true);
      expect(body.preferences.messages).toBe(true);
      expect(body.preferences.mentions).toBe(true);
    });

    it('should accept valid known keys mixed with unknown keys and only process known ones', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [makeDbPreferencesRow({ likes_enabled: false })],
      });

      const event = makeEvent({
        body: JSON.stringify({ likes: false, unknownKey: true }),
      });
      const result = await handler(event);

      // Should succeed because "likes" is a valid known key
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });
  });

  // ── 6. Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when database query throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({ body: JSON.stringify({ likes: true }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeEvent({ body: JSON.stringify({ likes: true }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
