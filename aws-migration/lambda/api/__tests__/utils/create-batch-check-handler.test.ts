/**
 * Unit Tests: createBatchCheckHandler
 *
 * Tests the factory for batch check handlers (batch-is-liked, batch-is-saved).
 * Validates auth, body parsing, postIds array validation, UUID validation,
 * profile resolution, and batch query execution.
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
import { createBatchCheckHandler } from '../../utils/create-batch-check-handler';
import { getPool } from '../../../shared/db';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const POST_ID_1 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const POST_ID_2 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

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

describe('createBatchCheckHandler', () => {
  const config = {
    tableName: 'likes',
    responseKey: 'isLiked',
    loggerName: 'batch-is-liked',
  };

  let handler: ReturnType<typeof createBatchCheckHandler>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockedIsValidUUID.mockReturnValue(true);
    handler = createBatchCheckHandler(config);
  });

  it('should return 401 when no auth', async () => {
    const event = makeEvent({ sub: null });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 400 when body is missing', async () => {
    const event = makeEvent({ body: undefined });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request body is required');
  });

  it('should return 400 for invalid JSON body', async () => {
    const event = makeEvent({ body: 'not-valid-json{' });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON body');
  });

  it('should return 400 when postIds is not an array', async () => {
    const event = makeEvent({ body: JSON.stringify({ postIds: 'not-array' }) });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('postIds must be a non-empty array');
  });

  it('should return 400 when postIds is empty array', async () => {
    const event = makeEvent({ body: JSON.stringify({ postIds: [] }) });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('postIds must be a non-empty array');
  });

  it('should return 400 when postIds exceeds 50 items', async () => {
    const tooManyIds = Array.from({ length: 51 }, (_, i) =>
      `a1b2c3d4-e5f6-7890-abcd-ef12345678${String(i).padStart(2, '0')}`
    );
    const event = makeEvent({ body: JSON.stringify({ postIds: tooManyIds }) });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('postIds cannot exceed 50 items');
  });

  it('should return 400 when postIds contains invalid UUID', async () => {
    mockedIsValidUUID.mockImplementation((id) => id !== 'bad-uuid');
    const event = makeEvent({
      body: JSON.stringify({ postIds: [POST_ID_1, 'bad-uuid'] }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('All postIds must be valid UUIDs');
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);
    const event = makeEvent({
      body: JSON.stringify({ postIds: [POST_ID_1] }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
  });

  it('should return 200 with map of id->boolean', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ post_id: POST_ID_1 }],
    });
    const event = makeEvent({
      body: JSON.stringify({ postIds: [POST_ID_1, POST_ID_2] }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.isLiked).toEqual({
      [POST_ID_1]: true,
      [POST_ID_2]: false,
    });
  });

  it('should return all false when none matched', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const event = makeEvent({
      body: JSON.stringify({ postIds: [POST_ID_1, POST_ID_2] }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.isLiked).toEqual({
      [POST_ID_1]: false,
      [POST_ID_2]: false,
    });
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));
    const event = makeEvent({
      body: JSON.stringify({ postIds: [POST_ID_1] }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});
