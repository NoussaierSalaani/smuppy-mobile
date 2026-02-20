/**
 * Tests for comments/create Lambda handler
 * Validates auth, input validation, moderation, block checks, and DB interactions
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
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
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

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, violations: [], severity: 'none' }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

jest.mock('../../../shared/moderation/constants', () => ({
  SYSTEM_MODERATOR_ID: '00000000-0000-0000-0000-000000000000',
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../comments/create';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_POST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_COMMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const POST_AUTHOR_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ text: 'Great post!' }),
    pathParameters: { id: VALID_POST_ID },
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

describe('comments/create handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);

    // Default: post exists with a different author (triggers notification path)
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM posts')) {
        return Promise.resolve({
          rows: [{ id: VALID_POST_ID, author_id: POST_AUTHOR_ID }],
        });
      }
      // Block check: no blocks by default
      if (typeof sql === 'string' && sql.includes('blocked_users')) {
        return Promise.resolve({ rows: [] });
      }
      // Parent comment check: not needed by default
      if (typeof sql === 'string' && sql.includes('SELECT id FROM comments')) {
        return Promise.resolve({ rows: [{ id: VALID_COMMENT_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: transaction queries succeed
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO comments')) {
        return Promise.resolve({
          rows: [{
            id: VALID_COMMENT_ID,
            text: 'Great post!',
            parent_comment_id: null,
            created_at: '2026-02-16T12:00:00Z',
            updated_at: '2026-02-16T12:00:00Z',
          }],
        });
      }
      // Dupe check: no duplicates
      if (typeof sql === 'string' && sql.includes('SELECT id FROM comments')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. Auth: reject unauthenticated requests (401)
  // ─────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────
  // 2. Validation: reject empty/missing content
  // ─────────────────────────────────────────────────────────────────────
  describe('input validation — text content', () => {
    it('should return 400 when text is missing from body', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });

    it('should return 400 when text is an empty string', async () => {
      const event = makeEvent({ body: JSON.stringify({ text: '' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });

    it('should return 400 when text is only whitespace', async () => {
      const event = makeEvent({ body: JSON.stringify({ text: '   ' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });

    it('should return 400 when text is not a string', async () => {
      const event = makeEvent({ body: JSON.stringify({ text: 12345 }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });

    it('should return 400 when body is null', async () => {
      const event = makeEvent({ body: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Happy path: successful comment creation (201)
  // ─────────────────────────────────────────────────────────────────────
  describe('happy path — successful creation', () => {
    it('should return 201 with comment data on success', async () => {
      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.comment).toBeDefined();
      expect(body.comment.id).toBe(VALID_COMMENT_ID);
      expect(body.comment.text).toBe('Great post!');
      expect(body.comment.parentCommentId).toBeNull();
      expect(body.comment.createdAt).toBe('2026-02-16T12:00:00Z');
      expect(body.comment.updatedAt).toBe('2026-02-16T12:00:00Z');
    });

    it('should include author profile data in the response', async () => {
      const event = makeEvent();

      const result = await handler(event);
      const body = JSON.parse(result.body);

      expect(body.comment.author).toBeDefined();
      expect(body.comment.author.id).toBe(VALID_PROFILE_ID);
      expect(body.comment.author.username).toBe('testuser');
      expect(body.comment.author.fullName).toBe('Test User');
      expect(body.comment.author.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(body.comment.author.isVerified).toBe(false);
      expect(body.comment.author.accountType).toBe('personal');
      expect(body.comment.author.businessName).toBeNull();
    });

    it('should use a transaction (BEGIN/COMMIT) for the insert', async () => {
      const event = makeEvent();

      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should release the client after a successful transaction', async () => {
      const event = makeEvent();

      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should create a notification for the post author when not self-commenting', async () => {
      const event = makeEvent();

      await handler(event);

      // Notification INSERT should include the post author ID
      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeDefined();
      expect(notifCall![1]).toContain(POST_AUTHOR_ID);
    });

    it('should NOT create a notification when commenting on own post', async () => {
      // Make the post author the same as the commenting profile
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM posts')) {
          return Promise.resolve({
            rows: [{ id: VALID_POST_ID, author_id: VALID_PROFILE_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      await handler(event);

      const notifCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications'),
      );
      expect(notifCall).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Validation: reject invalid postId format
  // ─────────────────────────────────────────────────────────────────────
  describe('input validation — postId (path parameter)', () => {
    it('should return 400 when postId is not a valid UUID', async () => {
      const event = makeEvent({
        pathParameters: { id: 'not-a-uuid' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid post ID format');
    });

    it('should return 400 when postId path parameter is missing', async () => {
      const event = makeEvent({
        pathParameters: {},
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Post ID is required');
    });

    it('should return 400 when pathParameters is null', async () => {
      const event = makeEvent({
        pathParameters: null,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Post ID is required');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Error: post not found (404)
  // ─────────────────────────────────────────────────────────────────────
  describe('post not found', () => {
    it('should return 404 when the post does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM posts')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Post not found');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. Error: database errors (500)
  // ─────────────────────────────────────────────────────────────────────
  describe('database errors', () => {
    it('should return 500 when db.query throws on post lookup', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when db.connect throws', async () => {
      // Post exists, but connect fails
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM posts')) {
          return Promise.resolve({
            rows: [{ id: VALID_POST_ID, author_id: POST_AUTHOR_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
      mockDb.connect.mockRejectedValue(new Error('Pool exhausted'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when INSERT throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO comments')) {
          return Promise.reject(new Error('Unique constraint violation'));
        }
        // Dupe check passes
        if (typeof sql === 'string' && sql.includes('SELECT id FROM comments')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Additional edge cases
  // ─────────────────────────────────────────────────────────────────────
  describe('rate limiting', () => {
    it('should return 429 when per-minute rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce({
          statusCode: 429,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
        });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });

    it('should return 429 when daily rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce(null)   // per-minute passes
        .mockResolvedValueOnce({
          statusCode: 429,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
        });  // daily limit fails

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  describe('content moderation', () => {
    it('should return 400 when text filter detects critical content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate_speech'],
        severity: 'critical',
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when Comprehend blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [{ name: 'HATE_SPEECH', score: 0.95 }],
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });
  });

  describe('block check', () => {
    it('should return 403 when bidirectional block exists', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM posts')) {
          return Promise.resolve({
            rows: [{ id: VALID_POST_ID, author_id: POST_AUTHOR_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] }); // Block found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Action not allowed');
    });
  });

  describe('duplicate comment detection', () => {
    it('should return 409 when a duplicate comment is detected', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        // Dupe check finds existing comment
        if (typeof sql === 'string' && sql.includes('SELECT id FROM comments')) {
          return Promise.resolve({ rows: [{ id: VALID_COMMENT_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toBe('Duplicate comment');
    });
  });

  describe('invalid parentCommentId', () => {
    it('should return 400 when parentCommentId is not a valid UUID', async () => {
      const event = makeEvent({
        body: JSON.stringify({ text: 'Nice!', parentCommentId: 'bad-id' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid parent comment ID format');
    });
  });
});
