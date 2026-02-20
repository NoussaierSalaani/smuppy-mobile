/**
 * WebSocket Token Handler Tests
 * Tests for generating WebSocket authentication tokens
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';
process.env.WS_TOKENS_TABLE = 'smuppy-ws-tokens-test';

// Mock DynamoDB
const mockDynamoSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({
    send: (...args: unknown[]) => mockDynamoSend(...args),
  })),
  PutItemCommand: jest.fn((params: unknown) => ({ ...params as object, _type: 'PutItemCommand' })),
}));

// Mock database
const mockDbQuery = jest.fn();
jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    query: (...args: unknown[]) => mockDbQuery(...args),
  }),
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
  getRequestId: jest.fn().mockReturnValue('test-request-id'),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: { 'X-Forwarded-For': '1.2.3.4' },
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/auth/ws-token',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub
        ? { claims: { sub: overrides.sub } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('WebSocket Token Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let requireRateLimit: jest.Mock;

  beforeAll(async () => {
    requireRateLimit = (await import('../../utils/rate-limit')).requireRateLimit as jest.Mock;
    const module = await import('../../auth/ws-token');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    requireRateLimit.mockResolvedValue(null);
  });

  describe('Authentication', () => {
    it('should return 401 when no Cognito sub is present', async () => {
      const event = makeEvent(); // no sub in authorizer
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Unauthorized');
    });
  });

  describe('Rate Limiting', () => {
    it('should return rate limit response when requireRateLimit returns a response', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Rate limited' }),
      };
      requireRateLimit.mockResolvedValue(rateLimitResponse);

      const event = makeEvent({ sub: 'cognito-sub-123' });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Profile Not Found', () => {
    it('should return 404 when profile does not exist for cognito sub', async () => {
      mockDbQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ sub: 'cognito-sub-no-profile' });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Profile not found');
    });
  });

  describe('Happy Path', () => {
    it('should create and return a WebSocket token', async () => {
      // DB query — profile found
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-uuid-1234-5678-abcd' }],
      });
      // DynamoDB PutItemCommand — success
      mockDynamoSend.mockResolvedValueOnce({});

      const event = makeEvent({ sub: 'cognito-sub-123' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
      expect(body.token.length).toBeGreaterThan(0);
      expect(body.expiresIn).toBe(300);
    });

    it('should store token in DynamoDB with correct attributes', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-uuid-stored' }],
      });
      mockDynamoSend.mockResolvedValueOnce({});

      const event = makeEvent({ sub: 'cognito-sub-store' });
      await handler(event);

      expect(mockDynamoSend).toHaveBeenCalledTimes(1);
      const putCommand = mockDynamoSend.mock.calls[0][0];
      expect(putCommand.TableName).toBe('smuppy-ws-tokens-test');
      expect(putCommand.Item.userId.S).toBe('user-uuid-stored');
      expect(putCommand.Item.cognitoSub.S).toBe('cognito-sub-store');
      expect(putCommand.Item.token.S).toBeDefined();
      expect(putCommand.Item.ttl.N).toBeDefined();
    });

    it('should query profile with correct cognito sub', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-uuid-query' }],
      });
      mockDynamoSend.mockResolvedValueOnce({});

      const event = makeEvent({ sub: 'cognito-sub-query-test' });
      await handler(event);

      expect(mockDbQuery).toHaveBeenCalledWith(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        ['cognito-sub-query-test']
      );
    });
  });

  describe('Generic Error', () => {
    it('should return 500 on database error', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const event = makeEvent({ sub: 'cognito-sub-db-error' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('An unexpected error occurred');
      // Should not leak internal error details
      expect(body.message).not.toContain('Database connection failed');
    });

    it('should return 500 on DynamoDB error', async () => {
      mockDbQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-uuid-dynamo-err' }],
      });
      mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB throttled'));

      const event = makeEvent({ sub: 'cognito-sub-dynamo-error' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).not.toContain('DynamoDB throttled');
    });
  });

  describe('Response Headers', () => {
    it('should include CORS headers', async () => {
      const event = makeEvent({ sub: 'cognito-sub-headers' });
      mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 'user-uuid' }] });
      mockDynamoSend.mockResolvedValueOnce({});

      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers!['Content-Type']).toBe('application/json');
      expect(response.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
