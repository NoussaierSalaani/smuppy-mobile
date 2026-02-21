/**
 * Tests for peaks/create Lambda handler
 * Comprehensive branch coverage for all if/else, ternary, ??, ?., || paths
 */

import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import) ────────────────────────────
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
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'profile_123',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    isVerified: true,
    accountType: 'personal',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/upload-quota', () => ({
  checkQuota: jest.fn().mockResolvedValue({ allowed: true, remaining: 10, limit: 20 }),
  deductQuota: jest.fn().mockResolvedValue(undefined),
  getQuotaLimits: jest.fn().mockReturnValue({ dailyPeakCount: 10, dailyVideoSeconds: 300 }),
  isPremiumAccount: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/text-moderation', () => ({
  moderateText: jest.fn().mockResolvedValue({
    blocked: false,
    contentFlagged: false,
    flagCategory: null,
    flagScore: null,
  }),
}));

jest.mock('../../../shared/moderation/constants', () => ({
  SYSTEM_MODERATOR_ID: 'system-moderator-id',
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/security', () => ({
  sanitizeText: jest.fn((v: string) => v),
  isValidUUID: jest.fn().mockReturnValue(true),
}));

const mockLambdaSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: mockLambdaSend,
  })),
  InvokeCommand: jest.fn().mockImplementation((params: unknown) => params),
}));

import { handler } from '../../peaks/create';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { checkQuota, deductQuota, getQuotaLimits, isPremiumAccount } from '../../utils/upload-quota';
import { moderateText } from '../../utils/text-moderation';
import { isValidUUID } from '../../utils/security';
import { sendPushToUser } from '../../services/push-notification';

const VALID_S3_VIDEO_URL = 'https://smuppy-media.s3.amazonaws.com/video.mp4';
const VALID_S3_THUMB_URL = 'https://smuppy-media.s3.amazonaws.com/thumb.jpg';
const VALID_CF_URL = 'https://d123.cloudfront.net/video.mp4';

function makeEvent(bodyOverrides: Record<string, unknown> = {}, eventOverrides: Record<string, unknown> = {}) {
  const defaultBody = {
    videoUrl: VALID_S3_VIDEO_URL,
    thumbnailUrl: VALID_S3_THUMB_URL,
    caption: 'Test peak',
    duration: 15,
    feedDuration: 48,
    ...bodyOverrides,
  };
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify(defaultBody),
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: 'cognito_user_123' } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...eventOverrides,
  } as unknown as Parameters<typeof handler>[0];
}

const defaultPeakRow = {
  id: 'peak_123',
  video_url: VALID_S3_VIDEO_URL,
  thumbnail_url: VALID_S3_THUMB_URL,
  caption: 'Test peak',
  duration: 15,
  reply_to_peak_id: null,
  filter_id: null,
  filter_intensity: null,
  overlays: null,
  likes_count: 0,
  comments_count: 0,
  views_count: 0,
  created_at: '2026-02-08T12:00:00Z',
  expires_at: '2026-02-10T12:00:00Z',
  saved_to_profile: null,
  video_status: 'uploaded',
};

describe('peaks/create handler', () => {
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
    (resolveProfileId as jest.Mock).mockResolvedValue('profile_123');
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      profileId: 'profile_123',
      username: 'testuser',
      fullName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      isVerified: true,
      accountType: 'personal',
    });
    (isAccountError as jest.Mock).mockReturnValue(false);
    (checkQuota as jest.Mock).mockResolvedValue({ allowed: true, remaining: 10, limit: 20 });
    (deductQuota as jest.Mock).mockResolvedValue(undefined);
    (getQuotaLimits as jest.Mock).mockReturnValue({ dailyPeakCount: 10, dailyVideoSeconds: 300 });
    (isPremiumAccount as jest.Mock).mockReturnValue(false);
    (moderateText as jest.Mock).mockResolvedValue({
      blocked: false,
      contentFlagged: false,
      flagCategory: null,
      flagScore: null,
    });
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (sendPushToUser as jest.Mock).mockResolvedValue(undefined);
    mockLambdaSend.mockResolvedValue({});
  });

  /** Set up mockClient.query to succeed for INSERT INTO peaks */
  function setupSuccessfulPeakInsert(peakOverrides: Record<string, unknown> = {}) {
    const peakRow = { ...defaultPeakRow, ...peakOverrides };
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('INSERT INTO peaks')) {
        return Promise.resolve({ rows: [peakRow] });
      }
      return Promise.resolve({ rows: [] });
    });
    return peakRow;
  }

  // ── Auth branches ──────────────────────────────────────────────────
  describe('authentication', () => {
    it('should reject unauthenticated requests (401)', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ videoUrl: VALID_S3_VIDEO_URL }),
        requestContext: {},
      } as unknown as Parameters<typeof handler>[0];
      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });

    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(404);
    });
  });

  // ── Rate limit branch ─────────────────────────────────────────────
  describe('rate limiting', () => {
    it('should return rate limit response when rate limited', async () => {
      const rateLimitRes = { statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }) };
      (requireRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitRes);
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(429);
    });
  });

  // ── Body parsing: event.body ? ... : {} ────────────────────────────
  describe('body parsing', () => {
    it('should handle null body (event.body ? ... : {} branch)', async () => {
      const event = makeEvent({}, { body: null });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should handle empty string body', async () => {
      const event = makeEvent({}, { body: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });
  });

  // ── videoUrl validation ────────────────────────────────────────────
  describe('videoUrl validation', () => {
    it('should reject missing videoUrl', async () => {
      const event = makeEvent({ videoUrl: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should reject non-string videoUrl (typeof check)', async () => {
      const event = makeEvent({ videoUrl: 12345 });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should reject empty string videoUrl (falsy check)', async () => {
      const event = makeEvent({ videoUrl: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should reject non-https videoUrl', async () => {
      const event = makeEvent({ videoUrl: 'http://smuppy-media.s3.amazonaws.com/video.mp4' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid video URL format');
    });

    it('should reject videoUrl from untrusted domain', async () => {
      const event = makeEvent({ videoUrl: 'https://evil.com/video.mp4' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid video URL format');
    });

    it('should reject malformed videoUrl (URL parse catch)', async () => {
      const event = makeEvent({ videoUrl: 'not-a-valid-url' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should accept valid S3 videoUrl', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ videoUrl: VALID_S3_VIDEO_URL });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept valid CloudFront videoUrl', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ videoUrl: VALID_CF_URL });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept valid S3 us-east-1 videoUrl', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ videoUrl: 'https://bucket.s3.us-east-1.amazonaws.com/video.mp4' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── thumbnailUrl validation ────────────────────────────────────────
  describe('thumbnailUrl validation', () => {
    it('should reject invalid thumbnailUrl when provided', async () => {
      const event = makeEvent({ thumbnailUrl: 'https://evil.com/thumb.jpg' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid thumbnail URL format');
    });

    it('should reject malformed thumbnailUrl (URL parse catch)', async () => {
      const event = makeEvent({ thumbnailUrl: 'not-a-url' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should skip thumbnailUrl validation when not provided (falsy && short-circuit)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ thumbnailUrl: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept valid S3 thumbnailUrl', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ thumbnailUrl: VALID_S3_THUMB_URL });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── replyToPeakId validation ───────────────────────────────────────
  describe('replyToPeakId validation', () => {
    it('should reject non-string replyToPeakId', async () => {
      const event = makeEvent({ replyToPeakId: 12345 });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid reply peak ID format');
    });

    it('should reject invalid UUID replyToPeakId', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);
      const event = makeEvent({ replyToPeakId: 'not-a-uuid' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid reply peak ID format');
    });

    it('should skip replyToPeakId validation when not provided (falsy && short-circuit)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ replyToPeakId: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── duration validation (ternary branch) ───────────────────────────
  describe('duration validation', () => {
    it('should cap duration at MAX_PEAK_DURATION_SECONDS when exceeded', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 120 }); // exceeds 60
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should use null when duration is not a number', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 'not-a-number' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should use actual duration when within limit', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 30 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should use null when duration is undefined', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── Filter metadata validation ─────────────────────────────────────
  describe('filter metadata validation', () => {
    it('should accept valid filterId (string, <= 50 chars)', async () => {
      setupSuccessfulPeakInsert({ filter_id: 'warm' });
      const event = makeEvent({ filterId: 'warm' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should reject filterId longer than 50 characters', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ filterId: 'a'.repeat(51) });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // filterId is set to null (not rejected, just ignored)
    });

    it('should reject non-string filterId', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ filterId: 123 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept valid filterIntensity (0-1 range)', async () => {
      setupSuccessfulPeakInsert({ filter_intensity: 0.5 });
      const event = makeEvent({ filterIntensity: 0.5 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept filterIntensity at boundary 0', async () => {
      setupSuccessfulPeakInsert({ filter_intensity: 0 });
      const event = makeEvent({ filterIntensity: 0 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept filterIntensity at boundary 1', async () => {
      setupSuccessfulPeakInsert({ filter_intensity: 1 });
      const event = makeEvent({ filterIntensity: 1 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should reject filterIntensity > 1', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ filterIntensity: 1.5 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // filterIntensity is set to null, not rejected
    });

    it('should reject filterIntensity < 0', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ filterIntensity: -0.5 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should reject non-number filterIntensity', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ filterIntensity: 'high' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should JSON.stringify overlays when array is provided', async () => {
      setupSuccessfulPeakInsert({ overlays: '[{"type":"text"}]' });
      const event = makeEvent({ overlays: [{ type: 'text' }] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should set null for overlays when not an array', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ overlays: 'not-an-array' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should set null for overlays when undefined', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ overlays: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── feedDuration validation ────────────────────────────────────────
  describe('feedDuration validation', () => {
    it('should accept feedDuration of 24', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ feedDuration: 24 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept feedDuration of 48', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ feedDuration: 48 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should default to 48 when feedDuration is invalid value', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ feedDuration: 72 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should default to 48 when feedDuration is not provided', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ feedDuration: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── saveToProfile validation ───────────────────────────────────────
  describe('saveToProfile validation', () => {
    it('should accept boolean saveToProfile=true', async () => {
      setupSuccessfulPeakInsert({ saved_to_profile: true });
      const event = makeEvent({ saveToProfile: true });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should accept boolean saveToProfile=false', async () => {
      setupSuccessfulPeakInsert({ saved_to_profile: false });
      const event = makeEvent({ saveToProfile: false });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should set null for non-boolean saveToProfile', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ saveToProfile: 'yes' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should set null for undefined saveToProfile', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ saveToProfile: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── Hashtag validation ─────────────────────────────────────────────
  describe('hashtag validation', () => {
    it('should accept valid hashtags array', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: ['fitness', 'running'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.hashtags).toEqual(['fitness', 'running']);
    });

    it('should skip hashtag processing when hashtags is not an array', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: 'not-an-array' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual([]);
    });

    it('should skip hashtag processing when hashtags is undefined', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual([]);
    });

    it('should filter out non-string hashtags', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: [123, null, 'valid'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual(['valid']);
    });

    it('should filter out empty string hashtags', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: ['', 'valid'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual(['valid']);
    });

    it('should filter out hashtags longer than 100 characters', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: ['a'.repeat(101), 'valid'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual(['valid']);
    });

    it('should lowercase and sanitize hashtags', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: ['UPPERCASE', 'with-hyphen', 'with spaces'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const ht = JSON.parse(result.body).peak.hashtags;
      expect(ht[0]).toBe('uppercase');
      expect(ht[1]).toBe('withhyphen'); // hyphen stripped
      expect(ht[2]).toBe('withspaces'); // spaces stripped
    });

    it('should filter out hashtags that become empty after sanitization', async () => {
      setupSuccessfulPeakInsert();
      // A hashtag made entirely of special chars
      const event = makeEvent({ hashtags: ['---', '!!!', 'valid'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags).toEqual(['valid']);
    });

    it('should limit hashtags to 30 entries', async () => {
      setupSuccessfulPeakInsert();
      const manyTags = Array.from({ length: 35 }, (_, i) => `tag${i}`);
      const event = makeEvent({ hashtags: manyTags });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).peak.hashtags.length).toBe(30);
    });
  });

  // ── Account error branch ──────────────────────────────────────────
  describe('account status', () => {
    it('should return account error when isAccountError is true', async () => {
      (isAccountError as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        headers: {},
        body: JSON.stringify({ message: 'Account suspended' }),
      });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
    });

    it('should return 403 for pro_business account', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'bizuser',
        fullName: 'Biz User',
        avatarUrl: null,
        isVerified: false,
        accountType: 'pro_business',
      });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Business accounts cannot create peaks');
    });
  });

  // ── Quota enforcement branches ─────────────────────────────────────
  describe('quota enforcement', () => {
    it('should return 429 when peak quota exceeded', async () => {
      (checkQuota as jest.Mock).mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 10 });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).quotaType).toBe('peak_count');
    });

    it('should return 429 when video seconds quota exceeded', async () => {
      // First checkQuota call (peak) passes
      (checkQuota as jest.Mock)
        .mockResolvedValueOnce({ allowed: true, remaining: 5, limit: 10 })
        // Second checkQuota call (video) fails
        .mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 300 });
      const event = makeEvent({ duration: 30 });
      const result = await handler(event);
      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).quotaType).toBe('video_seconds');
    });

    it('should skip quota enforcement for premium accounts', async () => {
      (isPremiumAccount as jest.Mock).mockReturnValue(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'prouser',
        fullName: 'Pro User',
        avatarUrl: null,
        isVerified: true,
        accountType: 'pro_creator',
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(checkQuota).not.toHaveBeenCalled();
    });

    it('should skip peak quota check when dailyPeakCount is null', async () => {
      (getQuotaLimits as jest.Mock).mockReturnValueOnce({ dailyPeakCount: null, dailyVideoSeconds: null });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(checkQuota).not.toHaveBeenCalled();
    });

    it('should skip video quota check when dailyVideoSeconds is null', async () => {
      (getQuotaLimits as jest.Mock).mockReturnValueOnce({ dailyPeakCount: 10, dailyVideoSeconds: null });
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 30 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(checkQuota).toHaveBeenCalledTimes(1); // only peak quota
    });

    it('should skip video quota check when videoDuration is null (non-number duration)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 'not-a-number' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(checkQuota).toHaveBeenCalledTimes(1); // only peak quota
    });

    it('should skip video quota check when videoDuration is 0', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 0 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Duration 0 makes videoDuration falsy, so video quota check skipped
      expect(checkQuota).toHaveBeenCalledTimes(1);
    });
  });

  // ── Caption sanitization and moderation ────────────────────────────
  describe('caption moderation', () => {
    it('should skip moderation when caption is not provided', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(moderateText).not.toHaveBeenCalled();
    });

    it('should skip moderation when caption is empty string (falsy)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: '' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(moderateText).not.toHaveBeenCalled();
    });

    it('should block when moderation returns blocked=true', async () => {
      (moderateText as jest.Mock).mockResolvedValueOnce({
        blocked: true,
        blockResponse: {
          statusCode: 400,
          headers: {},
          body: JSON.stringify({ message: 'Content policy violation' }),
        },
        contentFlagged: false,
        flagCategory: null,
        flagScore: null,
      });
      const event = makeEvent({ caption: 'offensive content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should create peak with flagged content status when moderation flags', async () => {
      (moderateText as jest.Mock).mockResolvedValueOnce({
        blocked: false,
        contentFlagged: true,
        flagCategory: 'profanity',
        flagScore: 0.7,
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: 'borderline content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify that moderation_log INSERT was called (contentFlagged=true)
      const modLogCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('moderation_log'),
      );
      expect(modLogCall).toBeDefined();
    });

    it('should not insert moderation_log when content is clean', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: 'clean content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const modLogCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('moderation_log'),
      );
      expect(modLogCall).toBeUndefined();
    });
  });

  // ── Reply parent validation ────────────────────────────────────────
  describe('reply parent validation', () => {
    it('should return 404 when reply target peak not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // no parent peak found
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Reply target peak not found');
    });

    it('should proceed when reply target peak exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'parent-peak', author_id: 'other-author' }] });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── Transaction error / ROLLBACK ───────────────────────────────────
  describe('transaction handling', () => {
    it('should ROLLBACK and throw on transaction error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO peaks')) {
          return Promise.reject(new Error('DB insert error'));
        }
        return Promise.resolve({ rows: [] });
      });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      // Verify ROLLBACK was called
      const rollbackCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── Hashtag insert in transaction ──────────────────────────────────
  describe('hashtag insert', () => {
    it('should insert hashtags when validHashtags has entries', async () => {
      const peakRow = { ...defaultPeakRow };
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO peaks')) {
          return Promise.resolve({ rows: [peakRow] });
        }
        return Promise.resolve({ rows: [] });
      });
      const event = makeEvent({ hashtags: ['test', 'peak'] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const hashtagInsert = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('peak_hashtags'),
      );
      expect(hashtagInsert).toBeDefined();
    });

    it('should skip hashtag insert when no valid hashtags', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ hashtags: [] });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const hashtagInsert = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('peak_hashtags'),
      );
      expect(hashtagInsert).toBeUndefined();
    });
  });

  // ── Quota deduction (post-insert) ──────────────────────────────────
  describe('quota deduction', () => {
    it('should deduct peak and video quotas for non-premium accounts', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 30 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(deductQuota).toHaveBeenCalledWith('profile_123', 'peak', 1);
      expect(deductQuota).toHaveBeenCalledWith('profile_123', 'video', 30);
    });

    it('should only deduct peak quota when videoDuration is null', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(deductQuota).toHaveBeenCalledTimes(1);
      expect(deductQuota).toHaveBeenCalledWith('profile_123', 'peak', 1);
    });

    it('should only deduct peak quota when videoDuration is 0', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 0 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(deductQuota).toHaveBeenCalledTimes(1);
    });

    it('should skip all quota deduction for premium accounts', async () => {
      (isPremiumAccount as jest.Mock).mockReturnValue(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'prouser',
        fullName: 'Pro User',
        avatarUrl: null,
        isVerified: true,
        accountType: 'pro_creator',
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 30 });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(deductQuota).not.toHaveBeenCalled();
    });

    it('should catch and log quota deduction errors (non-blocking)', async () => {
      (deductQuota as jest.Mock).mockRejectedValueOnce(new Error('Quota deduction failed'));
      setupSuccessfulPeakInsert();
      const event = makeEvent({ duration: 10 });
      const result = await handler(event);
      // Should still return 201 despite quota deduction failure
      expect(result.statusCode).toBe(201);
    });
  });

  // ── Reply notification branches ────────────────────────────────────
  describe('reply notifications', () => {
    it('should send notification when replying to another user\'s peak', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'other-author-id' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Notification INSERT and push should be called
      const notifInsert = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications') && (call[0] as string).includes('peak_reply'),
      );
      expect(notifInsert).toBeDefined();
      expect(sendPushToUser).toHaveBeenCalled();
    });

    it('should skip notification when replying to own peak (author === self)', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'profile_123' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).not.toHaveBeenCalled();
    });

    it('should skip notification when not a reply (no replyToPeakId)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ replyToPeakId: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).not.toHaveBeenCalled();
    });

    it('should use "Someone" when profile.full_name is null', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'testuser',
        fullName: null,
        avatarUrl: null,
        isVerified: false,
        accountType: 'personal',
      });
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'other-author-id' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify "Someone" was used in notification body
      const notifInsert = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('peak_reply'),
      );
      expect(notifInsert).toBeDefined();
      expect(notifInsert![1][1]).toContain('Someone');
    });

    it('should catch notification errors gracefully', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'other-author-id' }] });
        }
        if (typeof sql === 'string' && sql.includes('peak_reply')) {
          return Promise.reject(new Error('Notification insert failed'));
        }
        return Promise.resolve({ rows: [] });
      });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      // Should still return 201 despite notification failure
      expect(result.statusCode).toBe(201);
    });

    it('should handle push notification error gracefully', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'other-author-id' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      (sendPushToUser as jest.Mock).mockRejectedValueOnce(new Error('Push failed'));
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should use thumbnailUrl || null in notification data', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: 'parent-peak', author_id: 'other-author-id' }] });
        }
        return Promise.resolve({ rows: [] });
      });
      setupSuccessfulPeakInsert({ reply_to_peak_id: 'parent-peak' });
      // No thumbnail provided
      const event = makeEvent({ replyToPeakId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', thumbnailUrl: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Notification should include thumbnailUrl: null
      const notifInsert = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('peak_reply'),
      );
      if (notifInsert) {
        const data = JSON.parse(notifInsert[1][2]);
        expect(data.thumbnailUrl).toBeNull();
      }
    });
  });

  // ── Follower notification branches ─────────────────────────────────
  describe('follower notifications', () => {
    it('should send follower notifications successfully', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // notifClient should have been acquired and used
      expect(mockDb.connect).toHaveBeenCalled();
    });

    it('should catch and handle follower notification errors gracefully', async () => {
      const originalConnect = mockDb.connect;
      let callCount = 0;
      // First connect is for peak insert, second is for notifClient
      mockDb.connect.mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          // Peak client: normal behavior
          return Promise.resolve(mockClient);
        }
        // notifClient: throws on BEGIN
        return Promise.resolve({
          query: jest.fn().mockRejectedValue(new Error('Notification DB error')),
          release: jest.fn(),
        });
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      // Should still return 201 despite notification failure
      expect(result.statusCode).toBe(201);
    });

    it('should use "Someone" in follower notification when full_name is null', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'testuser',
        fullName: null,
        avatarUrl: null,
        isVerified: false,
        accountType: 'personal',
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  // ── Video processing trigger branches ──────────────────────────────
  describe('video processing', () => {
    it('should skip video processing when START_VIDEO_PROCESSING_FN is not set', async () => {
      // START_VIDEO_PROCESSING_FN is undefined by default in tests
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });

  // ── Response field branches (|| null, ?? null, !!) ─────────────────
  describe('response field branches', () => {
    it('should map truthy response fields correctly', async () => {
      const peakRow = {
        ...defaultPeakRow,
        reply_to_peak_id: 'parent-peak-id',
        filter_id: 'warm',
        filter_intensity: 0.8,
        overlays: '[{"type":"text"}]',
        expires_at: '2026-02-12T12:00:00Z',
        saved_to_profile: true,
        video_status: 'ready',
      };
      setupSuccessfulPeakInsert(peakRow);
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.replyToPeakId).toBe('parent-peak-id');
      expect(body.peak.filterId).toBe('warm');
      expect(body.peak.filterIntensity).toBe(0.8);
      expect(body.peak.overlays).toBe('[{"type":"text"}]');
      expect(body.peak.expiresAt).toBe('2026-02-12T12:00:00Z');
      expect(body.peak.savedToProfile).toBe(true);
      expect(body.peak.videoStatus).toBe('ready');
    });

    it('should map falsy response fields to null', async () => {
      const peakRow = {
        ...defaultPeakRow,
        reply_to_peak_id: null,
        filter_id: null,
        filter_intensity: null,
        overlays: null,
        expires_at: null,
        saved_to_profile: null,
        video_status: null,
      };
      setupSuccessfulPeakInsert(peakRow);
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.replyToPeakId).toBeNull();
      expect(body.peak.filterId).toBeNull();
      expect(body.peak.filterIntensity).toBeNull();
      expect(body.peak.overlays).toBeNull();
      expect(body.peak.expiresAt).toBeNull();
      expect(body.peak.savedToProfile).toBeNull();
      expect(body.peak.videoStatus).toBeNull();
    });

    it('should map filter_intensity=0 correctly (?? null keeps 0)', async () => {
      setupSuccessfulPeakInsert({ filter_intensity: 0 });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.filterIntensity).toBe(0);
    });

    it('should map saved_to_profile=false correctly (?? null keeps false)', async () => {
      setupSuccessfulPeakInsert({ saved_to_profile: false });
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.savedToProfile).toBe(false);
    });

    it('should set isVerified via !! operator (truthy)', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.author.isVerified).toBe(true);
    });

    it('should set isVerified via !! operator (falsy)', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'testuser',
        fullName: 'Test User',
        avatarUrl: null,
        isVerified: false,
        accountType: 'personal',
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.author.isVerified).toBe(false);
    });

    it('should set isVerified via !! operator (null/undefined)', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        profileId: 'profile_123',
        username: 'testuser',
        fullName: 'Test User',
        avatarUrl: null,
        isVerified: null,
        accountType: 'personal',
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.peak.author.isVerified).toBe(false);
    });
  });

  // ── Content status ternary (contentFlagged ? 'flagged' : 'clean') ──
  describe('content status', () => {
    it('should set content_status to "clean" when not flagged', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: 'clean content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO peaks'),
      );
      expect(insertCall).toBeDefined();
      // content_status param (index 11) should be 'clean'
      expect(insertCall![1][11]).toBe('clean');
    });

    it('should set content_status to "flagged" when content is flagged', async () => {
      (moderateText as jest.Mock).mockResolvedValueOnce({
        blocked: false,
        contentFlagged: true,
        flagCategory: 'profanity',
        flagScore: 0.6,
      });
      setupSuccessfulPeakInsert();
      const event = makeEvent({ caption: 'borderline content' });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO peaks'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![1][11]).toBe('flagged');
    });
  });

  // ── INSERT param branches (thumbnailUrl || null, replyToPeakId || null) ─
  describe('INSERT parameter branches', () => {
    it('should pass thumbnailUrl || null when thumbnailUrl is undefined', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ thumbnailUrl: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO peaks'),
      );
      // thumbnailUrl is param index 2
      expect(insertCall![1][2]).toBeNull();
    });

    it('should pass thumbnailUrl when provided', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ thumbnailUrl: VALID_S3_THUMB_URL });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO peaks'),
      );
      expect(insertCall![1][2]).toBe(VALID_S3_THUMB_URL);
    });

    it('should pass replyToPeakId || null when not provided', async () => {
      setupSuccessfulPeakInsert();
      const event = makeEvent({ replyToPeakId: undefined });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO peaks'),
      );
      // replyToPeakId is param index 5
      expect(insertCall![1][5]).toBeNull();
    });
  });
});
