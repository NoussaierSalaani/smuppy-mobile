/**
 * Tests for notifications/push-token Lambda handler
 * Covers: auth, rate limiting, input validation (POST + DELETE), profile not found,
 *         happy path (POST ios/android/expo, DELETE), SNS integration, DB errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Set platform ARNs BEFORE the handler module loads (reads env at module level)
process.env.IOS_PLATFORM_APPLICATION_ARN = 'arn:aws:sns:eu-west-3:123456789:app/APNS/smuppy-ios';
process.env.ANDROID_PLATFORM_APPLICATION_ARN = 'arn:aws:sns:eu-west-3:123456789:app/GCM/smuppy-android';

import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

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
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/error-handler', () => ({
  isNamedError: jest.fn((error: unknown): error is { name: string; message: string } => {
    return typeof error === 'object' && error !== null && 'name' in error;
  }),
  withErrorHandler: jest.fn((name: string, fn: Function) => {
    const { createHeaders } = require('../../utils/cors');
    const { createLogger } = require('../../utils/logger');
    return async (event: Record<string, unknown>) => {
      const log = createLogger(name);
      log.initFromEvent(event);
      const headers = createHeaders(event);
      try {
        return await fn(event, { headers, log });
      } catch (error: unknown) {
        log.error('Handler error', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ message: 'Internal server error' }),
        };
      }
    };
  }),
}));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({ send: mockSend })),
  CreatePlatformEndpointCommand: jest.fn((params: unknown) => ({ input: params, _type: 'CreatePlatformEndpointCommand' })),
  SetEndpointAttributesCommand: jest.fn((params: unknown) => ({ input: params, _type: 'SetEndpointAttributesCommand' })),
  DeleteEndpointCommand: jest.fn((params: unknown) => ({ input: params, _type: 'DeleteEndpointCommand' })),
}));

import { handler } from '../../notifications/push-token';

// ── Test constants ───────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_DEVICE_ID = 'device-abc-123';
const TEST_PUSH_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxx]';
const TEST_SNS_ARN = 'arn:aws:sns:eu-west-3:123456789:endpoint/APNS/myapp/abc-def';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
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

// ── Test suite ───────────────────────────────────────────────────────────

describe('notifications/push-token handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = { query: jest.fn() };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    mockSend.mockResolvedValue({ EndpointArn: TEST_SNS_ARN });
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('should reject unauthenticated POST requests with 401', async () => {
      const event = makeEvent({
        sub: null,
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });

    it('should reject unauthenticated DELETE requests with 401', async () => {
      const event = makeEvent({
        sub: null,
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Rate limiting ────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('should return 429 when POST is rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });

    it('should return 429 when DELETE is rate limited', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).message).toContain('Too many requests');
    });
  });

  // ── 3. POST — Input validation ──────────────────────────────────────

  describe('POST — input validation', () => {
    it('should return 400 when token is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Push token is required');
    });

    it('should return 400 when token is empty string', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: '   ', deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Push token is required');
    });

    it('should return 400 when token is not a string', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: 123, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Push token is required');
    });

    it('should return 400 when deviceId is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Device ID is required');
    });

    it('should return 400 when deviceId is not a string', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: 123, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Device ID is required');
    });

    it('should return 400 for invalid platform', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'windows' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid platform');
    });
  });

  // ── 4. POST — Profile not found ─────────────────────────────────────

  describe('POST — profile not found', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // ── 5. POST — Happy path ───────────────────────────────────────────

  describe('POST — happy path', () => {
    it('should register push token for iOS and return snsEnabled=true', async () => {
      // SNS createEndpoint mock already returns TEST_SNS_ARN in beforeEach
      // The handler calls send twice: CreatePlatformEndpointCommand + SetEndpointAttributesCommand
      mockSend
        .mockResolvedValueOnce({ EndpointArn: TEST_SNS_ARN })  // CreatePlatformEndpointCommand
        .mockResolvedValueOnce({});  // SetEndpointAttributesCommand

      // DB upsert
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Push token registered successfully');
      expect(body.snsEnabled).toBe(true);
    });

    it('should register push token for Android and return snsEnabled=true', async () => {
      mockSend
        .mockResolvedValueOnce({ EndpointArn: TEST_SNS_ARN })
        .mockResolvedValueOnce({});

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'android' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.snsEnabled).toBe(true);
    });

    it('should register push token for Expo without SNS (snsEnabled=false)', async () => {
      // Expo platform should NOT create SNS endpoint
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'expo' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.snsEnabled).toBe(false);

      // SNS should NOT be called for expo platform
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should register push token without platform specified (defaults to unknown)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.snsEnabled).toBe(false);
    });

    it('should normalize platform to lowercase', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'Web' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Should have stored 'web' as platform
      const queryCall = mockDb.query.mock.calls[0];
      const queryParams = queryCall[1] as unknown[];
      expect(queryParams[2]).toBe('web');
    });

    it('should trim the push token before storing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: '  ' + TEST_PUSH_TOKEN + '  ', deviceId: TEST_DEVICE_ID, platform: 'expo' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify trimmed token in DB query
      const queryCall = mockDb.query.mock.calls[0];
      const queryParams = queryCall[1] as unknown[];
      expect(queryParams[1]).toBe(TEST_PUSH_TOKEN);
    });

    it('should execute UPSERT query with ON CONFLICT on (user_id, device_id)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'expo' }),
      });
      await handler(event);

      const queryCall = mockDb.query.mock.calls[0];
      const queryText = queryCall[0] as string;
      expect(queryText).toContain('INSERT INTO push_tokens');
      expect(queryText).toContain('ON CONFLICT (user_id, device_id)');
      expect(queryText).toContain('DO UPDATE SET');
    });
  });

  // ── 6. DELETE — Input validation ────────────────────────────────────

  describe('DELETE — input validation', () => {
    it('should return 400 when deviceId path parameter is missing', async () => {
      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: null,
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Device ID is required');
    });
  });

  // ── 7. DELETE — Happy path ──────────────────────────────────────────

  describe('DELETE — happy path', () => {
    it('should delete push token and SNS endpoint when ARN exists', async () => {
      // First query: get token with SNS ARN
      mockDb.query.mockResolvedValueOnce({
        rows: [{ sns_endpoint_arn: TEST_SNS_ARN }],
      });
      // Second query: delete from push_tokens
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // SNS delete endpoint
      mockSend.mockResolvedValueOnce({});

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Push token unregistered');
    });

    it('should delete push token without SNS when no ARN exists', async () => {
      // First query: get token without SNS ARN
      mockDb.query.mockResolvedValueOnce({
        rows: [{ sns_endpoint_arn: null }],
      });
      // Second query: delete from push_tokens
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);

      // SNS should NOT be called when no ARN
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should still delete from DB even when no token row is found', async () => {
      // First query: no token found
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Second query: delete from push_tokens (no-op)
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle SNS delete endpoint failure gracefully', async () => {
      // First query: get token with SNS ARN
      mockDb.query.mockResolvedValueOnce({
        rows: [{ sns_endpoint_arn: TEST_SNS_ARN }],
      });
      // Second query: delete from push_tokens
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // SNS delete fails
      mockSend.mockRejectedValueOnce(new Error('SNS endpoint not found'));

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      // Should still return 200 even if SNS delete fails
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
    });
  });

  // ── 8. Error handling ──────────────────────────────────────────────

  describe('error handling', () => {
    it('should return 500 when database query throws on POST', async () => {
      (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when database query throws on DELETE', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { deviceId: TEST_DEVICE_ID },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool() rejects', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ token: TEST_PUSH_TOKEN, deviceId: TEST_DEVICE_ID, platform: 'ios' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when body JSON parsing fails', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: '{invalid json',
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
