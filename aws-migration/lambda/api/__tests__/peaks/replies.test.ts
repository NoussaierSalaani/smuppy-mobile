/**
 * Tests for peaks/replies Lambda handler
 * Validates GET (list replies) and POST (create reply) with auth, rate limit, validation
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

import { handler } from '../../peaks/replies';
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

describe('peaks/replies handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  describe('auth checks', () => {
    it('should return 401 when not authenticated', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
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

  describe('parent peak check', () => {
    it('should return 404 when parent peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // peak not found

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });
  });

  describe('GET - list replies', () => {
    it('should return empty list when no replies exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
        }) // parent peak
        .mockResolvedValueOnce({ rows: [] }); // replies query

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.replies).toEqual([]);
      expect(body.hasMore).toBe(false);
    });

    it('should return formatted replies with author data', async () => {
      const replyRow = {
        id: 'reply-1',
        author_id: TEST_PROFILE_ID,
        video_url: 'https://cdn.example.com/reply.mp4',
        thumbnail_url: 'https://cdn.example.com/reply-thumb.jpg',
        caption: 'Reply caption',
        likes_count: 3,
        comments_count: 1,
        views_count: 50,
        peak_replies_count: 0,
        duration: 10,
        created_at: '2026-02-08T12:00:00Z',
        filter_id: null,
        filter_intensity: null,
        overlays: null,
        profile_id: TEST_PROFILE_ID,
        username: 'replier',
        display_name: 'Replier Name',
        full_name: 'Replier Full Name',
        avatar_url: 'https://cdn.example.com/avatar.jpg',
        is_verified: false,
        account_type: 'personal',
        business_name: null,
        is_liked: false,
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
        })
        .mockResolvedValueOnce({ rows: [replyRow] });

      const event = makeEvent({ httpMethod: 'GET' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.replies).toHaveLength(1);
      expect(body.replies[0].id).toBe('reply-1');
      expect(body.replies[0].author.username).toBe('replier');
    });
  });

  describe('POST - create reply', () => {
    it('should return 403 when peak responses are disabled', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: false, visibility: 'public' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('responses are disabled');
    });

    it('should return 403 when peak is private and user is not author', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'private' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('private');
    });

    it('should return 400 when video URL is missing', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ duration: 10 }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should return 400 when video URL is not HTTPS', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'http://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('HTTPS');
    });

    it('should return 400 when video URL is from disallowed domain', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://evil.com/video.mp4',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('allowed CDN domain');
    });

    it('should return 400 when duration is missing', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('duration');
    });

    it('should create reply successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
        }) // parent peak
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            username: 'testuser',
            display_name: 'Test User',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
          }],
        }); // author re-fetch after commit

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'new-reply-id', created_at: '2026-02-08T12:00:00Z' }],
        }) // INSERT reply
        .mockResolvedValueOnce({ rows: [] }) // UPDATE peak_replies_count
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            username: 'testuser',
            display_name: 'Test User',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
            business_name: null,
          }],
        }) // author query in tx for notification
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          thumbnailUrl: 'https://smuppy-media.s3.amazonaws.com/thumb.jpg',
          caption: 'My reply',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.reply).toBeDefined();
      expect(body.reply.replyToPeakId).toBe(TEST_PEAK_ID);
    });

    it('should return 429 when rate limited (POST only)', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
        }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  describe('unsupported method', () => {
    it('should return 405 for unsupported methods', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PEAK_ID, author_id: TEST_AUTHOR_ID, allow_peak_responses: true, visibility: 'public' }],
      });

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
