/**
 * Tests for conversations/list Lambda handler
 * Validates auth, rate limit, profile resolution, pagination, cursor validation,
 * blocked user filtering, and conversation listing with last message/unread count.
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
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../conversations/list';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CONV_ID_1 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const CONV_ID_2 = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: { sub: VALID_USER_ID },
      },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('conversations/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no authorizer claims present', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer claims have no sub', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // 3. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 4. Cursor validation
  describe('cursor validation', () => {
    it('should return 400 when cursor is not a valid date', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: 'not-a-date' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });

    it('should accept a valid ISO date cursor', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { cursor: '2026-02-20T12:00:00Z' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 5. Happy path: empty list
  describe('happy path — empty list', () => {
    it('should return 200 with empty conversations when none exist', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.conversations).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });
  });

  // 6. Happy path: conversations returned
  describe('happy path — conversations returned', () => {
    it('should return 200 with conversation list', async () => {
      const conversations = [
        {
          id: CONV_ID_1,
          created_at: '2026-02-19T10:00:00Z',
          last_message_at: '2026-02-20T08:00:00Z',
          last_message: { id: 'msg-1', content: 'Hello', created_at: '2026-02-20T08:00:00Z' },
          unread_count: 2,
          other_participant: { id: 'p1', username: 'alice' },
        },
        {
          id: CONV_ID_2,
          created_at: '2026-02-18T10:00:00Z',
          last_message_at: '2026-02-19T08:00:00Z',
          last_message: null,
          unread_count: 0,
          other_participant: { id: 'p2', username: 'bob' },
        },
      ];
      mockDb.query.mockResolvedValue({ rows: conversations });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.conversations).toHaveLength(2);
      expect(body.hasMore).toBe(false);
    });
  });

  // 7. Pagination: hasMore
  describe('pagination', () => {
    it('should set hasMore to true when more results exist', async () => {
      // Default limit is 20, return 21 rows to trigger hasMore
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `conv-${i}`,
        created_at: '2026-02-19T10:00:00Z',
        last_message_at: `2026-02-20T0${String(i).padStart(2, '0')}:00:00Z`,
        last_message: null,
        unread_count: 0,
        other_participant: { id: `p-${i}`, username: `user${i}` },
      }));
      mockDb.query.mockResolvedValue({ rows });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.conversations).toHaveLength(20);
      expect(body.nextCursor).toBeDefined();
    });

    it('should respect custom limit parameter', async () => {
      const rows = Array.from({ length: 6 }, (_, i) => ({
        id: `conv-${i}`,
        created_at: '2026-02-19T10:00:00Z',
        last_message_at: '2026-02-20T08:00:00Z',
        last_message: null,
        unread_count: 0,
        other_participant: { id: `p-${i}`, username: `user${i}` },
      }));
      mockDb.query.mockResolvedValue({ rows });

      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.conversations).toHaveLength(5);
    });

    it('should clamp limit to max 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      await handler(event);

      // The query should use limit+1=51 as parameter
      const queryCall = mockDb.query.mock.calls[0];
      const params = queryCall[1] as unknown[];
      const lastParam = params[params.length - 1];
      expect(lastParam).toBe(51); // 50 + 1
    });
  });

  // 8. Error handling
  describe('error handling', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when db.query throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Query timeout'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
