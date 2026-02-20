/**
 * Tests for challenges/respond Lambda handler
 * Validates auth, rate limit, account status, validation, ownership, and response creation
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

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    accountType: 'personal',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../challenges/respond';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_CHALLENGE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_PEAK_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const VALID_RESPONSE_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';
const CREATOR_ID = 'f6a7b8c9-d0e1-2345-fabc-456789012345';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (e: APIGatewayProxyEvent) => (handler as any)(e) as any;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      challengeId: VALID_CHALLENGE_ID,
      peakId: VALID_PEAK_ID,
    }),
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

// ── Test suite ──

describe('challenges/respond handler', () => {
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

    // Default mock sequence for happy path
    mockClient.query.mockImplementation((sql: string) => {
      // Challenge lookup
      if (typeof sql === 'string' && sql.includes('FROM peak_challenges pc') && sql.includes('WHERE pc.id')) {
        return Promise.resolve({
          rows: [{
            id: VALID_CHALLENGE_ID,
            creator_id: CREATOR_ID,
            status: 'active',
            ends_at: null,
            allow_anyone: true,
            max_participants: null,
            response_count: 3,
            creator_user_id: CREATOR_ID,
          }],
        });
      }
      // Peak ownership check
      if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
        return Promise.resolve({
          rows: [{ id: VALID_PEAK_ID, author_id: VALID_PROFILE_ID }],
        });
      }
      // Existing response check (FOR UPDATE)
      if (typeof sql === 'string' && sql.includes('SELECT id FROM challenge_responses') && sql.includes('FOR UPDATE')) {
        return Promise.resolve({ rows: [] });
      }
      // Insert response
      if (typeof sql === 'string' && sql.includes('INSERT INTO challenge_responses')) {
        return Promise.resolve({
          rows: [{
            id: VALID_RESPONSE_ID,
            challenge_id: VALID_CHALLENGE_ID,
            peak_id: VALID_PEAK_ID,
            user_id: VALID_PROFILE_ID,
            score: null,
            time_seconds: null,
            status: 'submitted',
            created_at: '2026-02-20T12:00:00Z',
          }],
        });
      }
      // User profile for notification
      if (typeof sql === 'string' && sql.includes('SELECT username, display_name, avatar_url FROM profiles')) {
        return Promise.resolve({
          rows: [{ username: 'testuser', display_name: 'Test User', avatar_url: 'https://example.com/avatar.jpg' }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no auth claims present', async () => {
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

  // 3. Account status
  describe('account status', () => {
    it('should return error for suspended account', async () => {
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Account suspended' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
    });

    it('should return 403 for business accounts', async () => {
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        accountType: 'pro_business',
        moderationStatus: 'active',
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Business accounts cannot participate in challenges');
    });
  });

  // 4. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 5. Validation
  describe('input validation', () => {
    it('should return 400 when challengeId and peakId are missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Challenge ID and Peak ID are required');
    });

    it('should return 400 when UUID is invalid', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // 6. Challenge not found
  describe('challenge validation', () => {
    it('should return 404 when challenge not found', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM peak_challenges pc') && sql.includes('WHERE pc.id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Challenge not found');
    });

    it('should return 403 when trying to respond to own challenge', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM peak_challenges pc') && sql.includes('WHERE pc.id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CHALLENGE_ID, creator_id: VALID_PROFILE_ID, status: 'active', ends_at: null, allow_anyone: true, max_participants: null, response_count: 0 }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('You cannot respond to your own challenge');
    });

    it('should return 400 when challenge is no longer active', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM peak_challenges pc') && sql.includes('WHERE pc.id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CHALLENGE_ID, creator_id: CREATOR_ID, status: 'ended', ends_at: null, allow_anyone: true, max_participants: null, response_count: 0 }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('This challenge is no longer active');
    });
  });

  // 7. Happy path
  describe('happy path', () => {
    it('should return 201 with response data on success', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.response).toBeDefined();
      expect(body.response.id).toBe(VALID_RESPONSE_ID);
      expect(body.response.challengeId).toBe(VALID_CHALLENGE_ID);
    });

    it('should use a transaction (BEGIN/COMMIT)', async () => {
      await invoke(makeEvent());

      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });
  });

  // 8. Database error
  describe('database errors', () => {
    it('should return 500 on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && (sql === 'ROLLBACK' || sql === 'BEGIN')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.reject(new Error('Connection error'));
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 9. OPTIONS — withErrorHandler does not handle OPTIONS separately;
  //    API Gateway handles CORS preflight before the Lambda is invoked.
  describe('OPTIONS request', () => {
    it('should process OPTIONS like a normal request (API Gateway handles preflight)', async () => {
      const result = await invoke(makeEvent({ httpMethod: 'OPTIONS' }));
      // Handler processes normally (no special OPTIONS handling), returns 201 with valid data
      expect(result.statusCode).toBe(201);
    });
  });
});
