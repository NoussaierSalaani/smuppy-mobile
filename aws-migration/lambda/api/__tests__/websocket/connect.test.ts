/**
 * Tests for websocket/connect Lambda handler
 * Covers: JWT auth, token via header/query, profile lookup, DB storage, error handling
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

const mockVerify = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: mockVerify,
    })),
  },
}));

import { handler } from '../../../websocket/connect';

// ── Test constants ──

const TEST_CONNECTION_ID = 'test-conn-connect-123';
const TEST_USER_SUB = 'cognito-sub-abcdef123456';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_JWT_TOKEN = 'valid.jwt.token';

// ── Helpers ──

function makeWsEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const headers = overrides.headers as Record<string, string> ?? {};
  const queryStringParameters = overrides.queryStringParameters as Record<string, string> ?? null;

  return {
    httpMethod: 'GET',
    headers,
    body: null,
    queryStringParameters,
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
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      stage: 'production',
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('websocket/connect handler', () => {
  let mockDb: { query: jest.Mock };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn() };
    (getPool as jest.Mock).mockResolvedValue(mockDb);

    // Set required env vars
    process.env = {
      ...originalEnv,
      USER_POOL_ID: 'us-east-1_TestPoolId',
      CLIENT_ID: 'test-client-id-123',
    };

    // Default: successful token verification
    mockVerify.mockResolvedValue({ sub: TEST_USER_SUB });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── 1. Successful connection via Sec-WebSocket-Protocol header ──

  describe('successful connection', () => {
    it('should store connection in DB and return 200 with valid JWT via header', async () => {
      // Profile lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      // Connection insert
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Connected');
    });

    it('should pass connectionId and profileId to the INSERT query', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      await handler(event);

      // Second query is the INSERT
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const insertCall = mockDb.query.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO websocket_connections');
      expect(insertCall[1]).toEqual([TEST_CONNECTION_ID, TEST_PROFILE_ID]);
    });

    it('should accept token via deprecated query string parameter', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID }],
      });
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeWsEvent({
        queryStringParameters: { token: TEST_JWT_TOKEN },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Connected');
    });
  });

  // ── 2. Missing token ──

  describe('missing auth token', () => {
    it('should return 401 when no token is provided', async () => {
      const event = makeWsEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Unauthorized');
      expect(JSON.parse(result.body).message).toContain('No token');
    });

    it('should return 401 when header has access-token keyword but no actual token', async () => {
      // 'access-token' is the last element — no token follows it
      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': 'access-token' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Unauthorized');
    });
  });

  // ── 3. Invalid / expired JWT ──

  describe('invalid or expired JWT', () => {
    it('should return 401 when token verification fails', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Token expired'));

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Unauthorized');
      expect(JSON.parse(result.body).message).toContain('Invalid token');
    });

    it('should return 401 when token has invalid signature', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Invalid signature'));

      const event = makeWsEvent({
        queryStringParameters: { token: 'tampered.jwt.token' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toContain('Invalid token');
    });
  });

  // ── 4. Profile not found ──

  describe('profile not found', () => {
    it('should return 404 when user profile does not exist in DB', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('User profile not found');
    });
  });

  // ── 5. Missing CLIENT_ID env var ──

  describe('server configuration', () => {
    it('should return 500 when CLIENT_ID is not configured', async () => {
      delete process.env.CLIENT_ID;

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toContain('Server configuration error');
    });
  });

  // ── 6. DB error handling ──

  describe('error handling', () => {
    it('should return 500 when DB query throws during profile lookup', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeWsEvent({
        headers: { 'Sec-WebSocket-Protocol': `access-token, ${TEST_JWT_TOKEN}` },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
