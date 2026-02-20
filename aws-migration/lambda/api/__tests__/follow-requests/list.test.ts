/**
 * Tests for follow-requests/list Lambda handler
 * Standalone handler — lists pending follow requests with pagination.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──

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

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../follow-requests/list';

// ── Test constants ──

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const REQUESTER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const REQUEST_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const NOW = new Date('2026-02-19T12:00:00Z');

// ── Helpers ──

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
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

// ── Test suite ──

describe('follow-requests/list handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);

    // Default: profile exists, one follow request
    mockDb.query.mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
        return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
      }
      if (typeof sql === 'string' && sql.includes('FROM follow_requests fr')) {
        return Promise.resolve({
          rows: [{
            id: REQUEST_ID,
            created_at: NOW,
            requester_id: REQUESTER_ID,
            requester_username: 'requester1',
            requester_full_name: 'Requester One',
            requester_avatar_url: 'https://example.com/avatar.jpg',
            requester_bio: 'Hello!',
            requester_is_verified: false,
            requester_account_type: 'personal',
            requester_business_name: null,
            total_count: '1',
          }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Not found ──

  describe('not found', () => {
    it('should return 404 when user profile is not found', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User profile not found');
    });
  });

  // ── 3. Happy path ──

  describe('happy path', () => {
    it('should return 200 with formatted follow requests', async () => {
      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.requests).toBeDefined();
      expect(body.requests).toHaveLength(1);
      expect(body.requests[0].id).toBe(REQUEST_ID);
    });

    it('should include formatted requester data', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      const request = body.requests[0];
      expect(request.requester).toBeDefined();
      expect(request.requester.id).toBe(REQUESTER_ID);
      expect(request.requester.username).toBe('requester1');
      expect(request.requester.fullName).toBe('Requester One');
      expect(request.requester.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(request.requester.bio).toBe('Hello!');
      expect(request.requester.isVerified).toBe(false);
      expect(request.requester.accountType).toBe('personal');
      expect(request.requester.businessName).toBeNull();
    });

    it('should return hasMore=false when results fit in one page', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(false);
      expect(body.cursor).toBeNull();
    });

    it('should return totalPending from window function', async () => {
      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.totalPending).toBe(1);
    });

    it('should return hasMore=true and cursor when there are more results', async () => {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i <= 20; i++) {
        rows.push({
          id: `request-${i}`,
          created_at: new Date(NOW.getTime() - i * 1000),
          requester_id: `requester-${i}`,
          requester_username: `user${i}`,
          requester_full_name: `User ${i}`,
          requester_avatar_url: null,
          requester_bio: null,
          requester_is_verified: false,
          requester_account_type: 'personal',
          requester_business_name: null,
          total_count: '25',
        });
      }

      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follow_requests fr')) {
          return Promise.resolve({ rows });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.hasMore).toBe(true);
      expect(body.cursor).toBeDefined();
      expect(body.requests).toHaveLength(20);
      expect(body.totalPending).toBe(25);
    });

    it('should support cursor-based pagination', async () => {
      const event = makeEvent({
        queryStringParameters: { cursor: String(NOW.getTime()), limit: '10' },
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should cap limit at 50', async () => {
      const event = makeEvent({
        queryStringParameters: { limit: '100' },
      });
      await handler(event);

      const listQuery = mockDb.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('FROM follow_requests fr'),
      );
      expect(listQuery).toBeDefined();
      const params = listQuery![1] as unknown[];
      expect(params.at(-1)!).toBe(51); // limit + 1
    });

    it('should return empty results with totalPending=0', async () => {
      mockDb.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT id FROM profiles WHERE cognito_sub')) {
          return Promise.resolve({ rows: [{ id: TEST_PROFILE_ID }] });
        }
        if (typeof sql === 'string' && sql.includes('FROM follow_requests fr')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const event = makeEvent();
      const result = await handler(event);

      const body = JSON.parse(result.body);
      expect(body.requests).toHaveLength(0);
      expect(body.totalPending).toBe(0);
      expect(body.hasMore).toBe(false);
    });
  });

  // ── 4. Database errors ──

  describe('database errors', () => {
    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when db.query throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Query timeout'));

      const event = makeEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
