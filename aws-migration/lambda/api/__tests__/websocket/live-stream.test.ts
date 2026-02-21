/**
 * Tests for websocket/live-stream Lambda handler
 * Covers: joinLive, leaveLive, liveComment, liveReaction, validation,
 *         moderation, broadcast, rate limiting, error handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/error-handler', () => ({
  hasStatusCode: jest.fn((err: unknown) =>
    typeof err === 'object' && err !== null && 'statusCode' in err && typeof (err as Record<string, unknown>).statusCode === 'number'
  ),
}));

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn(() => ({
    send: mockSend,
  })),
  PostToConnectionCommand: jest.fn((params: unknown) => params),
}));

const mockFilterText = jest.fn();
const mockAnalyzeTextToxicity = jest.fn();

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: mockFilterText,
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: mockAnalyzeTextToxicity,
}));

import { handler } from '../../../websocket/live-stream';

// ── Test constants ──

const TEST_CONNECTION_ID = 'test-conn-live-123';
const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_CHANNEL_NAME = 'live-channel-test';
const TEST_DOMAIN = 'test.execute-api.us-east-1.amazonaws.com';
const TEST_STAGE = 'production';

const TEST_USER_PROFILE = {
  id: TEST_USER_ID,
  username: 'testuser',
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
};

// ── Helpers ──

function makeWsEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      connectionId: overrides.connectionId ?? TEST_CONNECTION_ID,
      requestId: 'test-request-id',
      domainName: overrides.domainName ?? TEST_DOMAIN,
      stage: overrides.stage ?? TEST_STAGE,
    },
  } as unknown as APIGatewayProxyEvent;
}

function makeBody(action: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ action, channelName: TEST_CHANNEL_NAME, ...extra });
}

/**
 * Sets up the standard DB mock sequence for an authenticated, active user:
 *   1. websocket_connections lookup -> returns user_id
 *   2. profiles moderation_status -> returns 'active'
 *   3. profiles user data -> returns full profile
 */
function setupAuthenticatedUser(mockDb: { query: jest.Mock }): void {
  // 1. Connection lookup
  mockDb.query.mockResolvedValueOnce({
    rows: [{ user_id: TEST_USER_ID }],
  });
  // 2. Moderation status
  mockDb.query.mockResolvedValueOnce({
    rows: [{ moderation_status: 'active' }],
  });
  // 3. User profile
  mockDb.query.mockResolvedValueOnce({
    rows: [TEST_USER_PROFILE],
  });
}

// ── Test suite ──

describe('websocket/live-stream handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getPool as jest.Mock).mockResolvedValue(mockDb);

    // Default: moderation passes
    mockFilterText.mockResolvedValue({ clean: true, violations: [], severity: 'none' });
    mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', maxScore: 0, topCategory: null, categories: [] });

    // Default: broadcast succeeds
    mockSend.mockResolvedValue({});
  });

  // ── 1. Missing connectionId ──

  describe('missing connectionId', () => {
    it('should return 400 when connectionId is missing', async () => {
      const event = makeWsEvent({ connectionId: undefined });
      // Override to explicitly null out connectionId
      (event.requestContext as Record<string, unknown>).connectionId = undefined;
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No connection ID');
    });
  });

  // ── 2. Unauthenticated connection ──

  describe('unauthenticated connection', () => {
    it('should return 401 when connection is not found in DB', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('not authenticated');
    });
  });

  // ── 3. Suspended / banned user ──

  describe('moderation status checks', () => {
    it('should return 403 for a suspended user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'suspended' }] });

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('restricted');
    });

    it('should return 403 for a banned user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'banned' }] });

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('restricted');
    });
  });

  // ── 4. Invalid body / action ──

  describe('request validation', () => {
    it('should return 400 for invalid JSON body', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'active' }] });

      const event = makeWsEvent({ body: 'not-json{{{' });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid request body');
    });

    it('should return 400 for unknown action type', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'active' }] });

      const event = makeWsEvent({ body: JSON.stringify({ action: 'unknownAction', channelName: TEST_CHANNEL_NAME }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid action');
    });

    it('should return 400 when channelName is missing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'active' }] });

      const event = makeWsEvent({ body: JSON.stringify({ action: 'joinLive' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('channelName is required');
    });
  });

  // ── 5. joinLive action ──

  describe('joinLive action', () => {
    it('should insert viewer, broadcast join event, and return viewerCount', async () => {
      setupAuthenticatedUser(mockDb);
      // Insert viewer
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Viewer count
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
      // Broadcast: get viewers for channel
      mockDb.query.mockResolvedValueOnce({ rows: [{ connection_id: 'viewer-1' }, { connection_id: 'viewer-2' }] });

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('joinedLive');
      expect(body.viewerCount).toBe(5);
    });

    it('should broadcast viewerJoined event to all connected viewers', async () => {
      setupAuthenticatedUser(mockDb);
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ connection_id: 'viewer-1' }] });

      const event = makeWsEvent({ body: makeBody('joinLive') });
      await handler(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentPayload = mockSend.mock.calls[0][0];
      const sentData = JSON.parse(Buffer.from(sentPayload.Data).toString());
      expect(sentData.type).toBe('viewerJoined');
      expect(sentData.channelName).toBe(TEST_CHANNEL_NAME);
      expect(sentData.user.id).toBe(TEST_USER_ID);
    });
  });

  // ── 6. leaveLive action ──

  describe('leaveLive action', () => {
    it('should remove viewer, broadcast leave event, and return 200', async () => {
      setupAuthenticatedUser(mockDb);
      // Delete viewer
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Viewer count after leave
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '3' }] });
      // Broadcast: get viewers for channel
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeWsEvent({ body: makeBody('leaveLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).type).toBe('leftLive');
    });
  });

  // ── 7. liveComment action ──

  describe('liveComment action', () => {
    it('should broadcast comment when content passes moderation', async () => {
      setupAuthenticatedUser(mockDb);
      // Broadcast: get viewers for channel
      mockDb.query.mockResolvedValueOnce({ rows: [{ connection_id: 'viewer-1' }] });

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: 'Great stream!' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('commentSent');
      expect(body.comment.content).toBe('Great stream!');
      expect(body.comment.id).toBeDefined();
    });

    it('should return 400 when content is missing for comment', async () => {
      setupAuthenticatedUser(mockDb);

      const event = makeWsEvent({
        body: makeBody('liveComment'),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('content is required');
    });

    it('should return 400 when content is empty whitespace', async () => {
      setupAuthenticatedUser(mockDb);

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: '   ' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('content is required');
    });

    it('should block comment when text filter detects critical violation', async () => {
      setupAuthenticatedUser(mockDb);

      mockFilterText.mockResolvedValueOnce({
        clean: false,
        violations: ['slur'],
        severity: 'critical',
      });

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: 'some offensive text' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('community guidelines');
    });

    it('should block comment when text filter detects high severity violation', async () => {
      setupAuthenticatedUser(mockDb);

      mockFilterText.mockResolvedValueOnce({
        clean: false,
        violations: ['harassment'],
        severity: 'high',
      });

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: 'some harassing text' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('community guidelines');
    });

    it('should block comment when toxicity analysis returns block action', async () => {
      setupAuthenticatedUser(mockDb);

      mockFilterText.mockResolvedValueOnce({ clean: true, violations: [], severity: 'none' });
      mockAnalyzeTextToxicity.mockResolvedValueOnce({
        action: 'block',
        maxScore: 0.95,
        topCategory: 'HATE_SPEECH',
        categories: ['HATE_SPEECH'],
      });

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: 'toxic content here' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('community guidelines');
    });

    it('should sanitize HTML tags from comment content', async () => {
      setupAuthenticatedUser(mockDb);
      mockDb.query.mockResolvedValueOnce({ rows: [{ connection_id: 'viewer-1' }] });

      const event = makeWsEvent({
        body: makeBody('liveComment', { content: '<script>alert("xss")</script>Hello' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // HTML tags should be stripped
      expect(body.comment.content).not.toContain('<script>');
      expect(body.comment.content).toContain('Hello');
    });
  });

  // ── 8. liveReaction action ──

  describe('liveReaction action', () => {
    it('should broadcast reaction with valid emoji and return 200', async () => {
      setupAuthenticatedUser(mockDb);
      mockDb.query.mockResolvedValueOnce({ rows: [{ connection_id: 'viewer-1' }] });

      const event = makeWsEvent({
        body: makeBody('liveReaction', { emoji: '🔥' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.type).toBe('reactionSent');
      expect(body.reaction.emoji).toBe('🔥');
      expect(body.reaction.id).toBeDefined();
    });

    it('should return 400 when emoji is missing', async () => {
      setupAuthenticatedUser(mockDb);

      const event = makeWsEvent({
        body: makeBody('liveReaction'),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('emoji is required');
    });

    it('should return 400 when emoji is not in the allowed list', async () => {
      setupAuthenticatedUser(mockDb);

      const event = makeWsEvent({
        body: makeBody('liveReaction', { emoji: '💀' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid emoji');
    });
  });

  // ── 9. Broadcast and stale connection cleanup ──

  describe('broadcast and stale connection handling', () => {
    it('should remove stale connections (410 Gone) during broadcast', async () => {
      setupAuthenticatedUser(mockDb);
      // Join: insert viewer
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Join: viewer count
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      // Broadcast: viewer list
      mockDb.query.mockResolvedValueOnce({
        rows: [{ connection_id: 'stale-conn' }, { connection_id: 'active-conn' }],
      });
      // Stale conn cleanup DELETE
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // First send fails with 410 (stale connection)
      const goneError = { statusCode: 410, message: 'Gone' };
      mockSend
        .mockRejectedValueOnce(goneError)
        .mockResolvedValueOnce({});

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify the stale connection was cleaned up
      const deleteCall = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('DELETE FROM live_stream_viewers') && (call[1] as string[])[0] === 'stale-conn'
      );
      expect(deleteCall).toBeDefined();
    });
  });

  // ── 10. Rate limiting ──

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      // Exhaust rate limit by calling handler many times rapidly
      // The internal rate limiter allows 30 messages per 10 seconds per connectionId
      // We use a unique connectionId to avoid interference from other tests
      const rateLimitConnId = 'rate-limit-test-conn-' + Date.now();

      for (let i = 0; i < 31; i++) {
        // Each call needs fresh DB mocks since previous ones get consumed
        mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: TEST_USER_ID }] });
        mockDb.query.mockResolvedValueOnce({ rows: [{ moderation_status: 'active' }] });
        mockDb.query.mockResolvedValueOnce({ rows: [TEST_USER_PROFILE] });
        // For joinLive: insert, count, broadcast viewers
        mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
        mockDb.query.mockResolvedValueOnce({ rows: [] });
      }

      let lastResult;
      for (let i = 0; i < 31; i++) {
        const event = makeWsEvent({
          connectionId: rateLimitConnId,
          body: makeBody('joinLive'),
        });
        lastResult = await handler(event);
      }

      expect(lastResult!.statusCode).toBe(429);
    });
  });

  // ── 11. General error handling ──

  describe('error handling', () => {
    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when DB query throws unexpectedly', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Unexpected DB error'));

      const event = makeWsEvent({ body: makeBody('joinLive') });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
