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

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

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

function makeChallengeRow(id: string) {
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
});
