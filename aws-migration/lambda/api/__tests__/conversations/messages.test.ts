/**
 * Tests for conversations/messages Lambda handler
 * Validates auth, rate limit, UUID validation, profile resolution, participant check,
 * pagination, cursor validation, mark-as-read, and message listing.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../conversations/messages';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_CONVERSATION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: { id: VALID_CONVERSATION_ID },
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

describe('conversations/messages handler', () => {
  let mockWriterDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockWriterDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockWriterDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Default: conversation exists and user is a participant
    mockWriterDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
        return Promise.resolve({
          rows: [{ id: VALID_CONVERSATION_ID }],
        });
      }
      // Messages query: return empty by default
      return Promise.resolve({ rows: [] });
    });
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

  // 3. Validation
  describe('input validation', () => {
    it('should return 400 when conversation ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Conversation ID is required');
    });

    it('should return 400 when conversation ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid conversation ID format');
    });
  });

  // 4. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 5. Conversation not found / not participant
  describe('conversation access', () => {
    it('should return 404 when conversation does not exist or user is not a participant', async () => {
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Conversation not found');
    });
  });

  // 6. Cursor validation
  describe('cursor validation', () => {
    it('should return 400 when cursor is not a valid date', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: 'invalid-date' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });
  });

  // 7. Happy path: empty messages
  describe('happy path — empty messages', () => {
    it('should return 200 with empty messages array', async () => {
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [{ id: VALID_CONVERSATION_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.messages).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });
  });

  // 8. Happy path: messages returned
  describe('happy path — messages returned', () => {
    it('should return 200 with messages in chronological order', async () => {
      const messages = [
        { id: 'msg-2', content: 'Hi', created_at: '2026-02-20T09:00:00Z', sender_id: VALID_PROFILE_ID, sender: {} },
        { id: 'msg-1', content: 'Hello', created_at: '2026-02-20T08:00:00Z', sender_id: 'other-id', sender: {} },
      ];
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [{ id: VALID_CONVERSATION_ID }] });
        }
        // Messages query
        return Promise.resolve({ rows: messages });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.messages).toHaveLength(2);
      // Messages should be reversed (chronological order)
      expect(body.messages[0].id).toBe('msg-1');
      expect(body.messages[1].id).toBe('msg-2');
    });
  });

  // 9. Mark as read
  describe('mark as read', () => {
    it('should update unread messages when markAsRead=true', async () => {
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [{ id: VALID_CONVERSATION_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        queryStringParameters: { markAsRead: 'true' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify writer pool was used for the UPDATE
      expect(getPool).toHaveBeenCalled();
      expect(mockWriterDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages'),
        [VALID_CONVERSATION_ID, VALID_PROFILE_ID],
      );
    });

    it('should NOT update messages when markAsRead is not set', async () => {
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [{ id: VALID_CONVERSATION_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      await handler(event);

      // Writer pool is used for strong reads, but should not perform UPDATE when markAsRead=false.
      const updateCalls = mockWriterDb.query.mock.calls.filter(([sql]) =>
        typeof sql === 'string' && sql.includes('UPDATE messages')
      );
      expect(updateCalls).toHaveLength(0);
    });
  });

  // 10. Pagination
  describe('pagination', () => {
    it('should set hasMore to true when more results exist', async () => {
      // Default limit is 50, return 51 rows
      const rows = Array.from({ length: 51 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        created_at: '2026-02-20T08:00:00Z',
        sender_id: VALID_PROFILE_ID,
        sender: {},
      }));
      mockWriterDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM conversations')) {
          return Promise.resolve({ rows: [{ id: VALID_CONVERSATION_ID }] });
        }
        return Promise.resolve({ rows });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.messages).toHaveLength(50);
      expect(body.nextCursor).toBeDefined();
    });
  });

  // 11. Error handling
  describe('error handling', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
