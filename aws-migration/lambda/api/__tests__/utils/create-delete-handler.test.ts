/**
 * Unit Tests: createDeleteHandler
 *
 * Tests the factory for delete handler Lambdas.
 * Pipeline: auth -> rate limit -> UUID validation -> profile resolution
 *           -> ownership check -> transaction (custom delete logic) -> response
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
jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  MAX_REPORT_REASON_LENGTH: 500,
  MAX_REPORT_DETAILS_LENGTH: 2000,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
}));

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createDeleteHandler } from '../../utils/create-delete-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedValidateUUIDParam = validateUUIDParam as jest.MockedFunction<typeof validateUUIDParam>;
const mockedIsErrorResponse = isErrorResponse as jest.MockedFunction<typeof isErrorResponse>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_RESOURCE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_RESOURCE_ID },
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

describe('createDeleteHandler', () => {
  let mockQuery: jest.Mock;
  let mockConnect: jest.Mock;
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockOnDelete: jest.Mock;

  const baseConfig = {
    resourceName: 'Post',
    resourceTable: 'posts',
    loggerName: 'posts-delete',
    rateLimitPrefix: 'post-delete',
    rateLimitMax: 10,
    onDelete: jest.fn(),
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

    // Default: auth passes, UUID validates, rate limit passes
    mockedRequireAuth.mockReturnValue(TEST_SUB);
    mockedIsErrorResponse.mockReturnValue(false);
    mockedValidateUUIDParam.mockReturnValue(TEST_RESOURCE_ID);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);

    mockOnDelete = jest.fn().mockResolvedValue(undefined);
  });

  it('should return 401 when no auth', async () => {
    const authError: APIGatewayProxyResult = {
      statusCode: 401,
      headers: {},
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
    mockedRequireAuth.mockReturnValue(authError);
    mockedIsErrorResponse.mockImplementation((v) => typeof v !== 'string');

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(401);
  });

  it('should return 429 when rate limited', async () => {
    mockedIsErrorResponse.mockReturnValue(false);
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(429);
  });

  it('should return 400 for invalid UUID', async () => {
    const uuidError: APIGatewayProxyResult = {
      statusCode: 400,
      headers: {},
      body: JSON.stringify({ message: 'Invalid post ID format' }),
    };
    mockedValidateUUIDParam.mockReturnValue(uuidError);
    mockedIsErrorResponse.mockImplementation((v) => typeof v !== 'string');

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 404 when resource not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Post not found');
  });

  it('should return 403 when not authorized (ownership check)', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: 'other-user-id' }],
    });

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Not authorized to delete this post');
  });

  it('should use the whitelisted ownership SELECT with bound parameters', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockResolvedValue({ rows: [] });

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    await handler(makeEvent());

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, author_id FROM posts WHERE id = $1',
      [TEST_RESOURCE_ID],
    );
  });

  it('should return 200 on successful delete with transaction', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockResolvedValue({ rows: [] });

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Post deleted successfully');

    // Verify transaction flow
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockOnDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockClient,
        profileId: TEST_PROFILE_ID,
        resourceId: TEST_RESOURCE_ID,
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should call afterCommit hook after successful transaction', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockResolvedValue({ rows: [] });
    const mockAfterCommit = jest.fn().mockResolvedValue(undefined);

    const handler = createDeleteHandler({
      ...baseConfig,
      onDelete: mockOnDelete,
      afterCommit: mockAfterCommit,
    });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(mockAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: TEST_PROFILE_ID,
        resourceId: TEST_RESOURCE_ID,
      })
    );
  });

  it('should still return 200 when afterCommit hook throws', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockResolvedValue({ rows: [] });
    const mockAfterCommit = jest.fn().mockRejectedValue(new Error('S3 cleanup failed'));

    const handler = createDeleteHandler({
      ...baseConfig,
      onDelete: mockOnDelete,
      afterCommit: mockAfterCommit,
    });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
  });

  it('should ROLLBACK on transaction error and return 500', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN') return Promise.resolve();
      if (sql === 'ROLLBACK') return Promise.resolve();
      return Promise.resolve({ rows: [] });
    });
    mockOnDelete.mockRejectedValue(new Error('Transaction failed'));

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should return custom hook response when onDelete returns a result', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: TEST_PROFILE_ID }],
    });
    mockClient.query.mockResolvedValue({ rows: [] });
    const customResponse: APIGatewayProxyResult = {
      statusCode: 404,
      headers: {},
      body: JSON.stringify({ message: 'Related entity not found' }),
    };
    mockOnDelete.mockResolvedValue(customResponse);

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Related entity not found');
  });

  it('should use custom checkOwnership when provided', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: TEST_RESOURCE_ID, author_id: 'other-user' }],
    });
    const customOwnership = jest.fn().mockResolvedValue(null); // authorized

    mockClient.query.mockResolvedValue({ rows: [] });

    const handler = createDeleteHandler({
      ...baseConfig,
      onDelete: mockOnDelete,
      checkOwnership: customOwnership,
    });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(customOwnership).toHaveBeenCalled();
  });

  it('should short-circuit with 400 for unsupported resource configuration', async () => {
    const handler = createDeleteHandler({
      ...baseConfig,
      resourceTable: 'unsupported' as unknown as 'posts',
      onDelete: mockOnDelete,
    });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should return 500 on unexpected error', async () => {
    mockedGetPool.mockRejectedValue(new Error('Pool exhausted'));

    const handler = createDeleteHandler({ ...baseConfig, onDelete: mockOnDelete });
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
