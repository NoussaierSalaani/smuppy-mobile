/**
 * Unmute User Handler Unit Tests
 * Uses createToggleDeleteHandler factory pattern
 * Tests: 401 no auth, 400 invalid UUID, 429 rate limited, 404 profile not found, 200 success, 500 error
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

import { handler } from '../../profiles/unmute';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_TARGET_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'DELETE',
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

describe('Unmute User Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isValidUUID as jest.Mock).mockReturnValue(true);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
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
      expect(JSON.parse(response.body).message).toBe('Invalid user ID format');
    });

    it('should return 400 when target user ID is invalid UUID', async () => {
      (isValidUUID as jest.Mock).mockReturnValue(false);
      const event = makeEvent({ pathParameters: { id: 'not-a-uuid' } });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Invalid user ID format');
    });
  });

  describe('Rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      const rateLimitResponse = {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValue(rateLimitResponse);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Profile resolution', () => {
    it('should return 404 when actor profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });
  });

  describe('Happy path', () => {
    it('should return 200 with success on unmute', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE query

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
    });

    it('should execute DELETE query on muted_users table', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent();
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM muted_users'),
        [TEST_PROFILE_ID, TEST_TARGET_ID]
      );
    });

    it('should use muter_id and muted_id columns', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent();
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('muter_id'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('muted_id'),
        expect.any(Array)
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
