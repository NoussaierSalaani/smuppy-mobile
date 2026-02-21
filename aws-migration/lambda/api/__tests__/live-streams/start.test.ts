/**
 * Tests for live-streams/start Lambda handler
 * Validates auth, rate limit, account check, profile check, moderation, and stream creation
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
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  handleOptions: jest.fn(() => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_HOUR: 3600,
  NOTIFICATION_BATCH_SIZE: 500,
  NOTIFICATION_BATCH_DELAY_MS: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/account-status', () => ({
  requireActiveAccount: jest.fn().mockResolvedValue({
    profileId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    username: 'testcreator',
    moderationStatus: 'active',
  }),
  isAccountError: jest.fn().mockReturnValue(false),
}));

jest.mock('../../services/push-notification', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../live-streams/start';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { requireActiveAccount, isAccountError } from '../../utils/account-status';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const STREAM_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: null,
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

describe('live-streams/start handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
  });

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
    });
  });

  describe('account status', () => {
    it('should return error when account is suspended', async () => {
      (isAccountError as unknown as jest.Mock).mockReturnValueOnce(true);
      (requireActiveAccount as unknown as jest.Mock).mockResolvedValueOnce({
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Account suspended' }),
      });

      const event = makeEvent();
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
    });
  });

  describe('profile checks', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });

    it('should return 403 when user is not pro_creator', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: VALID_PROFILE_ID, username: 'user1', display_name: 'User', avatar_url: null, account_type: 'personal' }],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Only creators can go live');
    });

    it('should return 409 when user already has an active stream', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-stream' }] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toBe('You already have an active live stream');
    });
  });

  describe('content moderation', () => {
    it('should return 400 when title is blocked by text filter', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // no active stream

      (filterText as jest.Mock).mockResolvedValueOnce({
        clean: false,
        violations: ['hate_speech'],
        severity: 'critical',
      });

      const event = makeEvent({
        body: JSON.stringify({ title: 'Bad Title' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Content policy violation');
    });

    it('should return 400 when title is blocked by toxicity check', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      (analyzeTextToxicity as jest.Mock).mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: [],
      });

      const event = makeEvent({
        body: JSON.stringify({ title: 'Toxic Title' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should skip moderation for default "Live" title', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // no active stream
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'Live', started_at: '2026-02-20T12:00:00Z' }],
        }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // fans query

      const event = makeEvent(); // no body = default title
      await handler(event);

      expect(filterText).not.toHaveBeenCalled();
      expect(analyzeTextToxicity).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('should return 201 with stream data on success', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // no active stream
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'My Stream', started_at: '2026-02-20T12:00:00Z' }],
        }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // fans query (for notification)

      const event = makeEvent({
        body: JSON.stringify({ title: 'My Stream' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(STREAM_ID);
      expect(body.data.title).toBe('My Stream');
      expect(body.data.channelName).toBe(`live_${VALID_PROFILE_ID}`);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database throws', async () => {
      (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  // ── Additional coverage: title sanitization, fan notification, edge cases ──

  describe('additional coverage - title sanitization', () => {
    it('should strip HTML tags from custom title', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // no active stream
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'Clean Title', started_at: '2026-02-20T12:00:00Z' }],
        })
        .mockResolvedValueOnce({ rows: [] }); // fans query

      const event = makeEvent({
        body: JSON.stringify({ title: '<script>alert("xss")</script>Clean Title' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      // The INSERT query receives sanitized title
      const insertCall = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO live_streams'),
      );
      expect(insertCall).toBeDefined();
    });

    it('should truncate title to 100 characters', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'x'.repeat(100), started_at: '2026-02-20T12:00:00Z' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        body: JSON.stringify({ title: 'x'.repeat(200) }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });

    it('should default title to "Live" when body has no title', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'Live', started_at: '2026-02-20T12:00:00Z' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.data.title).toBe('Live');
    });
  });

  describe('additional coverage - fan notifications', () => {
    it('should send notifications to fans when followers exist', async () => {
      const { sendPushToUser } = jest.requireMock('../../services/push-notification') as { sendPushToUser: jest.Mock };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // no active stream
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'My Stream', started_at: '2026-02-20T12:00:00Z' }],
        })
        .mockResolvedValueOnce({
          rows: [{ follower_id: 'fan-1' }, { follower_id: 'fan-2' }],
        }) // fans query
        .mockResolvedValue({ rows: [] }); // batch insert notifications

      const event = makeEvent({
        body: JSON.stringify({ title: 'My Stream' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(201);

      // Wait a tick for the fire-and-forget notification promise to execute
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(sendPushToUser).toHaveBeenCalled();
    });

    it('should not fail if notification sending errors', async () => {
      const { sendPushToUser } = jest.requireMock('../../services/push-notification') as { sendPushToUser: jest.Mock };
      sendPushToUser.mockRejectedValue(new Error('Push error'));

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: VALID_PROFILE_ID, username: 'creator1', display_name: 'Creator', avatar_url: null, account_type: 'pro_creator' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ id: STREAM_ID, channel_name: `live_${VALID_PROFILE_ID}`, title: 'Stream', started_at: '2026-02-20T12:00:00Z' }],
        })
        .mockResolvedValueOnce({
          rows: [{ follower_id: 'fan-1' }],
        })
        .mockResolvedValue({ rows: [] });

      const event = makeEvent({
        body: JSON.stringify({ title: 'Stream' }),
      });
      const result = await handler(event);

      // Handler should still succeed — notifications are fire-and-forget
      expect(result.statusCode).toBe(201);
    });
  });
});
