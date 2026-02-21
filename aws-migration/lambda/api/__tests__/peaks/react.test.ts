/**
 * Tests for peaks/react Lambda handler
 * Uses createPeakActionHandler factory — validates POST (add reaction), DELETE (remove reaction), 405
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { handler } from '../../peaks/react';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_AUTHOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
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

describe('peaks/react handler', () => {
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
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (validateUUIDParam as jest.Mock).mockReturnValue(TEST_PEAK_ID);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Peak lookup + block check on pool
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] })
      .mockResolvedValueOnce({ rows: [] });
  });

  describe('auth checks', () => {
    it('should return 401 when not authenticated', async () => {
      const authResponse = {
        statusCode: 401,
        headers: {},
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
      (requireAuth as jest.Mock).mockReturnValue(authResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation((v) => typeof v !== 'string');

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('peak lookup', () => {
    it('should return 404 when peak not found', async () => {
      mockDb.query.mockReset();
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
    });
  });

  describe('block check', () => {
    it('should return 403 when blocked', async () => {
      mockDb.query.mockReset();
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
    });
  });

  describe('POST - add reaction', () => {
    it('should return 400 for invalid reaction type', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // BEGIN

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reaction: 'invalid_emoji' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid reaction');
      expect(body.allowedReactions).toBeDefined();
    });

    it('should return 400 when no reaction provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }); // BEGIN

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({}),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should add reaction and return counts on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // upsert reaction
        .mockResolvedValueOnce({ rows: [{ reaction_type: 'fire', count: '3' }, { reaction_type: 'heart', count: '1' }] }) // reaction counts
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reaction: 'fire' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.reaction).toBe('fire');
      expect(body.reactionCounts).toBeDefined();
      expect(body.reactionCounts.fire).toBe(3);
      expect(body.reactionCounts.heart).toBe(1);
    });

    it('should accept all valid reaction types', async () => {
      const validReactions = ['fire', 'flex', 'heart', 'clap', 'mindblown', 'energy', 'trophy', 'lightning'];

      for (const reaction of validReactions) {
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
        (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
        (validateUUIDParam as jest.Mock).mockReturnValue(TEST_PEAK_ID);
        (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
        (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

        mockDb.query
          .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] })
          .mockResolvedValueOnce({ rows: [] });

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // upsert
          .mockResolvedValueOnce({ rows: [{ reaction_type: reaction, count: '1' }] }) // counts
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const event = makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ reaction }),
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.reaction).toBe(reaction);
      }
    });
  });

  describe('DELETE - remove reaction', () => {
    it('should remove reaction and return success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // DELETE FROM peak_reactions
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('Reaction removed');
    });
  });

  describe('unsupported method', () => {
    it('should return 405 for unsupported HTTP method', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({ httpMethod: 'PUT' });
      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });
  });

  describe('error handling', () => {
    it('should return 500 and rollback on error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        return Promise.reject(new Error('DB error'));
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reaction: 'fire' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
