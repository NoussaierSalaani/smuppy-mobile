/**
 * Tests for peaks/comment Lambda handler
 * Validates GET (list comments) and POST (create comment) with moderation, auth, rate limit
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──────────────────────────────────────────────────────────

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
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn(),
  sanitizeText: jest.fn((text: string) => text.substring(0, 1000)),
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
}));

jest.mock('../../utils/text-moderation', () => ({
  moderateText: jest.fn().mockResolvedValue({
    blocked: false, contentFlagged: false, flagCategory: null, flagScore: null,
  }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass', maxScore: 0, topCategory: null, categories: [],
  }),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, filtered: '', violations: [] }),
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

import { handler } from '../../peaks/comment';
import { isValidUUID, extractCognitoSub } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { moderateText } from '../../utils/text-moderation';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_AUTHOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_PEAK_ID },
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

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/comment handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('validation', () => {
    it('should return 400 when peak ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Peak ID is required');
    });

    it('should return 400 when peak ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 200 for OPTIONS preflight', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('should return 405 for unsupported methods', async () => {
      const event = makeEvent({ httpMethod: 'PUT' });
      const result = await handler(event);
      expect(result.statusCode).toBe(405);
    });
  });

  describe('GET - list comments', () => {
    it('should return 404 when peak does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // peak check

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });

    it('should return empty list when no comments exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID }] }) // peak check
        .mockResolvedValueOnce({ rows: [] }); // comments query

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('should return formatted comments with author data', async () => {
      const commentRow = {
        id: 'comment-1',
        text: 'Great peak!',
        created_at: '2026-02-08T12:00:00Z',
        author_id: TEST_PROFILE_ID,
        username: 'testuser',
        full_name: 'Test User',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        is_verified: false,
        account_type: 'personal',
        business_name: null,
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID }] }) // peak check
        .mockResolvedValueOnce({ rows: [commentRow] }); // comments query

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].text).toBe('Great peak!');
      expect(body.data[0].author.username).toBe('testuser');
    });

    it('should return 400 for invalid cursor format', async () => {
      (isValidUUID as jest.Mock).mockImplementation((val: string) => {
        if (val === TEST_PEAK_ID) return true;
        return false;
      });

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID }] }); // peak check

      const event = makeEvent({
        httpMethod: 'GET',
        queryStringParameters: { cursor: 'invalid-cursor' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid cursor');
    });
  });

  describe('POST - create comment', () => {
    it('should return 401 when not authenticated', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        sub: null,
        body: JSON.stringify({ text: 'Hello' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });

    it('should return 400 when comment text is missing', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({}),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Comment text is required');
    });

    it('should return 400 when comment text is empty string', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: '   ' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when text blocked by moderation', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      (moderateText as jest.Mock).mockResolvedValueOnce({
        blocked: true,
        blockResponse: {
          statusCode: 400,
          headers: {},
          body: JSON.stringify({ message: 'Content policy violation' }),
        },
        contentFlagged: false,
        flagCategory: null,
        flagScore: null,
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'some bad text' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should return 400 when text blocked by toxicity analysis', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      (moderateText as jest.Mock).mockResolvedValueOnce({
        blocked: true,
        blockResponse: {
          statusCode: 400,
          headers: {},
          body: JSON.stringify({ message: 'Content policy violation' }),
        },
        contentFlagged: false,
        flagCategory: null,
        flagScore: null,
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'toxic text' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should return 404 when user profile not found', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // user profile not found

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'Hello world' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('User profile not found');
    });

    it('should return 404 when peak not found', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            username: 'testuser',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
          }],
        }) // user profile
        .mockResolvedValueOnce({ rows: [] }); // peak not found

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'Hello world' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });

    it('should return 403 when user is blocked by peak author', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            username: 'testuser',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
          }],
        }) // user profile
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // block check positive

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'Hello world' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Action not allowed');
    });

    it('should create comment successfully', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            username: 'testuser',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
          }],
        }) // user profile
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [] }); // block check - not blocked

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'comment-new', text: 'Hello world', created_at: '2026-02-08T12:00:00Z' }],
        }) // INSERT comment
        .mockResolvedValueOnce({ rows: [] }) // UPDATE comments_count
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'Hello world' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.comment).toBeDefined();
      expect(body.comment.text).toBe('Hello world');
      expect(body.comment.author.username).toBe('testuser');
    });

    it('should return 429 when rate limited', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
      const rateLimitResponse = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ text: 'Hello' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('error handling', () => {
    it('should return 500 on unexpected error', async () => {
      // Make isValidUUID throw to trigger the top-level catch
      (isValidUUID as jest.Mock).mockImplementationOnce(() => { throw new Error('unexpected'); });

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
