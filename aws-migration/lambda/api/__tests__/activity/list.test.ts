/**
 * Tests for activity/list Lambda handler
 * Validates activity history retrieval with type filtering,
 * cursor pagination, and UNION ALL query construction.
 */

// Mocks — must be before handler import (Jest hoists jest.mock calls)
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
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { handler } from '../../activity/list';

// --- Test data constants ---
const TEST_COGNITO_SUB = 'cognito-sub-activity-123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_TARGET_USER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeActivityRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_type: 'post_like',
    created_at: '2026-02-15T12:00:00Z',
    target_data: { postId: TEST_POST_ID, mediaUrl: 'https://media.example.com/photo.jpg', content: 'Liked post' },
    target_user: { id: TEST_TARGET_USER_ID, username: 'targetuser', fullName: 'Target User', avatarUrl: 'https://media.example.com/avatar.jpg' },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<{
  cognitoSub: string | null;
  queryStringParameters: Record<string, string> | null;
}> = {}): APIGatewayProxyEvent {
  const { cognitoSub = TEST_COGNITO_SUB, queryStringParameters = null } = overrides;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/activity',
    stageVariables: null,
    resource: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: cognitoSub ? { claims: { sub: cognitoSub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('activity/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  // ---------------------------------------------------------------
  // 1. Auth: unauthenticated returns 401
  // ---------------------------------------------------------------
  it('should return 401 when no auth token provided', async () => {
    const event = makeEvent({ cognitoSub: null });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  // ---------------------------------------------------------------
  // 2. Rate limiting
  // ---------------------------------------------------------------
  it('should return 429 when rate limited', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
    });

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(429);
    expect(JSON.parse(result.body).message).toContain('Too many requests');
  });

  // ---------------------------------------------------------------
  // 3. Invalid type filter returns 400
  // ---------------------------------------------------------------
  it('should return 400 for invalid type filter', async () => {
    const event = makeEvent({
      queryStringParameters: { type: 'invalid_type' },
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid type filter');
  });

  // ---------------------------------------------------------------
  // 4. User profile not found returns 404
  // ---------------------------------------------------------------
  it('should return 404 when user profile not found', async () => {
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  // ---------------------------------------------------------------
  // 5. Happy path: returns activities with correct shape
  // ---------------------------------------------------------------
  it('should return activities with correct camelCase shape (200)', async () => {
    const activityRow = makeActivityRow();

    mockDb.query
      .mockResolvedValueOnce({ rows: [activityRow] });             // activity query

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);

    expect(body.data).toHaveLength(1);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();

    const activity = body.data[0];
    expect(activity.activityType).toBe('post_like');
    expect(activity.createdAt).toBe('2026-02-15T12:00:00Z');
    expect(activity.targetData.postId).toBe(TEST_POST_ID);
    expect(activity.targetUser.username).toBe('targetuser');
  });

  // ---------------------------------------------------------------
  // 6. Valid type filters: post_like, peak_like, follow, comment, peak_comment
  // ---------------------------------------------------------------
  it('should accept valid type filter "post_like"', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { type: 'post_like' } });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    // Verify the activity query uses ONLY the post_like subquery
    const activitySql: string = mockDb.query.mock.calls[0][0];
    expect(activitySql).toContain("'post_like'");
    expect(activitySql).not.toContain("'follow'");
    expect(activitySql).not.toContain("'comment'");
  });

  it('should accept valid type filter "follow"', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { type: 'follow' } });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    const activitySql: string = mockDb.query.mock.calls[0][0];
    expect(activitySql).toContain("'follow'");
    expect(activitySql).not.toContain("'post_like'");
  });

  it('should accept valid type filter "peak_comment"', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { type: 'peak_comment' } });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);

    const activitySql: string = mockDb.query.mock.calls[0][0];
    expect(activitySql).toContain("'peak_comment'");
  });

  // ---------------------------------------------------------------
  // 7. Pagination: hasMore and nextCursor
  // ---------------------------------------------------------------
  it('should detect hasMore and return nextCursor when more results exist', async () => {
    // Default limit=20, so 21 rows means hasMore=true
    const rows = Array.from({ length: 21 }, (_, i) =>
      makeActivityRow({
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      })
    );

    mockDb.query
      .mockResolvedValueOnce({ rows });

    const event = makeEvent();
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    expect(body.data).toHaveLength(20);
  });

  it('should return hasMore=false when fewer results than limit', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [makeActivityRow()] });

    const event = makeEvent({ queryStringParameters: { limit: '10' } });
    const result = await handler(event);

    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  // ---------------------------------------------------------------
  // 8. Limit capped at 50
  // ---------------------------------------------------------------
  it('should cap limit at 50', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({ queryStringParameters: { limit: '200' } });
    await handler(event);

    // The activity query should have limit+1=51 in its params
    const activityCall = mockDb.query.mock.calls[0];
    const activityParams: unknown[] = activityCall[1];
    expect(activityParams).toContain(51);
  });

  // ---------------------------------------------------------------
  // 9. Cursor pagination passes timestamp
  // ---------------------------------------------------------------
  it('should pass cursor as Date parameter for pagination', async () => {
    const cursorTimestamp = Date.now() - 3600000; // 1 hour ago
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      queryStringParameters: { cursor: String(cursorTimestamp) },
    });
    await handler(event);

    // The activity query should include a Date param for cursor
    const activityParams: unknown[] = mockDb.query.mock.calls[0][1];
    const dateParam = activityParams.find(p => p instanceof Date) as Date;
    expect(dateParam).toBeDefined();
    expect(dateParam.getTime()).toBe(cursorTimestamp);
  });

  // ---------------------------------------------------------------
  // 10. No type filter: all subqueries in UNION ALL
  // ---------------------------------------------------------------
  it('should include all activity types when no type filter', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent();
    await handler(event);

    const activitySql: string = mockDb.query.mock.calls[0][0];
    expect(activitySql).toContain("'post_like'");
    expect(activitySql).toContain("'peak_like'");
    expect(activitySql).toContain("'follow'");
    expect(activitySql).toContain("'comment'");
    expect(activitySql).toContain("'peak_comment'");
    expect(activitySql).toContain('UNION ALL');
  });

  // ---------------------------------------------------------------
  // 11. Null target_data handled
  // ---------------------------------------------------------------
  it('should handle null target_data in activities', async () => {
    const followRow = makeActivityRow({
      activity_type: 'follow',
      target_data: null,
    });

    mockDb.query
      .mockResolvedValueOnce({ rows: [followRow] });

    const event = makeEvent();
    const result = await handler(event);

    const activity = JSON.parse(result.body).data[0];
    expect(activity.activityType).toBe('follow');
    expect(activity.targetData).toBeNull();
  });

  // ---------------------------------------------------------------
  // 12. DB error returns 500
  // ---------------------------------------------------------------
  it('should return 500 when database query throws', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 13. getPool failure returns 500
  // ---------------------------------------------------------------
  it('should return 500 when getPool throws', async () => {
    (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ---------------------------------------------------------------
  // 14. Activity query failure after profile lookup returns 500
  // ---------------------------------------------------------------
  it('should return 500 when activity query fails after successful profile lookup', async () => {
    mockDb.query
      .mockRejectedValueOnce(new Error('Query timeout'));          // activity query fails

    const event = makeEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
