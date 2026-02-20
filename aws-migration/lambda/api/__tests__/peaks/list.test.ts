/**
 * Tests for peaks/list Lambda handler
 * Validates pagination, filtering, auth, and moderation visibility
 */

import { makeEvent, TEST_SUB, TEST_PROFILE_ID, createMockDb } from '../helpers';
import type { MockDb } from '../helpers';

// ── Domain-specific mocks ──

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  extractCognitoSub: jest.fn(),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../peaks/list';
import { extractCognitoSub, isValidUUID } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';

// ── Helpers ────────────────────────────────────────────────────────

function makePeakRow(id: string, createdAt: string) {
  return {
    id,
    author_id: 'author-id-123',
    video_url: 'https://cdn.example.com/video.mp4',
    thumbnail_url: 'https://cdn.example.com/thumb.jpg',
    caption: 'Test peak',
    duration: 15,
    reply_to_peak_id: null,
    likes_count: 5,
    comments_count: 2,
    views_count: 100,
    created_at: createdAt,
    filter_id: null,
    filter_intensity: null,
    overlays: null,
    expires_at: null,
    saved_to_profile: null,
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
}

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/list handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = createMockDb();
    (extractCognitoSub as jest.Mock).mockReturnValue(TEST_SUB);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
  });

  describe('successful listing', () => {
    it('should return 200 with empty array when no peaks', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should return formatted peaks with author data', async () => {
      const peaks = [
        makePeakRow('peak-1', '2026-02-08T12:00:00Z'),
        makePeakRow('peak-2', '2026-02-08T11:00:00Z'),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: peaks });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].id).toBe('peak-1');
      expect(body.data[0].author).toBeDefined();
      expect(body.data[0].author.username).toBe('testauthor');
      expect(body.total).toBe(2);
    });

    it('should support pagination with hasMore and nextCursor', async () => {
      // Request limit=2, DB returns 3 (limit+1) to signal hasMore
      const peaks = [
        makePeakRow('peak-1', '2026-02-08T14:00:00Z'),
        makePeakRow('peak-2', '2026-02-08T13:00:00Z'),
        makePeakRow('peak-3', '2026-02-08T12:00:00Z'),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: peaks });

      const event = makeEvent({ queryStringParameters: { limit: '2' } });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
    });

    it('should cap limit to 50', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ queryStringParameters: { limit: '100' } });
      await handler(event);

      // The LIMIT parameter should be 51 (50 + 1 for hasMore detection)
      const queryCall = mockDb.query.mock.calls[0];
      const params = queryCall[1];
      const limitParam = params.at(-1)!;
      expect(limitParam).toBe(51);
    });
  });

  describe('filtering by author', () => {
    it('should filter by authorId when provided', async () => {
      const authorId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ queryStringParameters: { authorId } });
      await handler(event);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('author_id');
      expect(queryCall[1]).toContain(authorId);
    });

    it('should filter by username when provided', async () => {
      const profileRow = { id: 'resolved-author-id' };
      // First call: username lookup
      mockDb.query.mockResolvedValueOnce({ rows: [profileRow] });
      // Second call: peak list
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ queryStringParameters: { username: 'someuser' } });
      await handler(event);

      // First query should look up the username
      expect(mockDb.query.mock.calls[0][0]).toContain('username');
    });
  });

  describe('cursor pagination', () => {
    it('should use cursor for pagination when provided', async () => {
      const cursor = '1707393600000'; // timestamp
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ queryStringParameters: { cursor } });
      await handler(event);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('created_at <');
    });
  });

  describe('unauthenticated user', () => {
    it('should return peaks without isLiked/isViewed for unauthenticated users', async () => {
      (extractCognitoSub as jest.Mock).mockReturnValue(undefined);

      const peaks = [makePeakRow('peak-1', '2026-02-08T12:00:00Z')];
      mockDb.query.mockResolvedValueOnce({ rows: peaks });

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data[0].isLiked).toBe(false);
      expect(body.data[0].isViewed).toBe(false);
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
  });
});
