/**
 * Tests for posts/saved-list Lambda handler
 * Validates auth, profile resolution, pagination, cursor, and error handling.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { createMockDb, makeEvent, TEST_SUB, TEST_PROFILE_ID } from '../helpers';
import type { MockDb } from '../helpers';

// ── Mocks: the 4 standard blocks (db, rate-limit, logger, cors) are
//    auto-mocked by __tests__/helpers/setup.ts ──

// Domain-specific mocks
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { handler } from '../../posts/saved-list';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const AUTHOR_PROFILE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeSavedPostRow(id: string, savedAt: string) {
  return {
    id,
    author_id: AUTHOR_PROFILE_ID,
    content: `Post ${id}`,
    media_urls: [],
    media_type: 'text',
    media_meta: {},
    likes_count: 3,
    comments_count: 1,
    is_peak: false,
    created_at: '2026-02-16T12:00:00Z',
    updated_at: '2026-02-16T12:00:00Z',
    saved_at: savedAt,
    profile_id: AUTHOR_PROFILE_ID,
    author_username: 'author_user',
    author_full_name: 'Author User',
    author_avatar_url: 'https://cdn.example.com/avatar.jpg',
    author_account_type: 'personal',
    author_is_verified: false,
    author_business_name: null,
  };
}

// ── Test Suite ──

describe('posts/saved-list handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = createMockDb();
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Profile not found ──

  describe('profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 3. Cursor validation ──

  describe('cursor validation', () => {
    it('should return 400 for invalid cursor format', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: 'not-a-date' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });
  });

  // ── 4. Pagination ──

  describe('pagination', () => {
    it('should return paginated results with hasMore=true when more items exist', async () => {
      // Return limit+1 rows to indicate more
      const rows = [];
      for (let i = 0; i <= 20; i++) {
        rows.push(makeSavedPostRow(
          `post-${String(i).padStart(2, '0')}`,
          new Date(2026, 1, 16, 12, 0, 0, 0).toISOString(),
        ));
      }
      mockDb.query.mockResolvedValueOnce({ rows });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
    });

    it('should return hasMore=false when no more items', async () => {
      const rows = [
        makeSavedPostRow('post-01', '2026-02-16T12:00:00Z'),
        makeSavedPostRow('post-02', '2026-02-16T11:00:00Z'),
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('should respect custom limit parameter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });

      await handler(event);

      // The query should use limit+1 = 6
      const queryCall = mockDb.query.mock.calls[0];
      const params = queryCall[1] as (string | number)[];
      // Last param is limit+1
      expect(params.at(-1)!).toBe(6);
    });

    it('should cap limit at MAX_LIMIT (50)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      await handler(event);

      const queryCall = mockDb.query.mock.calls[0];
      const params = queryCall[1] as (string | number)[];
      // Should be capped at 50+1 = 51
      expect(params.at(-1)!).toBe(51);
    });
  });

  // ── 5. Happy path ──

  describe('successful list', () => {
    it('should return 200 with correct data shape', async () => {
      const rows = [
        makeSavedPostRow('post-01', '2026-02-16T12:00:00Z'),
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);

      const post = body.data[0];
      expect(post.id).toBe('post-01');
      expect(post.authorId).toBe(AUTHOR_PROFILE_ID);
      expect(post.content).toBeDefined();
      expect(post.savedAt).toBeDefined();
      expect(post.author).toBeDefined();
      expect(post.author.username).toBe('author_user');
      expect(post.author.fullName).toBe('Author User');
    });

    it('should return empty data array when no saved posts', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });
  });

  // ── 6. DB error ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
