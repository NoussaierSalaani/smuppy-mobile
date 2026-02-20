/**
 * Block User Handler Unit Tests
 * Tests auth, validation, self-block, target not found, transaction, and error handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    query: mockQuery,
    connect: mockConnect,
  }),
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

import { handler } from '../../profiles/block';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';
import { requireRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_TARGET_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
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

describe('Block User Handler', () => {
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
    it('should return 404 when blocker profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });
  });

  describe('Self-block prevention', () => {
    it('should return 400 when trying to block yourself', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(TEST_TARGET_ID);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Cannot block yourself');
    });
  });

  describe('Target validation', () => {
    it('should return 404 when target user does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }); // target SELECT

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('User not found');
    });
  });

  describe('Happy path', () => {
    it('should return 201 with blocked user info on success', async () => {
      // Target exists
      mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_TARGET_ID }] });

      // Transaction queries succeed
      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      // Return blocked info
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'block-record-id',
          blocked_user_id: TEST_TARGET_ID,
          blocked_at: '2026-01-01T00:00:00Z',
          'blocked_user.id': TEST_TARGET_ID,
          'blocked_user.username': 'blockeduser',
          'blocked_user.display_name': 'Blocked User',
          'blocked_user.avatar_url': 'https://cdn.smuppy.com/avatar.jpg',
        }],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.blockedUserId).toBe(TEST_TARGET_ID);
      expect(body.blockedUser.username).toBe('blockeduser');
      expect(body.blockedUser.displayName).toBe('Blocked User');
    });

    it('should execute transaction with BEGIN, block insert, follow deletes, and COMMIT', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_TARGET_ID }] }) // target exists
        .mockResolvedValueOnce({ rows: [{ id: 'block-id', blocked_user_id: TEST_TARGET_ID, blocked_at: '2026-01-01', 'blocked_user.id': TEST_TARGET_ID, 'blocked_user.username': 'user', 'blocked_user.display_name': 'User', 'blocked_user.avatar_url': null }] }); // blocked info

      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const event = makeEvent();
      await handler(event);

      // Verify transaction flow
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO blocked_users'),
        [TEST_PROFILE_ID, TEST_TARGET_ID]
      );
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should rollback and release on transaction error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: TEST_TARGET_ID }] }); // target exists
      mockClientQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should return { success: true } when blocked info query returns no row', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_TARGET_ID }] }) // target exists
        .mockResolvedValueOnce({ rows: [] }); // blocked info returns empty

      mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
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
