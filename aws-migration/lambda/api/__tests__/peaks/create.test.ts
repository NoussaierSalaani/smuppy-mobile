/**
 * Tests for peaks/create Lambda - Critical bug fix validation
 * Ensures peaks creation works with expires_at and saved_to_profile columns
 */

import { handler } from '../../peaks/create';
import { getPool } from '../../../shared/db';
import { checkRateLimit } from '../../utils/rate-limit';

// Mocks
jest.mock('../../../shared/db');
jest.mock('../../utils/rate-limit');
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

describe('peaks/create handler - critical bug fix', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true });
  });

  describe('peak creation with required columns', () => {
    it('should create peak with expires_at and saved_to_profile columns', async () => {
      // Setup profile lookup
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'profile_123',
            username: 'testuser',
            full_name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
            is_verified: true,
            account_type: 'personal',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'peak_123',
            video_url: 'https://cdn.smuppy.com/video.mp4',
            thumbnail_url: 'https://cdn.smuppy.com/thumb.jpg',
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
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // notifications

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://cdn.smuppy.com/video.mp4',
          thumbnailUrl: 'https://cdn.smuppy.com/thumb.jpg',
          caption: 'Test peak',
          duration: 15,
          feedDuration: 48,
          saveToProfile: null,
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body).success).toBe(true);

      // CRITICAL: Must insert with expires_at and saved_to_profile
      const insertCall = mockDb.query.mock.calls.find(
        (call: any[]) => call[0].includes('INSERT INTO peaks')
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[0]).toContain('expires_at');
      expect(insertCall[0]).toContain('saved_to_profile');
    });

    it('should handle feedDuration of 24 hours', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'profile_123',
            username: 'testuser',
            full_name: 'Test User',
            avatar_url: null,
            is_verified: false,
            account_type: 'personal',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'peak_123',
            video_url: 'https://cdn.smuppy.com/video.mp4',
            thumbnail_url: null,
            caption: null,
            duration: 10,
            likes_count: 0,
            comments_count: 0,
            views_count: 0,
            created_at: '2026-02-08T12:00:00Z',
            expires_at: '2026-02-09T12:00:00Z',
            saved_to_profile: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://cdn.smuppy.com/video.mp4',
          duration: 10,
          feedDuration: 24,
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

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
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Video URL is required');
    });

    it('should reject unauthenticated requests', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          videoUrl: 'https://cdn.smuppy.com/video.mp4',
          duration: 10,
        }),
        requestContext: {},
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });
  });
});
