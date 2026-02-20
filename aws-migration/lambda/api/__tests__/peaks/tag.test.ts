/**
 * Tests for peaks/tag Lambda handler
 * Validates GET (list tags), POST (add tag), DELETE (remove tag) with auth, rate limit, ownership
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

import { handler } from '../../peaks/tag';
import { isValidUUID } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_AUTHOR_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_FRIEND_ID = 'd4e5f6a7-b8c9-0123-def1-234567890123';

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

describe('peaks/tag handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
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

  describe('validation', () => {
    it('should return 400 when peak ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Peak ID is required');
    });

    it('should return 400 when peak ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid peak ID');
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

  describe('peak check', () => {
    it('should return 404 when peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // peak not found

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });
  });

  describe('GET - list tags', () => {
    it('should return empty tags list', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [] }); // tags

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.tags).toEqual([]);
    });

    it('should return formatted tags with user data', async () => {
      const tagRow = {
        id: 'tag-1',
        tagged_user_id: TEST_FRIEND_ID,
        tagged_by_user_id: TEST_PROFILE_ID,
        created_at: '2026-02-08T12:00:00Z',
        username: 'friend',
        display_name: 'Friend Name',
        full_name: 'Friend Full Name',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        is_verified: true,
        account_type: 'personal',
        business_name: null,
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] })
        .mockResolvedValueOnce({ rows: [tagRow] });

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0].taggedUser.username).toBe('friend');
      expect(body.tags[0].taggedUser.isVerified).toBe(true);
      expect(body.tags[0].taggedBy).toBe(TEST_PROFILE_ID);
    });
  });

  describe('POST - add tag', () => {
    it('should return 400 when friendId is missing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({}),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('friendId');
    });

    it('should return 400 when friendId is invalid UUID', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });
      (isValidUUID as jest.Mock).mockImplementation((val: string) => {
        if (val === TEST_PEAK_ID) return true;
        return false;
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ friendId: 'bad-id' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 404 when friend not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [] }); // friend not found

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ friendId: TEST_FRIEND_ID }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('User not found');
    });

    it('should return 409 when user already tagged', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_FRIEND_ID, username: 'friend', display_name: 'Friend',
            full_name: 'Friend', avatar_url: null, is_verified: false,
            account_type: 'personal', business_name: null,
          }],
        }) // friend exists
        .mockResolvedValueOnce({ rows: [{ id: 'existing-tag' }] }); // already tagged

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ friendId: TEST_FRIEND_ID }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toContain('already tagged');
    });

    it('should create tag successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_FRIEND_ID, username: 'friend', display_name: 'Friend',
            full_name: 'Friend', avatar_url: null, is_verified: false,
            account_type: 'personal', business_name: null,
          }],
        }) // friend
        .mockResolvedValueOnce({ rows: [] }) // not already tagged
        .mockResolvedValueOnce({ rows: [{ username: 'testuser', display_name: 'Test', full_name: 'Test User' }] }) // tagger info
        .mockResolvedValueOnce({ rows: [{ id: 'new-tag-id', created_at: '2026-02-08T12:00:00Z' }] }) // insert tag
        .mockResolvedValueOnce({ rows: [] }); // notification

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ friendId: TEST_FRIEND_ID }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.tag).toBeDefined();
      expect(body.tag.taggedUser.username).toBe('friend');
    });
  });

  describe('DELETE - remove tag', () => {
    it('should return 400 when tagged user ID is missing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: TEST_PEAK_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 404 when tag not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [] }); // tag not found

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: TEST_PEAK_ID, userId: TEST_FRIEND_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Tag not found');
    });

    it('should return 403 when user cannot remove tag', async () => {
      const differentUser = 'e5f6a7b8-c9d0-1234-ef12-345678901234';
      (resolveProfileId as jest.Mock).mockResolvedValue(differentUser);

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [{ tagged_by_user_id: TEST_PROFILE_ID }] }); // tag found, tagged by someone else

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: TEST_PEAK_ID, userId: TEST_FRIEND_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Not authorized');
    });

    it('should remove tag successfully when user is the tagger', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [{ tagged_by_user_id: TEST_PROFILE_ID }] }) // tag found, tagged by current user
        .mockResolvedValueOnce({ rows: [] }); // delete

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: TEST_PEAK_ID, userId: TEST_FRIEND_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
    });

    it('should allow peak author to remove any tag', async () => {
      // Current user is the peak author
      (resolveProfileId as jest.Mock).mockResolvedValue(TEST_AUTHOR_ID);

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID }] }) // peak
        .mockResolvedValueOnce({ rows: [{ tagged_by_user_id: TEST_PROFILE_ID }] }) // tag exists
        .mockResolvedValueOnce({ rows: [] }); // delete

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: TEST_PEAK_ID, userId: TEST_FRIEND_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
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
