/**
 * Unit Tests: createFollowListHandler
 *
 * Tests the factory for follow list handlers (followers / following).
 * Flow: validate profile ID -> UUID check -> rate limit -> pagination ->
 *       check profile exists -> privacy check -> query with pagination -> format response.
 */

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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  MAX_REPORT_REASON_LENGTH: 500,
  MAX_REPORT_DETAILS_LENGTH: 2000,
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createFollowListHandler } from '../../utils/create-follow-list-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { checkPrivacyAccess } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedCheckPrivacyAccess = checkPrivacyAccess as jest.MockedFunction<typeof checkPrivacyAccess>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const FOLLOWER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

function makeFollowerRow(id: string, username: string, followedAt: string) {
  return {
    id,
    username,
    full_name: `${username} name`,
    avatar_url: `https://example.com/${username}.jpg`,
    bio: 'Test bio',
    is_verified: false,
    account_type: 'personal',
    business_name: null,
    display_name: null,
    cover_url: null,
    is_private: false,
    fan_count: 10,
    following_count: 20,
    post_count: 5,
    followed_at: followedAt,
    total_count: '2',
  };
}

describe('createFollowListHandler', () => {
  const followersConfig = {
    loggerName: 'profiles-followers',
    joinColumn: 'follower_id' as const,
    whereColumn: 'following_id' as const,
    responseKey: 'followers',
    errorMessage: 'Error getting followers',
  };

  let handler: ReturnType<typeof createFollowListHandler>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedIsValidUUID.mockReturnValue(true);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedCheckPrivacyAccess.mockResolvedValue(true);
    handler = createFollowListHandler(followersConfig);
  });

  it('should return 400 when profile ID is missing', async () => {
    const result = await handler(makeEvent({ pathParameters: {} }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Profile ID is required');
  });

  it('should return 400 for invalid UUID format', async () => {
    mockedIsValidUUID.mockReturnValue(false);
    const result = await handler(makeEvent({
      pathParameters: { id: 'bad-uuid' },
    }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid profile ID format');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(429);
  });

  it('should return 404 when profile not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // profile lookup

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 403 for private account when no access', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, username: 'private_user', is_private: true }],
    });
    mockedCheckPrivacyAccess.mockResolvedValue(false);

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('This account is private');
  });

  it('should return 200 with followers list and pagination', async () => {
    const followedAt1 = '2025-01-15T10:00:00.000Z';
    const followedAt2 = '2025-01-14T10:00:00.000Z';

    // Profile exists (public)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, username: 'testuser', is_private: false }],
    });
    // Followers query
    mockQuery.mockResolvedValueOnce({
      rows: [
        makeFollowerRow(FOLLOWER_ID, 'alice', followedAt1),
        makeFollowerRow('user-2', 'bob', followedAt2),
      ],
    });

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.followers).toHaveLength(2);
    expect(body.followers[0].username).toBe('alice');
    expect(body.followers[0].fullName).toBe('alice name');
    expect(body.followers[0].followersCount).toBe(10);
    expect(body.followers[0].followingCount).toBe(20);
    expect(body.hasMore).toBe(false);
    expect(body.totalCount).toBe(2);
  });

  it('should support cursor-based pagination', async () => {
    const cursorTimestamp = new Date('2025-01-14T10:00:00.000Z').getTime().toString();

    // Profile exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, username: 'testuser', is_private: false }],
    });
    // Followers query with cursor
    mockQuery.mockResolvedValueOnce({
      rows: [makeFollowerRow('user-3', 'charlie', '2025-01-13T10:00:00.000Z')],
    });

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
      queryStringParameters: { cursor: cursorTimestamp, limit: '10' },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.followers).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });

  it('should detect hasMore when results exceed limit', async () => {
    // Profile exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, username: 'testuser', is_private: false }],
    });

    // Return limit+1 rows to trigger hasMore
    // With default limit 20, we'd need 21 rows, but let's use a custom limit
    // The query uses limit+1, so 3 rows with limit=2 means hasMore=true
    const rows = [
      makeFollowerRow('u1', 'alice', '2025-01-15T10:00:00.000Z'),
      makeFollowerRow('u2', 'bob', '2025-01-14T10:00:00.000Z'),
      makeFollowerRow('u3', 'charlie', '2025-01-13T10:00:00.000Z'),
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
      queryStringParameters: { limit: '2' },
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.followers).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.cursor).not.toBeNull();
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should allow access to private account for owner/follower', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, username: 'private_user', is_private: true }],
    });
    mockedCheckPrivacyAccess.mockResolvedValue(true);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // followers query

    const result = await handler(makeEvent({
      pathParameters: { id: TEST_PROFILE_ID },
    }));

    expect(result.statusCode).toBe(200);
    expect(mockedCheckPrivacyAccess).toHaveBeenCalledWith(
      expect.anything(),
      TEST_PROFILE_ID,
      TEST_SUB,
    );
  });
});
