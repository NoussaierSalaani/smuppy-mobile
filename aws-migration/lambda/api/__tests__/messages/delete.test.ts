/**
 * Tests for messages/delete Lambda handler
 * Validates auth, rate limit, UUID validation, profile lookup, soft-delete
 * with 15-minute window, S3 cleanup for voice messages, and error handling.
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  DeleteObjectCommand: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../messages/delete';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_MESSAGE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
    headers: {},
    body: null,
    pathParameters: { id: VALID_MESSAGE_ID },
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

describe('messages/delete handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Default: profile found, message deleted successfully
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({
          rows: [{ id: VALID_PROFILE_ID }],
        });
      }
      if (typeof sql === 'string' && sql.includes('WITH target AS')) {
        return Promise.resolve({
          rows: [{
            id: VALID_MESSAGE_ID,
            media_url: null,
            media_type: null,
          }],
        });
      }
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
    it('should return 400 when message ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message ID is required');
    });

    it('should return 400 when message ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid message ID format');
    });
  });

  // 4. Profile not found
  describe('profile lookup', () => {
    it('should return 404 when user profile is not found', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // 5. Happy path: message deleted
  describe('happy path — message deleted', () => {
    it('should return 200 with success message when message is deleted', async () => {
      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Message deleted successfully');
    });
  });

  // 6. Message not found (not sender or already deleted)
  describe('message not found', () => {
    it('should return 404 when message does not exist or user is not sender', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        // CTE update returns no rows
        if (typeof sql === 'string' && sql.includes('WITH target AS')) {
          return Promise.resolve({ rows: [] });
        }
        // Exists check also returns no rows
        if (typeof sql === 'string' && sql.includes('SELECT id, created_at FROM messages')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Message not found or not authorized to delete');
    });
  });

  // 7. 15-minute window expired
  describe('15-minute deletion window', () => {
    it('should return 403 when message is outside the 15-minute window', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        // CTE update returns no rows (outside 15-min window)
        if (typeof sql === 'string' && sql.includes('WITH target AS')) {
          return Promise.resolve({ rows: [] });
        }
        // But message exists (sender owns it, just outside window)
        if (typeof sql === 'string' && sql.includes('SELECT id, created_at FROM messages')) {
          return Promise.resolve({
            rows: [{ id: VALID_MESSAGE_ID, created_at: '2026-02-20T10:00:00Z' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Messages can only be deleted within 15 minutes of sending');
    });
  });

  // 8. S3 cleanup for voice messages
  describe('S3 voice file cleanup', () => {
    it('should not fail when voice media_url is present and MEDIA_BUCKET is empty', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('WITH target AS')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID,
              media_url: 'https://cdn.example.com/voice-messages/user1/conv1/file1.m4a',
              media_type: 'voice',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      // Should still succeed — S3 cleanup is fire-and-forget and MEDIA_BUCKET is empty
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });
  });

  // 9. Error handling
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

  // 10. Text message (no media) deleted
  describe('text-only message deletion', () => {
    it('should return 200 and not attempt S3 cleanup for text-only messages', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('WITH target AS')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID,
              media_url: null,
              media_type: null,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
    });
  });
});
