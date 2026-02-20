/**
 * Tests for conversations/create Lambda handler
 * Validates auth, rate limit, input validation, account status, block checks,
 * participant lookup, existing conversation return, and new conversation creation.
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
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/cors', () => ({
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

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'testuser',
    fullName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
    isVerified: false,
    accountType: 'personal',
    businessName: null,
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../conversations/create';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { isValidUUID } from '../../utils/security';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PARTICIPANT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_CONVERSATION_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ participantId: VALID_PARTICIPANT_ID }),
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: { sub: VALID_USER_ID },
      },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('conversations/create handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (requireActiveAccount as jest.Mock).mockResolvedValue({
      profileId: VALID_PROFILE_ID,
      username: 'testuser',
      fullName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      isVerified: false,
      accountType: 'personal',
      businessName: null,
      moderationStatus: 'active',
    });
    (isAccountError as unknown as jest.Mock).mockReturnValue(false);

    // Default mock: participant exists and is active, no blocks, no existing conversation
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
        return Promise.resolve({
          rows: [{
            id: VALID_PARTICIPANT_ID,
            username: 'otheruser',
            display_name: 'Other User',
            avatar_url: 'https://example.com/other-avatar.jpg',
            is_verified: true,
            moderation_status: 'active',
          }],
        });
      }
      if (typeof sql === 'string' && sql.includes('blocked_users')) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('SELECT id, created_at, last_message_at') && sql.includes('FROM conversations')) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO conversations')) {
        return Promise.resolve({
          rows: [{
            id: VALID_CONVERSATION_ID,
            created_at: '2026-02-20T12:00:00Z',
            last_message_at: null,
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
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should return 401 when authorizer claims have no sub', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          authorizer: { claims: {} },
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // 3. Validation
  describe('input validation', () => {
    it('should return 400 when participantId is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('participantId is required');
    });

    it('should return 400 when participantId is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ body: JSON.stringify({ participantId: 'not-a-uuid' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid participantId format');
    });

    it('should return 400 when trying to create conversation with yourself', async () => {
      const event = makeEvent({ body: JSON.stringify({ participantId: VALID_PROFILE_ID }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Cannot create conversation with yourself');
    });
  });

  // 4. Account status
  describe('account status', () => {
    it('should return account error when account is suspended', async () => {
      const accountError = {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Your account is temporarily suspended.' }),
      };
      (requireActiveAccount as jest.Mock).mockResolvedValueOnce(accountError);
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Your account is temporarily suspended.');
    });
  });

  // 5. Participant not found
  describe('participant lookup', () => {
    it('should return 404 when participant does not exist', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Participant not found');
    });

    it('should return 403 when participant is suspended', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PARTICIPANT_ID,
              username: 'suspendeduser',
              display_name: 'Suspended',
              avatar_url: null,
              is_verified: false,
              moderation_status: 'suspended',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot create conversation with this user');
    });

    it('should return 403 when participant is banned', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PARTICIPANT_ID,
              username: 'banneduser',
              display_name: 'Banned',
              avatar_url: null,
              is_verified: false,
              moderation_status: 'banned',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot create conversation with this user');
    });
  });

  // 6. Block check
  describe('block check', () => {
    it('should return 403 when block exists between users', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PARTICIPANT_ID,
              username: 'otheruser',
              display_name: 'Other User',
              avatar_url: null,
              is_verified: false,
              moderation_status: 'active',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot create conversation with this user');
    });
  });

  // 7. Existing conversation
  describe('existing conversation', () => {
    it('should return 200 with created: false when conversation already exists', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PARTICIPANT_ID,
              username: 'otheruser',
              display_name: 'Other User',
              avatar_url: 'https://example.com/other.jpg',
              is_verified: true,
              moderation_status: 'active',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, created_at, last_message_at') && sql.includes('FROM conversations')) {
          return Promise.resolve({
            rows: [{
              id: VALID_CONVERSATION_ID,
              created_at: '2026-02-19T10:00:00Z',
              last_message_at: '2026-02-20T08:00:00Z',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.created).toBe(false);
      expect(body.conversation.id).toBe(VALID_CONVERSATION_ID);
      expect(body.conversation.other_participant.id).toBe(VALID_PARTICIPANT_ID);
      expect(body.conversation.other_participant.username).toBe('otheruser');
    });
  });

  // 8. Happy path: new conversation
  describe('happy path — new conversation', () => {
    it('should return 201 with created: true when new conversation is created', async () => {
      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.created).toBe(true);
      expect(body.conversation.id).toBe(VALID_CONVERSATION_ID);
      expect(body.conversation.other_participant).toBeDefined();
      expect(body.conversation.other_participant.id).toBe(VALID_PARTICIPANT_ID);
      expect(body.conversation.other_participant.username).toBe('otheruser');
      expect(body.conversation.other_participant.is_verified).toBe(true);
    });
  });

  // 9. Error handling
  describe('error handling', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when db.query throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Query timeout'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
