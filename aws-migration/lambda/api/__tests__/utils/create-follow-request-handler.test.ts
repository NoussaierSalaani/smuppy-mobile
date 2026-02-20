/**
 * Unit Tests: createFollowRequestHandler
 *
 * Tests the factory for follow request operations (accept, decline, cancel, check-pending).
 * Flow: auth -> validate UUID param -> get DB -> resolve profile -> rate limit
 *       -> load follow request -> verify authorization role -> check status is pending
 *       -> execute onAction -> return response
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
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createFollowRequestHandler } from '../../utils/create-follow-request-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REQUESTER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const REQUEST_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
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

describe('createFollowRequestHandler', () => {
  let mockQuery: jest.Mock;
  let mockConnect: jest.Mock;
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockOnAction: jest.Mock;

  const baseConfig = {
    action: 'accept' as const,
    loggerName: 'follow-accept',
    authRole: 'target' as const,
    paramName: 'id',
    rateLimitWindow: 60,
    rateLimitMax: 30,
    onAction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockConnect = jest.fn().mockResolvedValue(mockClient);
    mockedGetPool.mockResolvedValue({
      query: mockQuery,
      connect: mockConnect,
    } as never);
    mockedIsValidUUID.mockReturnValue(true);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockOnAction = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ success: true }),
    });
  });

  it('should return 401 when no auth', async () => {
    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ sub: null }));

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(429);
  });

  it('should return 400 for invalid UUID path parameter', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: 'bad-uuid' } }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid request ID format');
  });

  it('should return 400 with "user" label when paramName is userId', async () => {
    mockedIsValidUUID.mockReturnValue(false);

    const handler = createFollowRequestHandler({
      ...baseConfig,
      paramName: 'userId',
      onAction: mockOnAction,
    });
    const result = await handler(makeEvent({ pathParameters: { userId: 'bad-uuid' } }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid user ID format');
  });

  it('should return 404 when user profile not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // profile lookup

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 404 when follow request not found (by ID)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile found
      .mockResolvedValueOnce({ rows: [] }); // follow request not found

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Follow request not found');
  });

  it('should return 403 when not authorized (target role, but user is requester)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          requester_id: TEST_PROFILE_ID, // user IS the requester
          target_id: 'someone-else',      // but config says authRole is 'target'
          status: 'pending',
        }],
      });

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Not authorized to accept this request');
  });

  it('should return 400 when request is not pending', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          requester_id: REQUESTER_ID,
          target_id: TEST_PROFILE_ID,
          status: 'accepted', // already accepted
        }],
      });

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request already accepted');
  });

  it('should return 200 on successful action (no transaction)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          requester_id: REQUESTER_ID,
          target_id: TEST_PROFILE_ID,
          status: 'pending',
        }],
      });

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(200);
    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: TEST_PROFILE_ID,
        request: expect.objectContaining({ id: REQUEST_ID }),
      })
    );
  });

  it('should wrap onAction in transaction when useTransaction is true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          requester_id: REQUESTER_ID,
          target_id: TEST_PROFILE_ID,
          status: 'pending',
        }],
      });
    mockClient.query.mockResolvedValue({ rows: [] });

    const handler = createFollowRequestHandler({
      ...baseConfig,
      useTransaction: true,
      onAction: mockOnAction,
    });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(200);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should ROLLBACK on transaction error', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] })
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          requester_id: REQUESTER_ID,
          target_id: TEST_PROFILE_ID,
          status: 'pending',
        }],
      });
    mockClient.query.mockResolvedValue({ rows: [] });
    mockOnAction.mockRejectedValue(new Error('Action failed'));

    const handler = createFollowRequestHandler({
      ...baseConfig,
      useTransaction: true,
      onAction: mockOnAction,
    });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(500);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should return 500 on unexpected error', async () => {
    mockedGetPool.mockRejectedValue(new Error('Pool error'));

    // Need profile lookup to work first, then getPool for main work
    mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] });

    const handler = createFollowRequestHandler({ ...baseConfig, onAction: mockOnAction });
    const result = await handler(makeEvent({ pathParameters: { id: REQUEST_ID } }));

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  describe('userId-based lookup (cancel/check-pending)', () => {
    const cancelConfig = {
      action: 'cancel' as const,
      loggerName: 'follow-cancel',
      authRole: 'requester' as const,
      paramName: 'userId',
      rateLimitWindow: 60,
      rateLimitMax: 30,
      onAction: jest.fn(),
    };

    it('should pass null request to onAction when no pending request found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID }] }) // profile
        .mockResolvedValueOnce({ rows: [] }); // no pending request

      const cancelOnAction = jest.fn().mockResolvedValue({
        statusCode: 200,
        headers: {},
        body: JSON.stringify({ success: true }),
      });

      const handler = createFollowRequestHandler({
        ...cancelConfig,
        onAction: cancelOnAction,
      });
      const result = await handler(makeEvent({
        pathParameters: { userId: REQUESTER_ID },
      }));

      expect(result.statusCode).toBe(200);
      expect(cancelOnAction).toHaveBeenCalledWith(
        expect.objectContaining({ request: null })
      );
    });
  });
});
