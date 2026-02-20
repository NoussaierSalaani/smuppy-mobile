/**
 * Tests for posts/saves-batch Lambda handler
 * Uses createBatchCheckHandler factory — validates auth, body parsing,
 * UUID validation, profile resolution, batch size, and happy path.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

import { handler } from '../../posts/saves-batch';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const POST_ID_3 = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: 'body' in overrides ? overrides.body as string : JSON.stringify({ postIds: [POST_ID_1, POST_ID_2] }),
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

// ── Test Suite ──

describe('posts/saves-batch handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Body validation ──

  describe('body validation', () => {
    it('should return 400 when body is missing', async () => {
      const event = makeEvent({ body: null as unknown as string });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Request body is required');
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json{{{' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
    });

    it('should return 400 when postIds is not an array', async () => {
      const event = makeEvent({ body: JSON.stringify({ postIds: 'not-an-array' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('postIds must be a non-empty array');
    });

    it('should return 400 when postIds is empty', async () => {
      const event = makeEvent({ body: JSON.stringify({ postIds: [] }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('postIds must be a non-empty array');
    });

    it('should return 400 when postIds exceeds max batch size (50)', async () => {
      const ids = Array.from({ length: 51 }, (_, i) =>
        `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`
      );
      const event = makeEvent({ body: JSON.stringify({ postIds: ids }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('cannot exceed 50');
    });

    it('should return 400 when a postId is not a valid UUID', async () => {
      const event = makeEvent({
        body: JSON.stringify({ postIds: ['not-a-uuid'] }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('All postIds must be valid UUIDs');
    });
  });

  // ── 3. Profile not found ──

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 4. Happy path ──

  describe('successful batch check', () => {
    it('should return saves map with true for saved posts and false for others', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ post_id: POST_ID_1 }, { post_id: POST_ID_3 }],
      });

      const event = makeEvent({
        body: JSON.stringify({ postIds: [POST_ID_1, POST_ID_2, POST_ID_3] }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.saves).toBeDefined();
      expect(body.saves[POST_ID_1]).toBe(true);
      expect(body.saves[POST_ID_2]).toBe(false);
      expect(body.saves[POST_ID_3]).toBe(true);
    });

    it('should return all false when no posts are saved', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        body: JSON.stringify({ postIds: [POST_ID_1, POST_ID_2] }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.saves[POST_ID_1]).toBe(false);
      expect(body.saves[POST_ID_2]).toBe(false);
    });

    it('should query the saved_posts table with correct parameters', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const postIds = [POST_ID_1, POST_ID_2];
      const event = makeEvent({ body: JSON.stringify({ postIds }) });

      await handler(event);

      const queryCall = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('SELECT post_id FROM saved_posts'),
      );
      expect(queryCall).toBeDefined();
      expect(queryCall![1]).toEqual([TEST_PROFILE_ID, postIds]);
    });
  });

  // ── 5. DB error ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
