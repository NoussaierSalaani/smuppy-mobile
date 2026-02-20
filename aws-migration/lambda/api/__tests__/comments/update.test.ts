/**
 * Tests for comments/update Lambda handler
 * Standalone handler — updates comment text (author only), includes moderation.
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeText: jest.fn((text: string) => text.replace(/<[^>]*>/g, '').trim()),
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
  RATE_WINDOW_5_MIN: 300,
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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../comments/update';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { isValidUUID } from '../../utils/security';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const COMMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const OTHER_PROFILE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const NOW = '2026-02-19T12:00:00Z';

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'PUT',
    headers: {},
    body: overrides.body as string ?? JSON.stringify({ text: 'Updated comment text' }),
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: COMMENT_ID },
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

// ── Test suite ──

describe('comments/update handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);

    // Reset account-status mocks to default (non-error) on every test
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      profileId: TEST_PROFILE_ID,
      username: 'testuser',
      moderationStatus: 'active',
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);

    // Default: profile exists, comment exists and belongs to user, update succeeds
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, user_id FROM comments')) {
        return Promise.resolve({
          rows: [{ id: COMMENT_ID, user_id: TEST_PROFILE_ID }],
        });
      }
      if (typeof sql === 'string' && sql.includes('UPDATE comments')) {
        return Promise.resolve({
          rows: [{
            id: COMMENT_ID,
            text: 'Updated comment text',
            created_at: NOW,
            updated_at: NOW,
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer has no sub', async () => {
      const event = {
        ...makeEvent(),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });

  // ── 2. Input validation ──

  describe('input validation', () => {
    it('should return 400 when comment ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment ID is required');
    });

    it('should return 400 when comment ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid comment ID format');
    });

    it('should return 400 when text is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });

    it('should return 400 when text is empty', async () => {
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
      const event = { ...makeEvent(), body: null } as unknown as APIGatewayProxyEvent;
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Comment text is required');
    });
  });

  // ── 3. Not found ──

  describe('not found', () => {
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

    it('should return 404 when comment does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, user_id FROM comments')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Comment not found');
    });
  });

  // ── 4. Authorization ──

  describe('authorization', () => {
    it('should return 403 when user is not the comment author', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, user_id FROM comments')) {
          return Promise.resolve({
            rows: [{ id: COMMENT_ID, user_id: OTHER_PROFILE_ID }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Not authorized to update this comment');
    });
  });

  // ── 5. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 6. Content moderation ──

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
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should return 400 when text filter detects high severity content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['harassment'],
        severity: 'high',
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should return 400 when toxicity analysis blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [{ name: 'HATE_SPEECH', score: 0.95 }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should allow content when filter result is low severity', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['mild_language'],
        severity: 'low',
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── 7. Account status ──

  describe('account status', () => {
    it('should return 403 when account is suspended', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValue({
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Account suspended' }),
      });
      (isAccountError as unknown as jest.Mock).mockReturnValue(true);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
    });
  });

  // ── 8. Happy path ──

  describe('happy path', () => {
    it('should return 200 with updated comment on success', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.comment).toBeDefined();
      expect(body.comment.id).toBe(COMMENT_ID);
      expect(body.comment.text).toBe('Updated comment text');
      expect(body.comment.createdAt).toBe(NOW);
      expect(body.comment.updatedAt).toBe(NOW);
    });
  });

  // ── 9. Database errors ──

  describe('database errors', () => {
    it('should return 500 when db.query throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Pool exhausted'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
