/**
 * Tests for challenges/vote Lambda handler
 * Validates auth, rate limit, validation, vote toggle, self-vote prevention
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

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../challenges/vote';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_CHALLENGE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_RESPONSE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const RESPONSE_AUTHOR_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (e: APIGatewayProxyEvent) => (handler as any)(e, {}, () => undefined) as any;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
    pathParameters: {
      challengeId: VALID_CHALLENGE_ID,
      responseId: VALID_RESPONSE_ID,
    },
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: VALID_USER_ID } },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('challenges/vote handler', () => {
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

    // Default: response exists and belongs to different user, no existing vote
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr') && sql.includes('WHERE cr.id')) {
        return Promise.resolve({
          rows: [{ id: VALID_RESPONSE_ID, user_id: RESPONSE_AUTHOR_ID }],
        });
      }
      if (typeof sql === 'string' && sql.includes('SELECT id FROM challenge_votes')) {
        return Promise.resolve({ rows: [] }); // No existing vote
      }
      if (typeof sql === 'string' && sql.includes('SELECT vote_count FROM challenge_responses')) {
        return Promise.resolve({ rows: [{ vote_count: 6 }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no auth claims', async () => {
      const event = makeEvent({
        requestContext: { requestId: 'test', identity: { sourceIp: '127.0.0.1' } },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        body: JSON.stringify({ success: false, message: 'Too many requests.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 3. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 4. Invalid IDs
  describe('ID validation', () => {
    it('should return 400 when challengeId is invalid', async () => {
      (isValidUUID as jest.Mock)
        .mockReturnValueOnce(false); // challengeId invalid

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });

    it('should return 400 when pathParameters are missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // 5. Response not found
  describe('response not found', () => {
    it('should return 404 when response does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr') && sql.includes('WHERE cr.id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Response not found');
    });
  });

  // 6. Self-vote prevention
  describe('self-vote prevention', () => {
    it('should return 403 when voting on own response', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr') && sql.includes('WHERE cr.id')) {
          return Promise.resolve({
            rows: [{ id: VALID_RESPONSE_ID, user_id: VALID_PROFILE_ID }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('You cannot vote on your own response');
    });
  });

  // 7. Happy path - add vote
  describe('happy path - add vote', () => {
    it('should return 200 with voted=true when adding a new vote', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.voted).toBe(true);
      expect(typeof body.voteCount).toBe('number');
    });

    it('should use BEGIN/COMMIT transaction', async () => {
      await invoke(makeEvent());

      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });
  });

  // 8. Happy path - remove vote (toggle)
  describe('happy path - remove vote', () => {
    it('should return 200 with voted=false when removing existing vote', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM challenge_responses cr') && sql.includes('WHERE cr.id')) {
          return Promise.resolve({
            rows: [{ id: VALID_RESPONSE_ID, user_id: RESPONSE_AUTHOR_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id FROM challenge_votes')) {
          return Promise.resolve({ rows: [{ id: 'existing-vote-id' }] }); // Has existing vote
        }
        if (typeof sql === 'string' && sql.includes('SELECT vote_count FROM challenge_responses')) {
          return Promise.resolve({ rows: [{ vote_count: 4 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.voted).toBe(false);
    });
  });

  // 9. Database error
  describe('database errors', () => {
    it('should return 500 and ROLLBACK on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('DB error'));
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Failed to vote');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 10. OPTIONS
  describe('OPTIONS request', () => {
    it('should return 200 for OPTIONS', async () => {
      const result = await invoke(makeEvent({ httpMethod: 'OPTIONS' }));
      expect(result.statusCode).toBe(200);
    });
  });

  // 11. Release client
  describe('cleanup', () => {
    it('should always release the client', async () => {
      await invoke(makeEvent());
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
