/**
 * Tests for peaks/get Lambda handler
 * Validates single peak retrieval, auth, UUID validation, expiration, and block logic
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import) ──────────────────────────

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
    'Cache-Control': 'private, max-age=60',
  })),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn(),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../peaks/get';
import { extractCognitoSub } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
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

const PEAK_ROW = {
  id: TEST_PEAK_ID,
  author_id: 'author-id-123',
  video_url: 'https://cdn.example.com/video.mp4',
  thumbnail_url: 'https://cdn.example.com/thumb.jpg',
  caption: 'Test peak caption',
  duration: 15,
  reply_to_peak_id: null,
  likes_count: 5,
  comments_count: 2,
  views_count: 100,
  created_at: '2026-02-08T12:00:00Z',
  expires_at: '2026-02-10T12:00:00Z',
  saved_to_profile: null,
  filter_id: null,
  filter_intensity: null,
  overlays: null,
  video_status: 'ready',
  hls_url: null,
  video_variants: null,
  author_username: 'testauthor',
  author_full_name: 'Test Author',
  author_avatar_url: 'https://cdn.example.com/avatar.jpg',
  author_is_verified: false,
  author_account_type: 'personal',
  author_business_name: null,
  challenge_id: null,
  challenge_title: null,
  challenge_rules: null,
  challenge_status: null,
  challenge_response_count: null,
  is_liked: false,
  is_viewed: false,
};

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/get handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
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
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid peak ID format');
    });
  });

  describe('authenticated user', () => {
    it('should return 200 with peak data for authenticated user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [PEAK_ROW] });
      // Fire-and-forget view insert
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak).toBeDefined();
      expect(body.peak.id).toBe(TEST_PEAK_ID);
      expect(body.peak.videoUrl).toBe(PEAK_ROW.video_url);
      expect(body.peak.caption).toBe(PEAK_ROW.caption);
      expect(body.peak.author.id).toBe(PEAK_ROW.author_id);
      expect(body.peak.author.username).toBe(PEAK_ROW.author_username);
    });

    it('should return 404 when peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });

    it('should include isLiked and isViewed for authenticated user', async () => {
      const likedPeak = { ...PEAK_ROW, is_liked: true, is_viewed: true };
      mockDb.query.mockResolvedValueOnce({ rows: [likedPeak] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.isLiked).toBe(true);
      expect(body.peak.isViewed).toBe(true);
    });

    it('should include challenge data when present', async () => {
      const peakWithChallenge = {
        ...PEAK_ROW,
        challenge_id: 'challenge-uuid-123',
        challenge_title: 'Dance Challenge',
        challenge_rules: 'Dance for 15 seconds',
        challenge_status: 'active',
        challenge_response_count: 42,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [peakWithChallenge] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.challenge).toBeDefined();
      expect(body.peak.challenge.id).toBe('challenge-uuid-123');
      expect(body.peak.challenge.title).toBe('Dance Challenge');
    });
  });

  describe('unauthenticated user', () => {
    it('should return 200 with peak data without isLiked/isViewed', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      mockDb.query.mockResolvedValueOnce({ rows: [PEAK_ROW] });

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.isLiked).toBe(false);
      expect(body.peak.isViewed).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 404 when profile not found (resolveProfileId returns null)', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      // With null profile, the query uses unauthenticated path and returns 404
      expect(result.statusCode).toBe(404);
    });
  });

  describe('additional coverage - expired peak', () => {
    it('should return peak data for expired peak when saved_to_profile is true', async () => {
      const savedExpiredPeak = {
        ...PEAK_ROW,
        expires_at: '2025-01-01T00:00:00Z', // in the past
        saved_to_profile: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [savedExpiredPeak] });

      const event = makeEvent();
      const result = await handler(event);

      // Handler returns the peak because saved_to_profile=true bypasses expiration
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.id).toBe(TEST_PEAK_ID);
    });

    it('should include filter data when peak has filter applied', async () => {
      const filteredPeak = {
        ...PEAK_ROW,
        filter_id: 'sunset-glow',
        filter_intensity: 0.8,
        overlays: JSON.stringify([{ type: 'text', content: 'Hello' }]),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [filteredPeak] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.filterId).toBe('sunset-glow');
      expect(body.peak.filterIntensity).toBe(0.8);
    });

    it('should return 400 when pathParameters has no id key', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await handler(event);

      // pathParameters?.id is undefined, handler returns 400 "Peak ID is required"
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Peak ID is required');
    });
  });

  describe('additional coverage - video variants', () => {
    it('should include HLS URL and video variants when present', async () => {
      const hlsPeak = {
        ...PEAK_ROW,
        hls_url: 'https://cdn.example.com/video/master.m3u8',
        video_variants: JSON.stringify([
          { width: 1080, url: 'https://cdn.example.com/video/1080.mp4' },
        ]),
      };
      mockDb.query.mockResolvedValueOnce({ rows: [hlsPeak] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.peak.hlsUrl).toBe('https://cdn.example.com/video/master.m3u8');
    });
  });
});
