/**
 * Get Blocked Users Handler Unit Tests
 * Uses createToggleListHandler factory pattern
 * Tests: 401 no auth, 404 profile not found, 200 returns list, mapRow, 500 error
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

import { handler } from '../../profiles/get-blocked';
import { resolveProfileId } from '../../utils/auth';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_BLOCKED_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
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

// --- Tests ---

describe('Get Blocked Users Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('Profile resolution', () => {
    it('should return 404 when user profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });
  });

  describe('Happy path', () => {
    it('should return 200 with blocked users list', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'block-record-1',
            target_user_id: TEST_BLOCKED_USER_ID,
            action_at: '2026-01-01T00:00:00Z',
            'target_user.id': TEST_BLOCKED_USER_ID,
            'target_user.username': 'blockeduser1',
            'target_user.display_name': 'Blocked User 1',
            'target_user.avatar_url': 'https://cdn.smuppy.com/avatar1.jpg',
          },
        ],
      });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].blocked_user_id).toBe(TEST_BLOCKED_USER_ID);
      expect(body.data[0].blocked_at).toBe('2026-01-01T00:00:00Z');
      expect(body.data[0].blocked_user.username).toBe('blockeduser1');
      expect(body.data[0].blocked_user.display_name).toBe('Blocked User 1');
    });

    it('should return empty data array when no blocked users', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(0);
    });

    it('should query blocked_users table with blocker_id filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('blocked_users'),
        [TEST_PROFILE_ID]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('blocker_id'),
        expect.any(Array)
      );
    });

    it('should join with profiles table for blocked user info', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN profiles'),
        expect.any(Array)
      );
    });

    it('should return multiple blocked users with correct mapping', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'block-1', target_user_id: 'user-1', action_at: '2026-01-01T00:00:00Z',
            'target_user.id': 'user-1', 'target_user.username': 'user1',
            'target_user.display_name': 'User One', 'target_user.avatar_url': null,
          },
          {
            id: 'block-2', target_user_id: 'user-2', action_at: '2026-01-02T00:00:00Z',
            'target_user.id': 'user-2', 'target_user.username': 'user2',
            'target_user.display_name': 'User Two', 'target_user.avatar_url': 'https://cdn.smuppy.com/a.jpg',
          },
        ],
      });

      const event = makeEvent();
      const response = await handler(event);

      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].blocked_user.id).toBe('user-1');
      expect(body.data[1].blocked_user.id).toBe('user-2');
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
