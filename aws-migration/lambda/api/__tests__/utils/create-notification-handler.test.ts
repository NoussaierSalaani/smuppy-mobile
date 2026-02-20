/**
 * Unit Tests: withNotificationContext & createNotificationHandler
 *
 * Tests the higher-order wrapper that eliminates auth / rate-limit / profile-resolution
 * boilerplate, and the single-notification factory for mark-read / delete operations.
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
  Logger: jest.fn(),
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

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withNotificationContext, createNotificationHandler } from '../../utils/create-notification-handler';
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
const TEST_NOTIFICATION_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'PUT',
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

describe('withNotificationContext', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
  });

  const contextConfig = {
    loggerName: 'notif-test',
    rateLimitPrefix: 'notif-test',
    maxRequests: 60,
    errorLabel: 'Error in notification test',
  };

  it('should return 401 when no auth', async () => {
    const action = jest.fn();
    const handler = withNotificationContext(contextConfig, action);

    const result = await handler(makeEvent({ sub: null }));

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
    expect(action).not.toHaveBeenCalled();
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse: APIGatewayProxyResult = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);
    const action = jest.fn();
    const handler = withNotificationContext(contextConfig, action);

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(429);
    expect(action).not.toHaveBeenCalled();
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);
    const action = jest.fn();
    const handler = withNotificationContext(contextConfig, action);

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('User profile not found');
    expect(action).not.toHaveBeenCalled();
  });

  it('should call action with correct context', async () => {
    const mockResponse: APIGatewayProxyResult = {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ success: true }),
    };
    const action = jest.fn().mockResolvedValue(mockResponse);
    const handler = withNotificationContext(contextConfig, action);

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: TEST_PROFILE_ID,
        db: expect.anything(),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        log: expect.anything(),
        event: expect.anything(),
      })
    );
  });

  it('should return 500 on unexpected error', async () => {
    const action = jest.fn().mockRejectedValue(new Error('Unexpected'));
    const handler = withNotificationContext(contextConfig, action);

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });
});

describe('createNotificationHandler', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockedIsValidUUID.mockReturnValue(true);
  });

  describe('read operation', () => {
    let handler: ReturnType<typeof createNotificationHandler>;

    beforeEach(() => {
      handler = createNotificationHandler({
        operation: 'read',
        maxRequests: 60,
        loggerName: 'notif-mark-read',
        successMessage: 'Notification marked as read',
      });
    });

    it('should return 400 when notification ID is missing', async () => {
      const result = await handler(makeEvent({ pathParameters: {} }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Notification ID is required');
    });

    it('should return 400 for invalid notification UUID', async () => {
      mockedIsValidUUID.mockReturnValue(false);
      const result = await handler(makeEvent({
        pathParameters: { id: 'bad-uuid' },
      }));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid notification ID format');
    });

    it('should return 404 when notification not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await handler(makeEvent({
        pathParameters: { id: TEST_NOTIFICATION_ID },
      }));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Notification not found');
    });

    it('should return 200 on successful read', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: TEST_NOTIFICATION_ID }] });
      const result = await handler(makeEvent({
        pathParameters: { id: TEST_NOTIFICATION_ID },
      }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Notification marked as read');
    });
  });

  describe('delete operation', () => {
    let handler: ReturnType<typeof createNotificationHandler>;

    beforeEach(() => {
      handler = createNotificationHandler({
        operation: 'delete',
        maxRequests: 30,
        loggerName: 'notif-delete',
        successMessage: 'Notification deleted',
      });
    });

    it('should return 200 on successful delete', async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: TEST_NOTIFICATION_ID }] });
      const result = await handler(makeEvent({
        pathParameters: { id: TEST_NOTIFICATION_ID },
      }));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Notification deleted');
    });

    it('should return 404 when notification not found for delete', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await handler(makeEvent({
        pathParameters: { id: TEST_NOTIFICATION_ID },
      }));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Notification not found');
    });
  });
});
