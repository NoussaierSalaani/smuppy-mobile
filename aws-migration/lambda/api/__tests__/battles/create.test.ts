/**
 * Tests for battles/create Lambda handler
 * Validates auth, rate limit, account status, validation, moderation, and battle creation
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
    accountType: 'pro_creator',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
  sanitizeInput: jest.fn((text: string, _max: number) => text),
}));

jest.mock('../../utils/constants', () => ({
  DEFAULT_BATTLE_DURATION_MINUTES: 10,
  MIN_BATTLE_DURATION_MINUTES: 1,
  MAX_BATTLE_DURATION_MINUTES: 120,
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

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../battles/create';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { isValidUUID } from '../../utils/security';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_BATTLE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const INVITED_USER_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({
      invitedUserIds: [INVITED_USER_ID],
      battleType: 'tips',
      maxParticipants: 2,
      durationMinutes: 10,
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

describe('battles/create handler', () => {
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
      // Profile resolution
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
      }
      // Host profile lookup
      if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name') && sql.includes('WHERE id = $1')) {
        return Promise.resolve({
          rows: [{
            id: VALID_PROFILE_ID,
            username: 'hostuser',
            display_name: 'Host User',
            avatar_url: 'https://example.com/avatar.jpg',
            account_type: 'pro_creator',
            is_verified: true,
            business_name: null,
          }],
        });
      }
      // Invited users lookup
      if (typeof sql === 'string' && sql.includes('WHERE id = ANY')) {
        return Promise.resolve({
          rows: [{
            id: INVITED_USER_ID,
            username: 'opponent',
            display_name: 'Opponent User',
            avatar_url: 'https://example.com/opponent.jpg',
            account_type: 'pro_creator',
            is_verified: false,
            business_name: null,
          }],
        });
      }
      // Battle insert
      if (typeof sql === 'string' && sql.includes('INSERT INTO live_battles')) {
        return Promise.resolve({
          rows: [{
            id: VALID_BATTLE_ID,
            title: "Host User's Battle",
            description: null,
            battle_type: 'tips',
            max_participants: 2,
            duration_minutes: 10,
            scheduled_at: null,
            agora_channel_name: 'battle_a1b2c3d4',
            status: 'invited',
            created_at: '2026-02-20T12:00:00Z',
          }],
        });
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
  });

  // 4. Profile not found
  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // 5. Validation
  describe('input validation', () => {
    it('should return 400 when invitedUserIds is empty', async () => {
      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [], battleType: 'tips' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('At least one opponent must be invited');
    });

    it('should return 400 when maxParticipants is out of range', async () => {
      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [INVITED_USER_ID], maxParticipants: 11 }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('maxParticipants must be between 2 and 10');
    });

    it('should return 400 when durationMinutes is out of range', async () => {
      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [INVITED_USER_ID], durationMinutes: 200 }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('durationMinutes must be between 1 and 120');
    });

    it('should return 400 when invalid battle type', async () => {
      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [INVITED_USER_ID], battleType: 'invalid' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid battle type');
    });

    it('should return 400 for invalid UUID format in invitedUserIds', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: ['invalid-id'] }),
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
        violations: ['hate'],
        severity: 'critical',
      });

      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [INVITED_USER_ID], title: 'Bad title' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when toxicity blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
      });

      const event = makeEvent({
        body: JSON.stringify({ invitedUserIds: [INVITED_USER_ID], title: 'Toxic title' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
    });
  });

  // 7. Host not a creator
  describe('host validation', () => {
    it('should return 403 when host is not a creator', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name') && sql.includes('WHERE id = $1')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PROFILE_ID,
              username: 'personaluser',
              display_name: 'Personal User',
              avatar_url: null,
              account_type: 'personal',
              is_verified: false,
              business_name: null,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Only creators can host battles');
    });
  });

  // 8. Happy path
  describe('happy path', () => {
    it('should return 201 with battle data on success', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.battle).toBeDefined();
      expect(body.battle.id).toBe(VALID_BATTLE_ID);
      expect(body.battle.status).toBe('invited');
      expect(body.battle.participants).toBeDefined();
    });

    it('should use a transaction (BEGIN/COMMIT)', async () => {
      await invoke(makeEvent());

      const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
    });
  });

  // 9. Database error
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
      expect(JSON.parse(result.body).message).toBe('Failed to create battle');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

});
