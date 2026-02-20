/**
 * Creation Limits Handler Unit Tests
 * Tests auth, OPTIONS preflight, profile not found, pro unlimited,
 * personal limits, and error handling
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

import { handler } from '../../profiles/creation-limits';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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

describe('Creation Limits Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OPTIONS preflight', () => {
    it('should return 200 with empty body for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(200);
      expect(response?.body).toBe('');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when no cognito sub is present', async () => {
      const event = makeEvent({ sub: null });
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(401);
      const body = JSON.parse(response!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Unauthorized');
    });
  });

  describe('Profile not found', () => {
    it('should return 404 when profile is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // profile query

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(404);
      expect(JSON.parse(response!.body).message).toBe('Profile not found');
    });
  });

  describe('Pro account (unlimited)', () => {
    it('should return unlimited limits for pro_creator account', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID, account_type: 'pro_creator' }],
      });

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(true);
      expect(body.canCreateGroup).toBe(true);
      expect(body.maxEventsPerMonth).toBe(-1);
      expect(body.maxGroupsPerMonth).toBe(-1);
      expect(body.nextResetDate).toBeNull();
    });

    it('should return unlimited limits for pro_business account', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: TEST_PROFILE_ID, account_type: 'pro_business' }],
      });

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(true);
      expect(body.canCreateGroup).toBe(true);
      expect(body.maxEventsPerMonth).toBe(-1);
      expect(body.maxGroupsPerMonth).toBe(-1);
    });
  });

  describe('Personal account (limited)', () => {
    it('should return correct limits when under threshold', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }] }) // profile
        .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // events count
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // groups count

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(200);
      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(true);
      expect(body.canCreateGroup).toBe(true);
      expect(body.eventsThisMonth).toBe(2);
      expect(body.groupsThisMonth).toBe(1);
      expect(body.maxEventsPerMonth).toBe(4);
      expect(body.maxGroupsPerMonth).toBe(4);
      expect(body.nextResetDate).toBeDefined();
    });

    it('should return canCreateEvent=false when at limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] }) // events = limit
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // groups

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(false);
      expect(body.canCreateGroup).toBe(true);
    });

    it('should return canCreateGroup=false when at limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // events
        .mockResolvedValueOnce({ rows: [{ count: 4 }] }); // groups = limit

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(true);
      expect(body.canCreateGroup).toBe(false);
    });

    it('should return both false when both at limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: TEST_PROFILE_ID, account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // events > limit
        .mockResolvedValueOnce({ rows: [{ count: 10 }] }); // groups > limit

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      const body = JSON.parse(response!.body);
      expect(body.canCreateEvent).toBe(false);
      expect(body.canCreateGroup).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent();
      const response = await handler(event, {} as never, () => {});

      expect(response?.statusCode).toBe(500);
      const body = JSON.parse(response!.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Failed to check creation limits');
    });
  });
});
