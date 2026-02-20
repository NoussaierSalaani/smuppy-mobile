/**
 * Tests for notifications/preferences-get Lambda handler
 * Covers: auth, profile not found, happy path (with prefs, without prefs, null fields), DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
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

import { handler } from '../../notifications/preferences-get';

// ── Test constants ───────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
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

// ── Test suite ───────────────────────────────────────────────────────────

describe('notifications/preferences-get handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = { query: jest.fn() };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
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
        httpMethod: 'GET',
        headers: {},
        body: null,
        queryStringParameters: null,
        pathParameters: null,
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Profile not found ────────────────────────────────────────────

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 3. Happy path — preferences exist ──────────────────────────────

  describe('happy path — preferences exist', () => {
    it('should return stored preferences mapped to camelCase keys', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          likes_enabled: true,
          comments_enabled: false,
          follows_enabled: true,
          messages_enabled: false,
          mentions_enabled: true,
          live_enabled: false,
        }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.preferences).toEqual({
        likes: true,
        comments: false,
        follows: true,
        messages: false,
        mentions: true,
        live: false,
      });
    });

    it('should default null fields to true', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          likes_enabled: null,
          comments_enabled: true,
          follows_enabled: null,
          messages_enabled: false,
          mentions_enabled: null,
          live_enabled: true,
        }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.preferences.likes).toBe(true);
      expect(body.preferences.follows).toBe(true);
      expect(body.preferences.mentions).toBe(true);
      // Non-null values preserved
      expect(body.preferences.comments).toBe(true);
      expect(body.preferences.messages).toBe(false);
      expect(body.preferences.live).toBe(true);
    });
  });

  // ── 4. Happy path — no preferences row ────────────────────────────

  describe('happy path — no preferences row', () => {
    it('should return all-true defaults when no preferences exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.preferences).toEqual({
        likes: true,
        comments: true,
        follows: true,
        messages: true,
        mentions: true,
        live: true,
      });
    });
  });

  // ── 5. Query correctness ───────────────────────────────────────────

  describe('query correctness', () => {
    it('should query notification_preferences with profile ID', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('notification_preferences'),
        [TEST_PROFILE_ID],
      );

      const queryCall = mockDb.query.mock.calls[0];
      const queryText = queryCall[0] as string;
      expect(queryText).toContain('user_id = $1');
    });
  });

  // ── 6. Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when database query throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
