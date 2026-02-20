/**
 * Tests for challenges/responses Lambda handler
 * Validates challenge ID validation, cursor validation, pagination, and sort modes
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
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

// ── Import handler AFTER all mocks ──

import { handler } from '../../challenges/responses';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_CHALLENGE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_RESPONSE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

function makeResponseRow(id: string) {
  return {
    id,
    challenge_id: VALID_CHALLENGE_ID,
    peak_id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
    user_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    score: null,
    time_seconds: null,
    rank: null,
    vote_count: 5,
    status: 'submitted',
    created_at: '2026-02-20T12:00:00Z',
    username: 'testuser',
    display_name: 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
    is_verified: false,
    thumbnail_url: 'https://cdn.example.com/thumb.jpg',
    video_url: 'https://cdn.example.com/video.mp4',
    duration: 30,
    views_count: 100,
  };
}

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (e: APIGatewayProxyEvent) => (handler as any)(e) as any;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: { challengeId: VALID_CHALLENGE_ID },
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('challenges/responses handler', () => {
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

    // Default: challenge exists, query returns results
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM peak_challenges')) {
        return Promise.resolve({ rows: [{ id: VALID_CHALLENGE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr')) {
        return Promise.resolve({ rows: [makeResponseRow(VALID_RESPONSE_ID)] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Invalid challenge ID
  describe('challenge ID validation', () => {
    it('should return 400 when challengeId is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({ pathParameters: { challengeId: 'bad-id' } });
      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid challenge ID');
    });

    it('should return 400 when challengeId is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid challenge ID');
    });
  });

  // 2. Challenge not found
  describe('challenge not found', () => {
    it('should return 404 when challenge does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM peak_challenges')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Challenge not found');
    });
  });

  // 3. Invalid cursor
  describe('cursor validation', () => {
    it('should return 400 when cursor is invalid date (recent sort)', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: 'invalid-date', sortBy: 'recent' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid cursor format');
    });
  });

  // 4. Happy path - recent sort
  describe('happy path - recent sort', () => {
    it('should return 200 with responses list', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.responses).toBeDefined();
      expect(Array.isArray(body.responses)).toBe(true);
    });

    it('should include user and peak data in each response', async () => {
      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      const response = body.responses[0];
      expect(response.user).toBeDefined();
      expect(response.user.username).toBe('testuser');
      expect(response.peak).toBeDefined();
      expect(response.peak.videoUrl).toBe('https://cdn.example.com/video.mp4');
    });
  });

  // 5. Popular sort
  describe('popular sort', () => {
    it('should use popular sort when specified', async () => {
      const event = makeEvent({
        queryStringParameters: { sortBy: 'popular' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 6. Pagination
  describe('pagination', () => {
    it('should set hasMore=true when more rows than limit', async () => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < 21; i++) {
        rows.push(makeResponseRow(`e5f6a7b8-c9d0-1234-efab-34567890${String(i).padStart(4, '0')}`));
      }
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM peak_challenges')) {
          return Promise.resolve({ rows: [{ id: VALID_CHALLENGE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr')) {
          return Promise.resolve({ rows });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.responses.length).toBe(20);
    });

    it('should respect custom limit', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '5' },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // 7. Database error
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

  // 8. OPTIONS
  describe('OPTIONS request', () => {
    it('should return 200 for OPTIONS', async () => {
      const result = await invoke(makeEvent({ httpMethod: 'OPTIONS' }));
      expect(result.statusCode).toBe(200);
    });
  });
});
