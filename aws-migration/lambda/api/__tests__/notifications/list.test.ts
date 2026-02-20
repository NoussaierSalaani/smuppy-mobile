/**
 * Tests for notifications/list Lambda handler
 * Covers: auth, happy path, pagination, empty results, rate limiting, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';

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

import { handler } from '../../notifications/list';

// ── Test constants ───────────────────────────────────────────────────────

const TEST_COGNITO_SUB = 'cognito-sub-a1b2c3d4';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_ACTOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<{
  sub: string | null;
  queryStringParameters: Record<string, string> | null;
}>= {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/notifications',
    resource: '/notifications',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_COGNITO_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

function makeNotificationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif-001',
    type: 'like',
    title: 'New like',
    body: 'Someone liked your post',
    data: { postId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
    read: false,
    created_at: new Date('2026-02-15T10:00:00Z'),
    actor_id: TEST_ACTOR_ID,
    actor_username: 'janedoe',
    actor_full_name: 'Jane Doe',
    actor_avatar_url: 'https://example.com/avatar.jpg',
    actor_is_verified: true,
    actor_account_type: 'personal',
    actor_business_name: null,
    is_following_actor: false,
    ...overrides,
  };
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('notifications/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  // ── 1. Auth ────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should reject when authorizer is missing entirely', async () => {
      const event = {
        httpMethod: 'GET',
        headers: {},
        body: null,
        queryStringParameters: null,
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Happy path ─────────────────────────────────────────────────────

  describe('happy path', () => {
    it('should return notifications list with enriched actor data (200)', async () => {
      const notifRow = makeNotificationRow();

      // First query: profile lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      // Second query: notifications list (limit+1 rows to detect hasMore)
      mockDb.query.mockResolvedValueOnce({
        rows: [notifRow],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(1);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();

      // Verify enriched actor data
      const notification = body.data[0];
      expect(notification.id).toBe('notif-001');
      expect(notification.type).toBe('like');
      expect(notification.title).toBe('New like');
      expect(notification.body).toBe('Someone liked your post');
      expect(notification.read).toBe(false);
      expect(notification.data.user).toEqual({
        id: TEST_ACTOR_ID,
        username: 'janedoe',
        name: 'Jane Doe',
        avatar: 'https://example.com/avatar.jpg',
        isVerified: true,
        accountType: 'personal',
        businessName: null,
      });
      expect(notification.data.isFollowing).toBe(false);
    });

    it('should return notification without actor data when actor_id is null', async () => {
      const notifRow = makeNotificationRow({
        actor_id: null,
        actor_username: null,
        actor_full_name: null,
        actor_avatar_url: null,
        actor_is_verified: null,
        actor_account_type: null,
        actor_business_name: null,
        is_following_actor: null,
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [notifRow],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data[0].data.user).toBeUndefined();
      expect(body.data[0].data.isFollowing).toBeUndefined();
    });

    it('should use "Someone" as fallback when actor_full_name is null', async () => {
      const notifRow = makeNotificationRow({
        actor_full_name: null,
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [notifRow],
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data[0].data.user.name).toBe('Someone');
    });

    it('should return 404 when user profile is not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 3. Pagination ─────────────────────────────────────────────────────

  describe('pagination', () => {
    it('should return hasMore=true and nextCursor when more results exist', async () => {
      // Default limit is 20; handler fetches limit+1 = 21 to detect hasMore.
      // Return 21 rows so the handler knows there are more.
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeNotificationRow({
          id: `notif-${String(i).padStart(3, '0')}`,
          created_at: new Date(Date.UTC(2026, 1, 15, 10, 0, 0) - i * 60_000),
        })
      );

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(20);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeTruthy();
      // Cursor is the timestamp of the last returned notification
      const lastCreatedAt = new Date(body.data[19].createdAt).getTime();
      expect(body.nextCursor).toBe(lastCreatedAt.toString());
    });

    it('should pass cursor as a Date parameter in the query', async () => {
      const cursorTimestamp = '1708000000000';

      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { cursor: cursorTimestamp },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // The second query (notifications) should include the cursor Date param
      const notifQueryCall = mockDb.query.mock.calls[1];
      const queryText = notifQueryCall[0] as string;
      const queryParams = notifQueryCall[1] as unknown[];

      // Query should contain cursor comparison
      expect(queryText).toContain('n.created_at <');
      // params: [profileId, cursorDate, limit]
      expect(queryParams).toHaveLength(3);
      expect(queryParams[1]).toBeInstanceOf(Date);
      expect((queryParams[1] as Date).getTime()).toBe(parseInt(cursorTimestamp));
    });

    it('should respect custom limit capped at 50', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      // The limit param should be capped at 50 + 1 = 51
      const notifQueryCall = mockDb.query.mock.calls[1];
      const queryParams = notifQueryCall[1] as unknown[];
      const limitParam = queryParams.at(-1)!;
      expect(limitParam).toBe(51); // 50 + 1 for hasMore detection
    });

    it('should filter unread-only when unread=true', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        queryStringParameters: { unread: 'true' },
      });

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const notifQueryCall = mockDb.query.mock.calls[1];
      const queryText = notifQueryCall[0] as string;
      expect(queryText).toContain('n.read = false');
    });
  });

  // ── 4. Empty results ──────────────────────────────────────────────────

  describe('empty results', () => {
    it('should return empty list when no notifications exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });
  });

  // ── 5. Error handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when database query throws', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 429 when rate limited', async () => {
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
});
