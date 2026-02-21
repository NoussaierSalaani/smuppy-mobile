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

  // ── 11. Body parsing edge cases ──

  describe('body parsing branches', () => {
    it('should parse empty object when event.body is null', async () => {
      // event.body ? JSON.parse(event.body) : {} -- falsy body branch
      // With body=null, body becomes {}, so content is undefined -> 400
      const event = makeEvent({ body: null });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message content is required');
    });

    it('should return 400 when content is a number (not a string)', async () => {
      const event = makeEvent({ body: JSON.stringify({ content: 42 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Message content is required');
    });
  });

  // ── 12. Media validation branches ──

  describe('media validation', () => {
    it('should accept valid https media URL with valid image type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Check this photo',
          mediaUrl: 'https://s3.amazonaws.com/bucket/photo.jpg',
          mediaType: 'image',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify the INSERT received valid media fields
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][4]).toBe('https://s3.amazonaws.com/bucket/photo.jpg'); // validMediaUrl
      expect(insertCall![1][5]).toBe('image'); // validMediaType
    });

    it('should accept valid https media URL with video type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Check this video',
          mediaUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          mediaType: 'video',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
    });

    it('should set validMediaUrl to null for non-https URL', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrl: 'http://insecure.com/photo.jpg',
          mediaType: 'image',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][4]).toBeNull(); // validMediaUrl
      expect(insertCall![1][5]).toBeNull(); // validMediaType (depends on validMediaUrl)
    });

    it('should set validMediaUrl to null when mediaUrl is not a string', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', mediaUrl: 123, mediaType: 'image' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][4]).toBeNull();
    });

    it('should set validMediaType to null when mediaType is not in allowed list', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrl: 'https://s3.amazonaws.com/bucket/file.xyz',
          mediaType: 'document', // not in ['image', 'video', 'audio', 'voice']
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][4]).toBe('https://s3.amazonaws.com/bucket/file.xyz'); // validMediaUrl set
      expect(insertCall![1][5]).toBeNull(); // validMediaType null (invalid type)
    });

    it('should set validMediaType to null when mediaType is not a string', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrl: 'https://s3.amazonaws.com/bucket/file.jpg',
          mediaType: 42,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][5]).toBeNull(); // validMediaType null
    });

    it('should set validMediaType to null when mediaUrl is valid but mediaType is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Hello',
          mediaUrl: 'https://s3.amazonaws.com/bucket/file.jpg',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][5]).toBeNull();
    });
  });

  // ── 13. Voice URL and duration validation ──

  describe('voice/audio validation', () => {
    const VALID_VOICE_URL = 'https://s3.amazonaws.com/voice-messages/aabbccdd-1234-5678-abcd-ef1234567890/11223344-aabb-ccdd-eeff-112233445566/99887766-5544-3322-1100-aabbccddeeff.m4a';

    it('should return 400 for voice type with invalid URL pattern', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: 'https://s3.amazonaws.com/not-voice-messages/file.m4a',
          mediaType: 'voice',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid voice message URL');
    });

    it('should return 400 for audio type with invalid URL pattern', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Audio msg',
          mediaUrl: 'https://s3.amazonaws.com/random/file.mp3',
          mediaType: 'audio',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid voice message URL');
    });

    it('should accept valid voice URL pattern and type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 15,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][4]).toBe(VALID_VOICE_URL); // validMediaUrl
      expect(insertCall![1][5]).toBe('voice'); // validMediaType
      expect(insertCall![1][6]).toBe(15); // validVoiceDuration
    });

    it('should accept valid audio URL pattern and type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Audio msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'audio',
          voiceDuration: 120,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][5]).toBe('audio');
      expect(insertCall![1][6]).toBe(120);
    });

    it('should set voiceDuration to null when not a number', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 'fifteen',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][6]).toBeNull(); // voiceDuration invalid
    });

    it('should set voiceDuration to null when value is 0 (below min)', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 0,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][6]).toBeNull();
    });

    it('should set voiceDuration to null when value exceeds 300', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 301,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][6]).toBeNull();
    });

    it('should set voiceDuration to null when value is a non-integer float', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice msg',
          mediaUrl: VALID_VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 15.5,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][6]).toBeNull();
    });

    it('should set voiceDuration to null for non-voice mediaType even with valid duration', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Photo',
          mediaUrl: 'https://s3.amazonaws.com/bucket/photo.jpg',
          mediaType: 'image',
          voiceDuration: 15,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][6]).toBeNull(); // not audio/voice
    });

    it('should not validate voice URL when mediaType is image', async () => {
      // Voice URL check only runs for audio/voice mediaType
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Photo',
          mediaUrl: 'https://s3.amazonaws.com/not-a-voice-path/file.jpg',
          mediaType: 'image',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201); // No voice URL validation
    });
  });

  // ── 14. ClientMessageId validation ──

  describe('clientMessageId validation', () => {
    it('should accept valid clientMessageId (alphanumeric + dashes)', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 'msg-abc-123_xyz' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][10]).toBe('msg-abc-123_xyz'); // validClientMessageId
    });

    it('should set clientMessageId to null when not a string', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 42 }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][10]).toBeNull();
    });

    it('should set clientMessageId to null when empty string', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: '' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][10]).toBeNull();
    });

    it('should set clientMessageId to null when too long (>64 chars)', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 'a'.repeat(65) }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][10]).toBeNull();
    });

    it('should set clientMessageId to null when contains invalid characters', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 'msg id with spaces!' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][10]).toBeNull();
    });
  });

  // ── 15. Shared content detection ──

  describe('shared content detection', () => {
    const SHARED_POST_UUID = 'aabbccdd-1122-3344-5566-778899aabbcc';
    const SHARED_PEAK_UUID = 'ddeeffaa-5566-7788-9900-112233445566';

    it('should detect [shared_post:UUID] and set sharedPostId', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM posts')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] }); // post exists
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: `[shared_post:${SHARED_POST_UUID}]`,
              media_url: null, media_type: null, voice_duration_seconds: null,
              sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: null, shared_post_id: SHARED_POST_UUID, shared_peak_id: null,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: `[shared_post:${SHARED_POST_UUID}]` }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify moderation was skipped (shared content)
      expect(filterText).not.toHaveBeenCalled();
      expect(analyzeTextToxicity).not.toHaveBeenCalled();
      // Verify push body
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Shared a post with you' }),
        VALID_PROFILE_ID,
      );
    });

    it('should return 400 when shared post does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM posts')) {
          return Promise.resolve({ rows: [] }); // post not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: `[shared_post:${SHARED_POST_UUID}]` }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Shared post not found');
    });

    it('should detect [shared_peak:UUID] and set sharedPeakId', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM peaks')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] }); // peak exists
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: `[shared_peak:${SHARED_PEAK_UUID}]`,
              media_url: null, media_type: null, voice_duration_seconds: null,
              sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: null, shared_post_id: null, shared_peak_id: SHARED_PEAK_UUID,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: `[shared_peak:${SHARED_PEAK_UUID}]` }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify push body for peak
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Shared a peak with you' }),
        VALID_PROFILE_ID,
      );
    });

    it('should return 400 when shared peak does not exist', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM peaks')) {
          return Promise.resolve({ rows: [] }); // peak not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: `[shared_peak:${SHARED_PEAK_UUID}]` }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Shared peak not found');
    });
  });

  // ── 16. ReplyToMessageId validation ──

  describe('replyToMessageId validation', () => {
    it('should set validReplyToMessageId when reply message exists in conversation', async () => {
      const REPLY_MSG_ID = 'f6a7b8c9-0123-4567-89ab-cdef01234567';
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM messages WHERE id')) {
          return Promise.resolve({ rows: [{ '?column?': 1 }] }); // reply message found
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: 'Reply text', media_url: null, media_type: null,
              voice_duration_seconds: null, sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: REPLY_MSG_ID, shared_post_id: null, shared_peak_id: null,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Reply text', replyToMessageId: REPLY_MSG_ID }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Verify replyToMessageId was passed to INSERT
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][7]).toBe(REPLY_MSG_ID); // validReplyToMessageId
    });

    it('should set validReplyToMessageId to null when reply message not found in conversation', async () => {
      const REPLY_MSG_ID = 'f6a7b8c9-0123-4567-89ab-cdef01234567';
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('SELECT 1 FROM messages WHERE id')) {
          return Promise.resolve({ rows: [] }); // reply message NOT found
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: 'Reply text', media_url: null, media_type: null,
              voice_duration_seconds: null, sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: null, shared_post_id: null, shared_peak_id: null,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Reply text', replyToMessageId: REPLY_MSG_ID }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][7]).toBeNull(); // reply not found -> null
    });

    it('should skip reply validation when replyToMessageId is not a string', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', replyToMessageId: 42 }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][7]).toBeNull();
    });

    it('should skip reply validation when replyToMessageId is not a valid UUID', async () => {
      // isValidUUID returns true by default; override for the replyToMessageId check
      // The handler calls isValidUUID first for conversationId (true), then for replyToMessageId
      (isValidUUID as jest.Mock)
        .mockReturnValueOnce(true) // conversationId check
        .mockReturnValueOnce(false); // replyToMessageId check

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', replyToMessageId: 'not-a-uuid' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      expect(insertCall![1][7]).toBeNull();
    });
  });

  // ── 17. Idempotent retry (duplicate clientMessageId) ──

  describe('idempotent retry via clientMessageId', () => {
    it('should return 200 with existing message when INSERT returns 0 rows (ON CONFLICT DO NOTHING)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({ rows: [] }); // ON CONFLICT DO NOTHING -> 0 rows
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, content, media_url')) {
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: 'Hello', media_url: null, media_type: null,
              voice_duration_seconds: null, sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: null, shared_post_id: null, shared_peak_id: null,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 'retry-msg-001' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message.id).toBe(VALID_MESSAGE_ID);
      expect(body.message.sender.id).toBe(VALID_PROFILE_ID);
    });

    it('should return 200 with empty message object when existing message not found (edge case)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'active' }] });
        }
        if (typeof sql === 'string' && sql.includes('blocked_users')) {
          return Promise.resolve({ rows: [] });
        }
        if (typeof sql === 'string' && sql.includes('INSERT INTO messages')) {
          return Promise.resolve({ rows: [] }); // ON CONFLICT DO NOTHING
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, content, media_url')) {
          return Promise.resolve({ rows: [] }); // existing message not found either
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent({
        body: JSON.stringify({ content: 'Hello', clientMessageId: 'retry-msg-002' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      // existing.rows[0] || {} -> {}
      expect(body.message.sender).toBeDefined();
    });
  });

  // ── 18. Recipient determination ──

  describe('recipient determination', () => {
    it('should set recipient to participant_1 when sender is participant_2', async () => {
      // Swap the participant order: sender is participant_2
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{
              id: VALID_CONVERSATION_ID,
              participant_1_id: RECIPIENT_ID, // other user is participant_1
              participant_2_id: VALID_PROFILE_ID, // sender is participant_2
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
          return Promise.resolve({
            rows: [{
              id: VALID_MESSAGE_ID, content: 'Hello', media_url: null, media_type: null,
              voice_duration_seconds: null, sender_id: VALID_PROFILE_ID, recipient_id: RECIPIENT_ID,
              reply_to_message_id: null, shared_post_id: null, shared_peak_id: null,
              read: false, created_at: '2026-02-20T12:00:00Z',
            }],
          });
        }
        if (typeof sql === 'string' && sql.includes('UPDATE conversations')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      // Push should be sent to RECIPIENT_ID (which is participant_1 in this case)
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.any(Object),
        VALID_PROFILE_ID,
      );
    });
  });

  // ── 19. Recipient banned / not found ──

  describe('recipient moderation edge cases', () => {
    it('should return 403 when recipient is banned', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [{ moderation_status: 'banned' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot send message to this user');
    });

    it('should return 403 when recipient profile not found (rows.length === 0)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, participant_1_id, participant_2_id')) {
          return Promise.resolve({
            rows: [{ id: VALID_CONVERSATION_ID, participant_1_id: VALID_PROFILE_ID, participant_2_id: RECIPIENT_ID }],
          });
        }
        if (typeof sql === 'string' && sql.includes('SELECT moderation_status')) {
          return Promise.resolve({ rows: [] }); // recipient profile not found
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Cannot send message to this user');
    });
  });

  // ── 20. Push notification body variants ──

  describe('push notification body variants', () => {
    it('should send "Sent a voice message" for voice mediaType', async () => {
      const VOICE_URL = 'https://s3.amazonaws.com/voice-messages/aabbccdd-1234-5678-abcd-ef1234567890/11223344-aabb-ccdd-eeff-112233445566/99887766-5544-3322-1100-aabbccddeeff.m4a';
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Voice',
          mediaUrl: VOICE_URL,
          mediaType: 'voice',
          voiceDuration: 10,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Sent a voice message' }),
        VALID_PROFILE_ID,
      );
    });

    it('should send "Sent a voice message" for audio mediaType', async () => {
      const VOICE_URL = 'https://s3.amazonaws.com/voice-messages/aabbccdd-1234-5678-abcd-ef1234567890/11223344-aabb-ccdd-eeff-112233445566/99887766-5544-3322-1100-aabbccddeeff.m4a';
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Audio',
          mediaUrl: VOICE_URL,
          mediaType: 'audio',
          voiceDuration: 10,
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Sent a voice message' }),
        VALID_PROFILE_ID,
      );
    });

    it('should send "Sent you a photo" for image mediaType', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Photo',
          mediaUrl: 'https://s3.amazonaws.com/bucket/photo.jpg',
          mediaType: 'image',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Sent you a photo' }),
        VALID_PROFILE_ID,
      );
    });

    it('should send "Sent you a photo" for video mediaType with validMediaUrl', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          content: 'Video',
          mediaUrl: 'https://s3.amazonaws.com/bucket/video.mp4',
          mediaType: 'video',
        }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Sent you a photo' }),
        VALID_PROFILE_ID,
      );
    });

    it('should send "Sent you a message" for text-only message', async () => {
      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ body: 'Sent you a message' }),
        VALID_PROFILE_ID,
      );
    });
  });

  // ── 21. Display name fallback ──

  describe('display name fallback', () => {
    it('should use "Someone" when display_name is null', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name, avatar_url FROM profiles')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PROFILE_ID,
              username: 'testuser',
              display_name: null, // no display name
              avatar_url: 'https://example.com/avatar.jpg',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ title: 'Someone' }),
        VALID_PROFILE_ID,
      );
    });

    it('should use "Someone" when display_name is empty string', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id, username, display_name, avatar_url FROM profiles')) {
          return Promise.resolve({
            rows: [{
              id: VALID_PROFILE_ID,
              username: 'testuser',
              display_name: '', // empty string — falsy
              avatar_url: 'https://example.com/avatar.jpg',
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      expect(sendPushToUser).toHaveBeenCalledWith(
        mockDb, RECIPIENT_ID,
        expect.objectContaining({ title: 'Someone' }),
        VALID_PROFILE_ID,
      );
    });
  });

  // ── 22. HTML sanitization and content with media URL but validMediaUrl=null branch ──

  describe('content sanitization', () => {
    it('should strip HTML tags from content', async () => {
      const event = makeEvent({
        body: JSON.stringify({ content: '<b>Bold</b> text <script>alert("xss")</script>' }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(201);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO messages')
      );
      const savedContent = insertCall![1][3] as string;
      expect(savedContent).not.toContain('<b>');
      expect(savedContent).not.toContain('<script>');
      expect(savedContent).toContain('Bold');
    });
  });

  // ── 23. pathParameters?.id — null pathParameters ──

  describe('null pathParameters', () => {
    it('should return 400 when pathParameters is null', async () => {
      const event = makeEvent({ pathParameters: null });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Conversation ID is required');
    });
  });
});
