/**
 * Tests for reports/check-post-report Lambda handler
 * Checks if the current user has already reported a specific post.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

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

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

import { handler } from '../../reports/check-post-report';
import { resolveProfileId } from '../../utils/auth';

const TEST_SUB = 'cognito-sub-test123';
const VALID_POST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  let sub: string | null = TEST_SUB;
  if (overrides.sub === null) sub = null;
  else if (overrides.sub !== undefined) sub = overrides.sub as string;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: VALID_POST_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: sub !== null ? { claims: { sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('reports/check-post-report handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_PROFILE_ID);
  });

  describe('authentication', () => {
    it('should return 401 when no auth', async () => {
      const result = await handler(makeEvent({ sub: null }));
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('should return 400 when post ID is missing', async () => {
      const result = await handler(makeEvent({ pathParameters: {} }));
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid post ID format');
    });

    it('should return 400 when post ID is not a valid UUID', async () => {
      const result = await handler(makeEvent({ pathParameters: { id: 'not-uuid' } }));
      expect(result.statusCode).toBe(400);
    });
  });

  describe('profile resolution', () => {
    it('should return 200 with hasReported=false when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).hasReported).toBe(false);
    });
  });

  describe('happy path', () => {
    it('should return hasReported=true when user has reported the post', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: true }] });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).hasReported).toBe(true);
    });

    it('should return hasReported=false when user has not reported the post', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: false }] });
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).hasReported).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('DB error'));
      const result = await handler(makeEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
