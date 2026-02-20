/**
 * Tests for peaks/hide Lambda handler
 * Validates POST (hide peak), DELETE (unhide peak), GET (list hidden peaks)
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
  createCorsResponse: jest.fn((statusCode: number, body: unknown) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../peaks/hide';
import { isValidUUID } from '../../utils/security';
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

describe('peaks/hide handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('auth checks', () => {
    it('should return 401 when not authenticated', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Profile not found');
    });
  });

  describe('GET - list hidden peaks', () => {
    it('should return list of hidden peaks when no peakId in path', async () => {
      const hiddenRow = {
        peak_id: TEST_PEAK_ID,
        reason: 'not_interested',
        created_at: '2026-02-08T12:00:00Z',
        thumbnail_url: 'https://cdn.example.com/thumb.jpg',
        author_id: TEST_AUTHOR_ID,
        username: 'peakauthor',
        display_name: 'Peak Author',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [hiddenRow] });

      const event = makeEvent({
        httpMethod: 'GET',
        pathParameters: {}, // no peakId
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hiddenPeaks).toHaveLength(1);
      expect(body.hiddenPeaks[0].peakId).toBe(TEST_PEAK_ID);
      expect(body.hiddenPeaks[0].reason).toBe('not_interested');
      expect(body.hiddenPeaks[0].author.username).toBe('peakauthor');
    });

    it('should return empty list when no hidden peaks', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        httpMethod: 'GET',
        pathParameters: {},
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hiddenPeaks).toEqual([]);
    });
  });

  describe('validation for POST/DELETE', () => {
    it('should return 400 when peak ID is missing (non-GET with no peakId)', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        pathParameters: {},
        body: JSON.stringify({ reason: 'not_interested' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Peak ID is required');
    });

    it('should return 400 when peak ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reason: 'not_interested' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid peak ID');
    });
  });

  describe('peak check', () => {
    it('should return 404 when peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // peak not found

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reason: 'not_interested' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });
  });

  describe('POST - hide peak', () => {
    it('should hide peak with default reason', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak exists
        .mockResolvedValueOnce({ rows: [] }); // upsert hidden

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({}), // no reason = default 'not_interested'
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.reason).toBe('not_interested');
    });

    it('should hide peak with custom reason', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reason: 'seen_too_often' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.reason).toBe('seen_too_often');
    });

    it('should return 400 for invalid reason', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ reason: 'invalid_reason' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid reason');
      expect(body.validReasons).toBeDefined();
    });

    it('should accept all valid reasons', async () => {
      const validReasons = ['not_interested', 'seen_too_often', 'irrelevant', 'other'];

      for (const reason of validReasons) {
        jest.clearAllMocks();
        mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        (getPool as jest.Mock).mockResolvedValue(mockDb);
        (isValidUUID as jest.Mock).mockReturnValue(true);
        (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);

        mockDb.query
          .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] })
          .mockResolvedValueOnce({ rows: [] });

        const event = makeEvent({
          httpMethod: 'POST',
          body: JSON.stringify({ reason }),
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }
    });
  });

  describe('DELETE - unhide peak', () => {
    it('should unhide peak successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak exists
        .mockResolvedValueOnce({ rows: [{ id: 'hidden-record-id' }] }); // DELETE RETURNING

      const event = makeEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toContain('restored');
    });

    it('should return 404 when peak was not hidden', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak exists
        .mockResolvedValueOnce({ rows: [] }); // DELETE RETURNING - nothing found

      const event = makeEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('not hidden');
    });
  });

  describe('unsupported method', () => {
    it('should return 405 for unsupported methods', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });

      const event = makeEvent({ httpMethod: 'PUT' });
      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });
  });

  describe('error handling', () => {
    it('should return 500 on unexpected error', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
    });
  });
});
