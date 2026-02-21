/**
 * Unit Tests: createSaveHandler
 *
 * Tests the factory for save/unsave/check handlers (posts and spots).
 * Flow: auth -> validate UUID -> get DB -> resolve profile -> rate limit ->
 *       check resource exists -> execute action -> return response
 */

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
  checkPrivacyAccess: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  MAX_REPORT_REASON_LENGTH: 500,
  MAX_REPORT_DETAILS_LENGTH: 2000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { APIGatewayProxyEvent } from 'aws-lambda';
import { createSaveHandler } from '../../utils/create-save-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
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

describe('createSaveHandler', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedIsValidUUID.mockReturnValue(true);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
  });

  describe('common validation (all actions)', () => {
    it('should return 401 when no auth', async () => {
      const handler = createSaveHandler({
        action: 'save',
        resourceType: 'post',
        loggerName: 'post-save',
        rateLimitPrefix: 'post-save',
      });
      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 400 for invalid UUID', async () => {
      mockedIsValidUUID.mockReturnValue(false);
      const handler = createSaveHandler({
        action: 'save',
        resourceType: 'post',
        loggerName: 'post-save',
        rateLimitPrefix: 'post-save',
      });
      const event = makeEvent({ pathParameters: { id: 'bad-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid post ID format');
    });

    it('should return 404 when profile not found', async () => {
      mockedResolveProfileId.mockResolvedValue(null);
      const handler = createSaveHandler({
        action: 'save',
        resourceType: 'post',
        loggerName: 'post-save',
        rateLimitPrefix: 'post-save',
      });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  describe('save action', () => {
    let handler: ReturnType<typeof createSaveHandler>;

    beforeEach(() => {
      handler = createSaveHandler({
        action: 'save',
        resourceType: 'post',
        loggerName: 'post-save',
        rateLimitPrefix: 'post-save',
      });
    });

    it('should return 404 when resource does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // resource check
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });

    it('should return 200 on successful save', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_POST_ID }] }) // resource exists
        .mockResolvedValueOnce({ rows: [] }); // INSERT
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.saved).toBe(true);
    });

    it('should rate limit save action', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('unsave action', () => {
    let handler: ReturnType<typeof createSaveHandler>;

    beforeEach(() => {
      handler = createSaveHandler({
        action: 'unsave',
        resourceType: 'post',
        loggerName: 'post-unsave',
        rateLimitPrefix: 'post-unsave',
      });
    });

    it('should return 200 on successful unsave', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 }); // DELETE
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.saved).toBe(false);
    });

    it('should not check resource existence for unsave (idempotent delete)', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      await handler(event);

      // Only the DELETE query should be called, not a resource existence check
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM saved_posts'),
        [TEST_PROFILE_ID, TEST_POST_ID]
      );
    });
  });

  describe('check action', () => {
    let handler: ReturnType<typeof createSaveHandler>;

    beforeEach(() => {
      handler = createSaveHandler({
        action: 'check',
        resourceType: 'post',
        loggerName: 'post-is-saved',
        rateLimitPrefix: 'post-check',
      });
    });

    it('should return saved: true when post is saved', async () => {
      mockQuery.mockResolvedValue({ rows: [{ saved: true }] });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.saved).toBe(true);
    });

    it('should return saved: false when post is not saved', async () => {
      mockQuery.mockResolvedValue({ rows: [{ saved: false }] });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.saved).toBe(false);
    });

    it('should not rate limit check action', async () => {
      mockQuery.mockResolvedValue({ rows: [{ saved: false }] });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      await handler(event);

      expect(mockedRequireRateLimit).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Connection lost'));
      const handler = createSaveHandler({
        action: 'check',
        resourceType: 'post',
        loggerName: 'post-check',
        rateLimitPrefix: 'post-check',
      });
      const event = makeEvent({ pathParameters: { id: TEST_POST_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
