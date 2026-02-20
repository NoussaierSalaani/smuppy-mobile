/**
 * Unit Tests: createToggleDeleteHandler & createToggleListHandler
 *
 * Tests the factory functions for toggle operations (block/unblock, mute/unmute).
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

import { APIGatewayProxyEvent } from 'aws-lambda';
import { createToggleDeleteHandler, createToggleListHandler } from '../../utils/create-toggle-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TARGET_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
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

describe('createToggleDeleteHandler', () => {
  const deleteConfig = {
    loggerName: 'profiles-unblock',
    tableName: 'blocked_users',
    actorColumn: 'blocker_id',
    targetColumn: 'blocked_id',
    rateLimitPrefix: 'unblock-user',
    rateLimitMax: 10,
    errorMessage: 'Error unblocking user',
  };

  let handler: ReturnType<typeof createToggleDeleteHandler>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedIsValidUUID.mockReturnValue(true);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    handler = createToggleDeleteHandler(deleteConfig);
  });

  it('should return 401 when no auth', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 400 for invalid UUID path parameter', async () => {
    mockedIsValidUUID.mockReturnValue(false);
    const event = makeEvent({ pathParameters: { id: 'bad-uuid' } });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid user ID format');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);
    const event = makeEvent({ pathParameters: { id: TARGET_USER_ID } });

    const result = await handler(event);

    expect(result.statusCode).toBe(429);
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);
    const event = makeEvent({ pathParameters: { id: TARGET_USER_ID } });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 200 on successful delete', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const event = makeEvent({ pathParameters: { id: TARGET_USER_ID } });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM blocked_users'),
      [TEST_PROFILE_ID, TARGET_USER_ID]
    );
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const event = makeEvent({ pathParameters: { id: TARGET_USER_ID } });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});

describe('createToggleListHandler', () => {
  const listConfig = {
    loggerName: 'profiles-get-blocked',
    tableAlias: 'bu',
    tableName: 'blocked_users',
    actorColumn: 'blocker_id',
    targetColumn: 'blocked_id',
    mapRow: (row: Record<string, unknown>) => ({
      id: row.id,
      targetUserId: row.target_user_id,
    }),
    errorMessage: 'Error getting blocked users',
  };

  let handler: ReturnType<typeof createToggleListHandler>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    handler = createToggleListHandler(listConfig);
  });

  it('should return 401 when no auth', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);
    const event = makeEvent();

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 200 with mapped list data', async () => {
    const rows = [
      { id: 'row-1', target_user_id: 'user-1', 'target_user.username': 'alice' },
      { id: 'row-2', target_user_id: 'user-2', 'target_user.username': 'bob' },
    ];
    mockQuery.mockResolvedValue({ rows });
    const event = makeEvent();

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toEqual([
      { id: 'row-1', targetUserId: 'user-1' },
      { id: 'row-2', targetUserId: 'user-2' },
    ]);
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));
    const event = makeEvent();

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
