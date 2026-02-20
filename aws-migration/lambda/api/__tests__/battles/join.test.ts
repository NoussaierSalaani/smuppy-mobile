/**
 * Tests for battles/join Lambda handler
 * Validates auth, rate limit, account status, actions (accept/decline/start/leave)
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
}));

jest.mock('agora-access-token', () => ({
  RtcTokenBuilder: {
    buildTokenWithUid: jest.fn(() => 'mock-agora-token'),
  },
  RtcRole: {
    PUBLISHER: 1,
  },
}));

// ── Import handler AFTER all mocks ──

import { handler } from '../../battles/join';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_BATTLE_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const HOST_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const PARTICIPANT_DB_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = (e: APIGatewayProxyEvent) => handler(e) as Promise<any>;

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ action: 'accept' }),
    pathParameters: { battleId: VALID_BATTLE_ID },
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

describe('battles/join handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set env vars for Agora
    process.env.AGORA_APP_ID = 'test-app-id';
    process.env.AGORA_APP_CERTIFICATE = 'test-certificate';

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);

    // Default mock: profile found, battle found, participant found with 'invited' status
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('FROM live_battles WHERE id')) {
        return Promise.resolve({
          rows: [{
            id: VALID_BATTLE_ID,
            host_id: HOST_ID,
            agora_channel_name: 'battle_test1234',
            status: 'invited',
          }],
        });
      }
      if (typeof sql === 'string' && sql.includes('FROM battle_participants') && sql.includes('WHERE battle_id')) {
        return Promise.resolve({
          rows: [{ id: PARTICIPANT_DB_ID, status: 'invited' }],
        });
      }
      if (typeof sql === 'string' && sql.includes('SELECT EXISTS')) {
        return Promise.resolve({ rows: [{ has_streaming: false }] });
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

  // 4. Invalid battle ID
  describe('battle ID validation', () => {
    it('should return 400 when battleId is invalid', async () => {
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);

      const event = makeEvent({ pathParameters: { battleId: 'bad-id' } });
      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid ID format');
    });
  });

  // 5. Invalid action
  describe('action validation', () => {
    it('should return 400 when action is invalid', async () => {
      const event = makeEvent({
        body: JSON.stringify({ action: 'invalid_action' }),
      });

      const result = await invoke(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid action');
    });
  });

  // 6. Profile not found
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
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // 7. Battle not found
  describe('battle not found', () => {
    it('should return 404 when battle does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM live_battles WHERE id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Battle not found');
    });
  });

  // 8. Not a participant
  describe('participant check', () => {
    it('should return 403 when user is not a participant', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM live_battles WHERE id')) {
          return Promise.resolve({
            rows: [{ id: VALID_BATTLE_ID, host_id: HOST_ID, agora_channel_name: 'battle_x', status: 'invited' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('FROM battle_participants')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('You are not a participant in this battle');
    });
  });

  // 9. Accept action - happy path
  describe('accept action', () => {
    it('should return 200 with success message when accepting invite', async () => {
      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Invitation accepted');
    });

    it('should return 400 when invitation already processed', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: VALID_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM live_battles WHERE id')) {
          return Promise.resolve({
            rows: [{ id: VALID_BATTLE_ID, host_id: HOST_ID, agora_channel_name: 'battle_x', status: 'invited' }],
          });
        }
        if (typeof sql === 'string' && sql.includes('FROM battle_participants')) {
          return Promise.resolve({ rows: [{ id: PARTICIPANT_DB_ID, status: 'accepted' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await invoke(makeEvent());

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invitation already processed');
    });
  });

  // 10. Decline action
  describe('decline action', () => {
    it('should return 200 when declining invite', async () => {
      const event = makeEvent({ body: JSON.stringify({ action: 'decline' }) });

      const result = await invoke(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Invitation declined');
    });
  });

  // 11. Database error
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
      expect(JSON.parse(result.body).message).toBe('Failed to process action');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

});
