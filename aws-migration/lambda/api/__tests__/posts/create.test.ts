/**
 * Tests for posts/create Lambda handler
 * Covers: auth, validation, happy path, moderation, DB errors, input security
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

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://smuppy-media.s3.amazonaws.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/upload-quota', () => ({
  checkQuota: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, limit: 20 }),
  deductQuota: jest.fn().mockResolvedValue(undefined),
  getQuotaLimits: jest.fn().mockReturnValue({
    dailyVideoSeconds: 60,
    maxVideoSeconds: 60,
    maxVideoSizeBytes: 50 * 1024 * 1024,
    dailyPhotoCount: 10,
    dailyPeakCount: 10,
    videoRenditions: 1,
  }),
  isPremiumAccount: jest.fn().mockReturnValue(false),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, filtered: '', violations: [] }),
}));

jest.mock('../../../shared/moderation/constants', () => ({
  SYSTEM_MODERATOR_ID: 'system-moderator-id',
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  InvokeCommand: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
}));

import { handler } from '../../posts/create';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { isPremiumAccount, checkQuota, deductQuota } from '../../utils/upload-quota';

// ── Helpers ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_COGNITO_SUB = 'cognito-sub-abc123';
const VALID_S3_URL = 'https://smuppy-media.s3.amazonaws.com/uploads/image1.jpg';
const VALID_CLOUDFRONT_URL = 'https://d123abc.cloudfront.net/uploads/image2.jpg';

function makeEvent(overrides: Partial<{
  body: string | null;
  cognitoSub: string | null;
}>): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body !== undefined ? overrides.body : JSON.stringify({
      content: 'Hello world',
      mediaUrls: [VALID_S3_URL],
      mediaType: 'image',
      visibility: 'public',
    }),
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.cognitoSub !== null
        ? { claims: { sub: overrides.cognitoSub ?? VALID_COGNITO_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('posts/create handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_USER_ID);

    // Default: account status returns an active personal account
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      profileId: VALID_USER_ID,
      username: 'testuser',
      fullName: 'Test User',
      avatarUrl: 'https://smuppy-media.s3.amazonaws.com/avatar.jpg',
      isVerified: false,
      accountType: 'personal',
      businessName: null,
      moderationStatus: 'active',
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);
    (isPremiumAccount as jest.Mock).mockReturnValue(false);
  });

  // ── 1. Auth ────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should return 401 when no Cognito sub is present', async () => {
      const event = makeEvent({ cognitoSub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer is missing entirely', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ content: 'Hello' }),
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  // ── 2. Validation ─────────────────────────────────────────────────────

  describe('validation', () => {
    it('should return 400 when neither content nor media is provided', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Content or media is required');
    });

    it('should return 400 when content is empty string and no media', async () => {
      const event = makeEvent({ body: JSON.stringify({ content: '   ' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Content or media is required');
    });

    it('should return 400 for invalid visibility value', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          visibility: 'invalid_visibility',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid visibility value');
    });

    it('should return 400 for invalid media type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaType: 'audio',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid media type');
    });

    it('should return 400 when more than 10 media URLs are provided', async () => {
      const urls = Array.from({ length: 11 }, (_, i) =>
        `https://smuppy-media.s3.amazonaws.com/uploads/image${i}.jpg`
      );
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: urls,
          mediaType: 'multiple',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Maximum 10 media files');
    });

    it('should return 400 for invalid request body (not JSON)', async () => {
      const event = makeEvent({ body: 'not valid json {{{' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid request body');
    });

    it('should return 400 for media URLs pointing to untrusted domains', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: ['https://evil-site.com/malware.jpg'],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Media URLs must point to our CDN');
    });

    it('should accept media URLs from allowed S3 domains', async () => {
      // Setup DB mocks for the happy path beyond validation
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: [VALID_S3_URL],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });

    it('should accept media URLs from allowed CloudFront domains', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: [VALID_CLOUDFRONT_URL],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });
  });

  // ── 3. Happy Path ─────────────────────────────────────────────────────

  describe('successful post creation', () => {
    it('should return 201 with post data on success', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello world!',
          mediaUrls: [VALID_S3_URL],
          mediaType: 'image',
          visibility: 'public',
          location: 'Paris, France',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
      expect(body.authorId).toBe(VALID_USER_ID);
      expect(body.content).toBe('Hello world!');
      expect(body.mediaUrls).toEqual([VALID_S3_URL]);
      expect(body.mediaType).toBe('image');
      expect(body.visibility).toBe('public');
      expect(body.location).toBe('Paris, France');
      expect(body.likesCount).toBe(0);
      expect(body.commentsCount).toBe(0);
      expect(body.isSaved).toBe(false);
      expect(body.author).toBeDefined();
      expect(body.author.username).toBe('testuser');
    });

    it('should create a post with only content (no media)', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({ content: 'Text-only post' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.content).toBe('Text-only post');
    });

    it('should create a post with only media (no content)', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          mediaUrls: [VALID_S3_URL],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });

    it('should use a database transaction (BEGIN/COMMIT)', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({ content: 'Transactional post' }),
      });

      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 409 for duplicate content within 1 hour', async () => {
      // Duplicate check returns a match
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('md5(content)')) {
          return Promise.resolve({ rows: [{ id: 'existing-post-id' }] });
        }
        // account_type query
        if (typeof sql === 'string' && sql.includes('account_type')) {
          return Promise.resolve({ rows: [{ account_type: 'personal' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Duplicate content' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toContain('Duplicate content');
    });
  });

  // ── 4. Content Moderation ─────────────────────────────────────────────

  describe('content moderation', () => {
    it('should call filterText on content', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({ content: 'Some text to moderate' }),
      });

      await handler(event);

      expect(filterText).toHaveBeenCalledWith('Some text to moderate');
    });

    it('should call analyzeTextToxicity on content', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({ content: 'Some text to analyze' }),
      });

      await handler(event);

      expect(analyzeTextToxicity).toHaveBeenCalledWith('Some text to analyze');
    });

    it('should return 400 when text filter detects critical severity', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        severity: 'critical',
        filtered: '',
        violations: ['hate_speech'],
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hateful content' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when text filter detects high severity', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        severity: 'high',
        filtered: '',
        violations: ['harassment'],
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Harassing content' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when Comprehend toxicity blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [],
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Toxic content' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should allow content when toxicity action is flag (creates post but flags it)', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'flag',
        maxScore: 0.7,
        topCategory: 'INSULT',
        categories: [],
      });

      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({ content: 'Borderline content' }),
      });

      const result = await handler(event);

      // Flagged content should still be created (201) but marked as flagged
      expect(result.statusCode).toBe(201);

      // Verify the INSERT used 'flagged' content_status
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO posts')
      );
      expect(insertCall).toBeDefined();
      const params = insertCall![1] as unknown[];
      // content_status is param $8 (index 7)
      expect(params[7]).toBe('flagged');
    });
  });

  // ── 5. Database Errors ────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when getPool() throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal server error');
    });

    it('should return 500 when INSERT query fails', async () => {
      // Duplicate check passes, account_type query passes
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('md5(content)')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('account_type')) {
          return Promise.resolve({ rows: [{ account_type: 'personal' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Transaction INSERT throws
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO posts')) {
          return Promise.reject(new Error('Insert failed'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      // Should have attempted ROLLBACK
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello' }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 6. Input Security ─────────────────────────────────────────────────

  describe('input security', () => {
    it('should strip HTML tags from content', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: '<script>alert("xss")</script>Hello <b>world</b>',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      // Content should be sanitized — HTML tags stripped
      expect(body.content).not.toContain('<script>');
      expect(body.content).not.toContain('<b>');
    });

    it('should strip control characters from content', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello\x00\x01\x02World',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.content).not.toMatch(/[\x00-\x1F\x7F]/);
    });

    it('should truncate content to MAX_POST_CONTENT_LENGTH (5000 chars)', async () => {
      setupHappyPathMocks();

      const longContent = 'A'.repeat(6000);
      const event = makeEvent({
        body: JSON.stringify({ content: longContent }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.content.length).toBeLessThanOrEqual(5000);
    });

    it('should strip HTML tags from location', async () => {
      setupHappyPathMocks();

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          location: '<img src=x onerror=alert(1)>Paris',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.location).not.toContain('<img');
    });

    it('should return 400 for media URL exceeding max length', async () => {
      const longUrl = 'https://smuppy-media.s3.amazonaws.com/' + 'a'.repeat(2100);
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: [longUrl],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid media URL');
    });

    it('should return 400 for empty string in media URLs array', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrls: [''],
          mediaType: 'image',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid media URL');
    });
  });

  // ── 7. Account-Type Visibility Restrictions ───────────────────────────

  describe('account-type visibility restrictions', () => {
    it('should return 403 when non-creator uses subscribers visibility', async () => {
      // Account type is personal (default), not pro_creator
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('md5(content)')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'personal' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Subscribers only post',
          visibility: 'subscribers',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('creator account');
    });

    it('should return 403 when business account uses non-public visibility', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('md5(content)')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
          return Promise.resolve({ rows: [{ account_type: 'pro_business' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      (isPremiumAccount as jest.Mock).mockReturnValue(true);

      const event = makeEvent({
        body: JSON.stringify({
          content: 'Private business post',
          visibility: 'private',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Business accounts');
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Sets up mock implementations for a successful post creation flow:
   * - duplicate check returns no rows
   * - account_type query returns personal
   * - transaction INSERT returns the post row
   * - author query returns profile data
   */
  function setupHappyPathMocks() {
    const postRow = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      author_id: VALID_USER_ID,
      content: '', // Will be overridden per-call
      media_urls: [],
      media_type: null,
      visibility: 'public',
      location: null,
      likes_count: 0,
      comments_count: 0,
      video_status: null,
      created_at: '2026-02-16T12:00:00Z',
    };

    const authorRow = {
      id: VALID_USER_ID,
      username: 'testuser',
      full_name: 'Test User',
      avatar_url: 'https://smuppy-media.s3.amazonaws.com/avatar.jpg',
      is_verified: false,
      account_type: 'personal',
      business_name: null,
    };

    // mockDb.query handles: duplicate check, account_type check, moderation_log, author fetch
    mockDb.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('md5(content)')) {
        return Promise.resolve({ rows: [] }); // no duplicate
      }
      if (typeof sql === 'string' && sql.includes('account_type FROM profiles')) {
        return Promise.resolve({ rows: [{ account_type: 'personal' }] });
      }
      if (typeof sql === 'string' && sql.includes('moderation_log')) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('username, full_name')) {
        return Promise.resolve({ rows: [authorRow] });
      }
      return Promise.resolve({ rows: [] });
    });

    // mockClient.query handles: BEGIN, INSERT INTO posts, COMMIT
    mockClient.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO posts')) {
        // Reflect back the sanitized content and media from params
        const row = {
          ...postRow,
          content: params ? params[2] : '',
          media_urls: params ? params[3] : [],
          media_type: params ? params[4] : null,
          visibility: params ? params[5] : 'public',
          location: params ? params[6] : null,
          video_status: params ? params[10] : null,
        };
        return Promise.resolve({ rows: [row] });
      }
      return Promise.resolve({ rows: [] });
    });
  }
});
