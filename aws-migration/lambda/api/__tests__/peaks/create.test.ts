/**
 * Tests for peaks/create Lambda - Critical bug fix validation
 * Ensures peaks creation works with expires_at and saved_to_profile columns
 */

import { getPool } from '../../../shared/db';

// Mocks — must be before handler import (Jest hoists jest.mock calls)
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
  getQuotaLimits: jest.fn().mockReturnValue({ daily: 20, maxDuration: 120 }),
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

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  InvokeCommand: jest.fn(),
}));

import { handler } from '../../peaks/create';

describe('peaks/create handler - critical bug fix', () => {
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
  });

  describe('peak creation with required columns', () => {
    it('should create peak with expires_at and saved_to_profile columns', async () => {
      // The handler uses db.connect() for transactions, not db.query() for the INSERT.
      // mockClient.query handles: BEGIN, INSERT INTO peaks, COMMIT, and notification queries.
      const peakRow = {
        id: 'peak_123',
        video_url: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
        thumbnail_url: 'https://smuppy-media.s3.amazonaws.com/thumb.jpg',
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

      // mockClient handles transaction queries (BEGIN, INSERT, COMMIT, notifications)
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO peaks')) {
          return Promise.resolve({ rows: [peakRow] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          thumbnailUrl: 'https://smuppy-media.s3.amazonaws.com/thumb.jpg',
          caption: 'Test peak',
          duration: 15,
          feedDuration: 48,
          saveToProfile: null,
        }),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).success).toBe(true);

      // CRITICAL: Must insert with expires_at and saved_to_profile
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO peaks')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall![0]).toContain('expires_at');
      expect(insertCall![0]).toContain('saved_to_profile');
    });

    it('should handle feedDuration of 24 hours', async () => {
      const peakRow = {
        id: 'peak_123',
        video_url: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
        thumbnail_url: null,
        caption: null,
        duration: 10,
        reply_to_peak_id: null,
        filter_id: null,
        filter_intensity: null,
        overlays: null,
        likes_count: 0,
        comments_count: 0,
        views_count: 0,
        created_at: '2026-02-08T12:00:00Z',
        expires_at: '2026-02-09T12:00:00Z',
        saved_to_profile: null,
        video_status: 'uploaded',
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO peaks')) {
          return Promise.resolve({ rows: [peakRow] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
          feedDuration: 24,
        }),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });
  });

  describe('validation', () => {
    it('should reject missing videoUrl', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          duration: 10,
        }),
        requestContext: {
          requestId: 'test-request-id',
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
          identity: { sourceIp: '127.0.0.1' },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should reject unauthenticated requests', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://smuppy-media.s3.amazonaws.com/video.mp4',
          duration: 10,
        }),
        requestContext: {},
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });
});
