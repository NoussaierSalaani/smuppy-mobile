/**
 * Tests for challenges/list Lambda handler
 * Validates rate limit, filter validation, cursor validation, pagination, and DB interactions
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

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
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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
  cors: jest.fn((r: unknown) => r),
  handleOptions: jest.fn(() => ({ statusCode: 200, body: '' })),
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../challenges/list';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (e: APIGatewayProxyEvent) => (handler as any)(e) as any;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: {},
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: VALID_USER_ID } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

function makeChallengeRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    peak_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    title: 'Test Challenge',
    description: 'Test desc',
    duration_seconds: 60,
    ends_at: null,
    is_public: true,
    has_prize: false,
    prize_description: null,
    tips_enabled: false,
    total_tips: '0',
    response_count: 5,
    view_count: 100,
    status: 'active',
    created_at: '2026-02-20T12:00:00Z',
    challenge_type_name: null,
    challenge_type_slug: null,
    challenge_type_icon: null,
    challenge_type_category: null,
    peak_video_url: 'https://cdn.example.com/video.mp4',
    peak_thumbnail_url: 'https://cdn.example.com/thumb.jpg',
    creator_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    creator_username: 'creator1',
    creator_display_name: 'Creator One',
    creator_avatar: 'https://cdn.example.com/avatar.jpg',
    creator_verified: true,
    ...extra,
  };
}

// ── Test suite ──

describe('challenges/list handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);
    // Reset resolveProfileId fully to clear any unconsumed mockResolvedValueOnce
    (resolveProfileId as jest.Mock).mockReset().mockResolvedValue(VALID_PROFILE_ID);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);

    // Default: main query returns some challenge rows
    mockClient.query.mockResolvedValue({ rows: [makeChallengeRow('d4e5f6a7-b8c9-0123-defa-234567890123')] });
  });

  // 1. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 2. Invalid creatorId format
  describe('creatorId validation', () => {
    it('should return 400 when creatorId is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({
        queryStringParameters: { creatorId: 'not-valid' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid creator ID format');
    });
  });

  // 3. Invalid cursor format
  describe('cursor validation', () => {
    it('should return 400 when cursor is invalid date for non-trending filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'new', cursor: 'not-a-date' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });

    it('should allow numeric cursor for trending filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'trending', cursor: '20' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('trending');
    });
  });

  // 4. Happy path - trending (default)
  describe('happy path - trending filter', () => {
    it('should return 200 with challenges list', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.filter).toBe('trending');
      expect(body.challenges).toBeDefined();
      expect(Array.isArray(body.challenges)).toBe(true);
    });

    it('should include pagination data', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.limit).toBe(20);
      expect(typeof body.pagination.hasMore).toBe('boolean');
    });

    it('should include category filter when provided', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'trending', category: 'dance' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('trending');
    });

    it('should compute trending nextCursor as offset string', async () => {
      // Return 21 rows to trigger hasMore
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`));
      }
      mockClient.query.mockResolvedValue({ rows });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextCursor).toBe('20');
    });

    it('should return null nextCursor when offset exceeds MAX_OFFSET', async () => {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`));
      }
      mockClient.query.mockResolvedValue({ rows });

      // Cursor near the MAX_OFFSET limit (500)
      const event = makeEvent({
        queryStringParameters: { filter: 'trending', cursor: '490' },
      });

      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      // 490 + 20 = 510 > 500 => null
      expect(body.pagination.nextCursor).toBeNull();
    });
  });

  // 5. Filter: new
  describe('new filter', () => {
    it('should use new filter when specified', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'new' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.filter).toBe('new');
    });

    it('should apply cursor and category in new filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'new', cursor: '2026-02-20T12:00:00Z', category: 'dance' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('new');
    });

    it('should compute nextCursor from last row created_at for new filter', async () => {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`, {
          created_at: `2026-02-${String(20 - i).padStart(2, '0')}T12:00:00Z`,
        }));
      }
      mockClient.query.mockResolvedValue({ rows });

      const event = makeEvent({ queryStringParameters: { filter: 'new' } });
      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextCursor).toBeTruthy();
    });
  });

  // 6. Fallback for invalid filter
  describe('invalid filter value', () => {
    it('should default to trending for unknown filter values', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'unknown_filter' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.filter).toBe('trending');
    });
  });

  // 7. Pagination hasMore
  describe('pagination', () => {
    it('should set hasMore=true when more rows than limit', async () => {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`));
      }
      mockClient.query.mockResolvedValue({ rows });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.challenges.length).toBe(20);
    });
  });

  // 8. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('DB error'));
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should release client after error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('DB error'));
      });

      await invoke(makeEvent());

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 9. OPTIONS
  describe('OPTIONS request', () => {
    it('should return 200 for OPTIONS', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 10. Limit parameter
  describe('limit parameter', () => {
    it('should respect custom limit parameter', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });

      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.limit).toBe(5);
    });

    it('should cap limit at 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.limit).toBe(50);
    });
  });

  // 11. Auto-expire failure is non-fatal (line 35)
  describe('auto-expire', () => {
    it('should continue when auto-expire query fails', async () => {
      // First getPool call (writer for auto-expire) succeeds but query throws
      let callCount = 0;
      (getPool as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Writer pool for auto-expire — query rejects
          return Promise.resolve({
            query: jest.fn().mockRejectedValue(new Error('expire error')),
            connect: jest.fn().mockResolvedValue(mockClient),
          });
        }
        return Promise.resolve(mockPool);
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
    });
  });

  // 12. Filter: created (with authenticated user)
  describe('created filter', () => {
    it('should query challenges by creator_id for authenticated user', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'created' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('created');
    });

    it('should apply status=all without status clause', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'created', status: 'all' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should apply cursor pagination in created filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'created', cursor: '2026-02-20T12:00:00Z' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should fall through to default filter when userId is absent for created filter', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: { sub: VALID_USER_ID } },
          identity: { sourceIp: '127.0.0.1' },
        },
        queryStringParameters: { filter: 'created' },
      });

      const result = await invoke(event);

      // Falls through to the else branch (default public list)
      expect(result.statusCode).toBe(200);
    });
  });

  // 13. Filter: tagged
  describe('tagged filter', () => {
    it('should query tagged challenges for authenticated user', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'tagged' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('tagged');
    });

    it('should apply cursor in tagged filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'tagged', cursor: '2026-02-20T12:00:00Z' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should compute nextCursor from tag_created_at in tagged filter', async () => {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`, {
          tag_created_at: `2026-02-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
        }));
      }
      mockClient.query.mockResolvedValue({ rows });

      const event = makeEvent({ queryStringParameters: { filter: 'tagged' } });
      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextCursor).toBeTruthy();
    });
  });

  // 14. Filter: responded
  describe('responded filter', () => {
    it('should query responded challenges for authenticated user', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'responded' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('responded');
    });

    it('should apply cursor in responded filter', async () => {
      const event = makeEvent({
        queryStringParameters: { filter: 'responded', cursor: '2026-02-20T12:00:00Z' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should compute nextCursor from response_created_at', async () => {
      const rows = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeChallengeRow(`d4e5f6a7-b8c9-0123-defa-23456789${String(i).padStart(4, '0')}`, {
          response_created_at: `2026-02-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
        }));
      }
      mockClient.query.mockResolvedValue({ rows });

      const event = makeEvent({ queryStringParameters: { filter: 'responded' } });
      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextCursor).toBeTruthy();
    });
  });

  // 15. creatorId filter (public profiles)
  describe('creatorId filter', () => {
    it('should query public challenges by creatorId when filter requires userId but userId is absent', async () => {
      // To hit the creatorId branch, we need: filter that requires userId but userId is null + creatorId present
      (resolveProfileId as jest.Mock).mockReset().mockResolvedValue(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: { sub: VALID_USER_ID } },
          identity: { sourceIp: '127.0.0.1' },
        },
        queryStringParameters: { filter: 'created', creatorId: 'e5f6a7b8-c9d0-1234-efab-345678901234' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });

    it('should apply cursor in creatorId filter', async () => {
      (resolveProfileId as jest.Mock).mockReset().mockResolvedValue(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: { sub: VALID_USER_ID } },
          identity: { sourceIp: '127.0.0.1' },
        },
        queryStringParameters: {
          filter: 'tagged',
          creatorId: 'e5f6a7b8-c9d0-1234-efab-345678901234',
          cursor: '2026-02-20T12:00:00Z',
        },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 16. Fallback/default filter (no auth, no creatorId)
  describe('default fallback filter', () => {
    it('should return public challenges when unauthenticated and no creatorId', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
        queryStringParameters: { filter: 'new' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).filter).toBe('new');
    });

    it('should apply cursor in default filter', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
        queryStringParameters: { cursor: '2026-02-20T12:00:00Z' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 17. User responses check
  describe('user response check', () => {
    it('should mark hasResponded=true for challenges the user responded to', async () => {
      const challengeId = 'd4e5f6a7-b8c9-0123-defa-234567890123';

      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('challenge_responses')) {
          return Promise.resolve({ rows: [{ challenge_id: challengeId }] });
        }
        // Main SELECT query (the big join) — return exactly 1 row (no hasMore)
        return Promise.resolve({ rows: [makeChallengeRow(challengeId)] });
      });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.challenges[0].hasResponded).toBe(true);
    });

    it('should skip response check when user is not authenticated', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await invoke(event);

      const body = JSON.parse(result.body);
      expect(body.challenges[0].hasResponded).toBe(false);
    });
  });

  // 18. Challenge type mapping
  describe('challenge type mapping', () => {
    it('should include challengeType when slug exists', async () => {
      const row = makeChallengeRow('d4e5f6a7-b8c9-0123-defa-234567890123', {
        challenge_type_name: 'Dance Off',
        challenge_type_slug: 'dance-off',
        challenge_type_icon: 'dance-icon',
        challenge_type_category: 'dance',
      });
      mockClient.query.mockResolvedValue({ rows: [row] });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.challenges[0].challengeType).toEqual({
        name: 'Dance Off',
        slug: 'dance-off',
        icon: 'dance-icon',
        category: 'dance',
      });
    });

    it('should set challengeType to null when no slug', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.challenges[0].challengeType).toBeNull();
    });
  });

  // 19. Total tips parsing
  describe('total tips', () => {
    it('should parse total_tips as float', async () => {
      const row = makeChallengeRow('d4e5f6a7-b8c9-0123-defa-234567890123', {
        total_tips: '25.50',
      });
      mockClient.query.mockResolvedValue({ rows: [row] });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.challenges[0].totalTips).toBe(25.5);
    });

    it('should default to 0 when total_tips is null', async () => {
      const row = makeChallengeRow('d4e5f6a7-b8c9-0123-defa-234567890123', {
        total_tips: null,
      });
      mockClient.query.mockResolvedValue({ rows: [row] });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.challenges[0].totalTips).toBe(0);
    });
  });

  // 20. Rate limit identifier fallback
  describe('rate limit identifier', () => {
    it('should use sourceIp when no auth sub present', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '10.0.0.1' },
        },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      expect(requireRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: '10.0.0.1' }),
        expect.any(Object),
      );
    });
  });
});
