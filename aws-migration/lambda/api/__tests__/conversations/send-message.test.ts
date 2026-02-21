/**
 * Tests for conversations/send-message Lambda handler
 * Validates auth, rate limit, UUID validation, body parsing, content validation,
 * account status, moderation, profile lookup, participant/block checks,
 * transaction handling, push notifications, and message creation.
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

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  MAX_MESSAGE_LENGTH: 5000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../conversations/send-message';
import { requireRateLimit } from '../../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { isValidUUID } from '../../utils/security';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { sendPushToUser } from '../../services/push-notification';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const VALID_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_CONVERSATION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_MESSAGE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const RECIPIENT_ID = 'e5f6a7b8-c901-2345-efab-345678901234';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ content: 'Hello there!' }),
    pathParameters: { id: VALID_CONVERSATION_ID },
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

describe('conversations/send-message handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
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

    // Default: user profile found
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name, avatar_url FROM profiles')) {
        return Promise.resolve({
          rows: [{
            id: VALID_PROFILE_ID,
            username: 'testuser',
            display_name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    // Default: transaction queries succeed
    mockClient.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id FROM conversations')) {
        return Promise.resolve({
          rows: [{
            id: VALID_CONVERSATION_ID,
            participant_1_id: VALID_PROFILE_ID,
            participant_2_id: RECIPIENT_ID,
          }],
        });
      }
      if (typeof sql === 'string' && sql.includes('SELECT moderation_status FROM profiles')) {
        return Promise.resolve({
          rows: [{ moderation_status: 'active' }],
        });
      }
      if (typeof sql === 'string' && sql.includes('blocked_users')) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
        return Promise.resolve({
          rows: [{
            id: VALID_MESSAGE_ID,
            content: 'Hello there!',
            media_url: null,
            media_type: null,
            voice_duration_seconds: null,
            sender_id: VALID_PROFILE_ID,
            recipient_id: RECIPIENT_ID,
            reply_to_message_id: null,
            shared_post_id: null,
            shared_peak_id: null,
            read: false,
            created_at: '2026-02-20T12:00:00Z',
          }],
        });
      }
      if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
        return Promise.resolve({ rows: [] });
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
  });

  // 2. Rate limit
  describe('rate limiting', () => {
    it('should return 429 when global rate limit is exceeded', async () => {
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

    it('should return 429 when per-conversation rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock)
        .mockResolvedValueOnce(null) // global passes
        .mockResolvedValueOnce({
          statusCode: 429,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
        }); // per-conversation fails

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // 3. Validation
  describe('input validation', () => {
    it('should return 400 when conversation ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Conversation ID is required');
    });

    it('should return 400 when conversation ID is not a valid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);

      const event = makeEvent({ pathParameters: { id: 'bad-uuid' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid conversation ID format');
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json{' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid request body');
    });

    it('should return 400 when content is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message content is required');
    });

    it('should return 400 when content is empty string', async () => {
      const event = makeEvent({ body: JSON.stringify({ content: '' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message content is required');
    });

    it('should return 400 when content is only whitespace', async () => {
      const event = makeEvent({ body: JSON.stringify({ content: '   ' }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message content is required');
    });

    it('should return 400 when content exceeds MAX_MESSAGE_LENGTH', async () => {
      const event = makeEvent({ body: JSON.stringify({ content: 'a'.repeat(5001) }) });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('too long');
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
    });
  });

  // 5. Content moderation
  describe('content moderation', () => {
    it('should return 400 when text filter blocks critical content', async () => {
      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate'],
        severity: 'critical',
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when toxicity analysis blocks content', async () => {
      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [],
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });
  });

  // 6. Profile not found
  describe('profile lookup', () => {
    it('should return 404 when user profile is not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // 7. Conversation not found / not participant
  describe('conversation access (transaction)', () => {
    it('should return 404 when conversation not found or user not participant', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Conversation not found');
    });
  });

  // 8. Recipient moderation status
  describe('recipient checks', () => {
    it('should return 403 when recipient is suspended', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{
              id: VALID_CONVERSATION_ID,
              participant_1_id: VALID_PROFILE_ID,
              participant_2_id: RECIPIENT_ID,
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({
            rows: [{ moderation_status: 'suspended' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot send message to this user');
    });

    it('should return 403 when block exists between users', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{
              id: VALID_CONVERSATION_ID,
              participant_1_id: VALID_PROFILE_ID,
              participant_2_id: RECIPIENT_ID,
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot send message to this user');
    });
  });

  // 9. Happy path
  describe('happy path — message sent', () => {
    it('should return 201 with message data on success', async () => {
      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBeDefined();
      expect(body.message.id).toBe(VALID_MESSAGE_ID);
      expect(body.message.sender).toBeDefined();
      expect(body.message.sender.id).toBe(VALID_PROFILE_ID);
      expect(body.message.sender.username).toBe('testuser');
    });

    it('should use a transaction (BEGIN/COMMIT) for the insert', async () => {
      const event = makeEvent();

      await handler(event);

      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
    });

    it('should release the client after a successful transaction', async () => {
      const event = makeEvent();

      await handler(event);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should send push notification to recipient', async () => {
      const event = makeEvent();

      await handler(event);

      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb,
        RECIPIENT_ID,
        expect.objectContaining({
          title: 'Test User',
          body: 'Sent you a message',
          data: expect.objectContaining({ type: 'message', conversationId: VALID_CONVERSATION_ID }),
        }),
        VALID_PROFILE_ID,
      );
    });
  });

  // 10. Error handling
  describe('error handling', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when transaction throws', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{
              id: VALID_CONVERSATION_ID,
              participant_1_id: VALID_PROFILE_ID,
              participant_2_id: RECIPIENT_ID,
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.reject(new Error('Deadlock detected'));
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const clientCalls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(clientCalls).toContain('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
