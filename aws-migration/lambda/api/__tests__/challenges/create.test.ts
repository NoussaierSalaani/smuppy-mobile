/**
 * Tests for challenges/create Lambda handler
 * Validates auth, rate limit, account status, validation, moderation, ownership, and DB interactions
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

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
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testcreator',
    fullName: 'Test Creator',
    avatarUrl: 'https://example.com/avatar.jpg',
    isVerified: true,
    accountType: 'pro_creator',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeInput: jest.fn((text: string, _max: number) => text),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockResolvedValue({ clean: true, violations: [], severity: 'none' }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  }),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../challenges/create';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PEAK_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_CHALLENGE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (e: APIGatewayProxyEvent) => (handler as any)(e) as any;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      peakId: VALID_PEAK_ID,
      title: 'Test Challenge',
      description: 'A test challenge description',
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

describe('challenges/create handler', () => {
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

    // Default: peak exists and belongs to user
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
        return Promise.resolve({
          rows: [{ id: VALID_PEAK_ID, author_id: VALID_PROFILE_ID }],
        });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO peak_challenges')) {
        return Promise.resolve({
          rows: [{
            id: VALID_CHALLENGE_ID,
            peak_id: VALID_PEAK_ID,
            creator_id: VALID_PROFILE_ID,
            challenge_type_id: null,
            title: 'Test Challenge',
            description: 'A test challenge description',
            rules: null,
            duration_seconds: null,
            ends_at: null,
            is_public: true,
            allow_anyone: true,
            max_participants: null,
            has_prize: false,
            prize_description: null,
            prize_amount: null,
            tips_enabled: false,
            status: 'active',
            created_at: '2026-02-20T12:00:00Z',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // 1. Auth
  describe('authentication', () => {
    it('should return 401 when no authorizer claims present', async () => {
      const event = makeEvent({
        requestContext: { requestId: 'test', identity: { sourceIp: '127.0.0.1' } },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when claims have no sub', async () => {
      const event = makeEvent({
        requestContext: { requestId: 'test', authorizer: { claims: {} }, identity: { sourceIp: '127.0.0.1' } },
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limit exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(429);
    });
  });

  // 3. Account status
  describe('account status', () => {
    it('should return error when account is suspended', async () => {
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Account suspended' }),
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
    });

    it('should return 403 when account is not pro_creator', async () => {
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(false);
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce({
        accountType: 'personal',
        moderationStatus: 'active',
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Only Pro Creators can create challenges');
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
    it('should return 400 when peakId and title are missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Peak ID and title are required');
    });

    it('should return 400 when title is empty', async () => {
      const event = makeEvent({ body: JSON.stringify({ peakId: VALID_PEAK_ID, title: '' }) });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when UUID format is invalid', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({
        body: JSON.stringify({ peakId: 'invalid', title: 'Test' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // 6. Moderation
  describe('content moderation', () => {
    it('should return 400 when text filter blocks content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate_speech'],
        severity: 'critical',
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });

    it('should return 400 when toxicity check blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Content policy violation');
    });
  });

  // 7. Peak not found / ownership
  describe('peak validation', () => {
    it('should return 404 when peak does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Peak not found');
    });

    it('should return 403 when peak belongs to different user', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({
            rows: [{ id: VALID_PEAK_ID, author_id: 'e5f6a7b8-c9d0-1234-efab-345678901234' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('You can only create challenges for your own Peaks');
    });
  });

  // 8. Happy path
  describe('happy path', () => {
    it('should return 201 with challenge data on success', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.challenge).toBeDefined();
      expect(body.challenge.id).toBe(VALID_CHALLENGE_ID);
      expect(body.challenge.title).toBe('Test Challenge');
      expect(body.challenge.status).toBe('active');
    });

    it('should use a transaction (BEGIN/COMMIT)', async () => {
      await invoke(makeEvent());

      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });

    it('should release the client after success', async () => {
      await invoke(makeEvent());

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 9. Database error
  describe('database errors', () => {
    it('should return 500 and ROLLBACK on DB error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, author_id FROM peaks')) {
          return Promise.resolve({ rows: [{ id: VALID_PEAK_ID, author_id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO peak_challenges')) {
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // 10. OPTIONS — withErrorHandler does not handle OPTIONS separately;
  //     API Gateway handles CORS preflight before the Lambda is invoked.
  //     If OPTIONS reaches the handler, it is processed like any other method.
  describe('OPTIONS request', () => {
    it('should process OPTIONS like a normal request (API Gateway handles preflight)', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });

      const result = await invoke(event);

      // Handler processes normally (no special OPTIONS handling)
      expect(result.statusCode).toBe(201);
    });
  });
});
