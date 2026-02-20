/**
 * Is Following Handler Unit Tests
 * Tests auth, validation, profile resolution, follow status (accepted, pending, none), and errors
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({ query: mockQuery }),
  getReaderPool: jest.fn().mockResolvedValue({ query: mockQuery }),
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

import { handler } from '../../profiles/is-following';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_TARGET_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_TARGET_ID },
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

// --- Tests ---

describe('Is Following Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
  });

  describe('Authentication', () => {
    it('should return 401 when no cognito sub is present', async () => {
      const event = makeEvent({ sub: null });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).message).toBe('Unauthorized');
    });
  });

  describe('Validation', () => {
    it('should return 400 when target user ID is missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Valid userId is required');
    });

    it('should return 400 when target user ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-valid' } });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Valid userId is required');
    });
  });

  describe('Profile resolution', () => {
    it('should return isFollowing=false, isPending=false, status=null when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(false);
      expect(body.isPending).toBe(false);
      expect(body.status).toBeNull();
    });
  });

  describe('Follow status', () => {
    it('should return isFollowing=true when follow status is accepted', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'follow-1', status: 'accepted' }],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(true);
      expect(body.isPending).toBe(false);
      expect(body.status).toBe('accepted');
    });

    it('should return isPending=true when follow status is pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'follow-1', status: 'pending' }],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(false);
      expect(body.isPending).toBe(true);
      expect(body.status).toBe('pending');
    });

    it('should return both false when not following', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isFollowing).toBe(false);
      expect(body.isPending).toBe(false);
      expect(body.status).toBeNull();
    });

    it('should query follows table with correct parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('follows'),
        [TEST_PROFILE_ID, TEST_TARGET_ID]
      );
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).message).toBe('Internal server error');
    });
  });
});
