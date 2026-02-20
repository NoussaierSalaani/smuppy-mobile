/**
 * Tests for reports/check-user-report Lambda handler
 * Validates auth, UUID validation, has/hasn't reported, profile not found, and error handling.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

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
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
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

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn((uuid: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)
  ),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
  getUserFromEvent: jest.fn(),
  requireUser: jest.fn(),
}));

import { handler } from '../../reports/check-user-report';
import { resolveProfileId } from '../../utils/auth';

// ── Constants ──

const VALID_COGNITO_SUB = 'cognito-sub-abc123';
const VALID_REPORTER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_TARGET_USER_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  userId?: string | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_COGNITO_SUB : overrides.sub;
  const userId = overrides.userId === undefined ? VALID_TARGET_USER_ID : overrides.userId;
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    pathParameters: userId !== null ? { id: userId } : null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    stageVariables: null,
    resource: '',
    path: '',
    requestContext: {
      requestId: 'test-request-id',
      authorizer: sub !== null ? { claims: { sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Test Suite ──

describe('reports/check-user-report handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (resolveProfileId as jest.Mock).mockResolvedValue(VALID_REPORTER_ID);
  });

  // ── 1. Auth ──

  describe('authentication', () => {
    it('should return 401 when no authorizer claims are present', async () => {
      const event = buildEvent({ sub: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized');
    });
  });

  // ── 2. Validation ──

  describe('validation', () => {
    it('should return 400 when user ID path parameter is missing', async () => {
      const event = buildEvent({ userId: null });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid user ID format');
    });

    it('should return 400 when user ID is not a valid UUID', async () => {
      const event = buildEvent({ userId: 'not-a-uuid' });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid user ID format');
    });
  });

  // ── 3. Profile not found (returns hasReported: false) ──

  describe('profile resolution', () => {
    it('should return hasReported: false when reporter profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasReported).toBe(false);
    });
  });

  // ── 4. User has NOT reported ──

  describe('has not reported', () => {
    it('should return hasReported: false when no report exists', async () => {
      // EXISTS query returns false
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: false }] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasReported).toBe(false);
    });
  });

  // ── 5. User HAS reported ──

  describe('has reported', () => {
    it('should return hasReported: true when a report exists', async () => {
      // EXISTS query returns true
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: true }] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.hasReported).toBe(true);
    });
  });

  // ── 6. Query uses correct parameters ──

  describe('query parameters', () => {
    it('should pass reporter_id and target user_id to the EXISTS query', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: false }] });

      const event = buildEvent({});

      await handler(event);

      // Verify the query was called with correct params
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('user_reports'),
        [VALID_REPORTER_ID, VALID_TARGET_USER_ID],
      );
    });
  });

  // ── 7. Different user IDs ──

  describe('different target users', () => {
    it('should check reports for the specific target user from path params', async () => {
      const differentUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      mockDb.query.mockResolvedValueOnce({ rows: [{ has_reported: true }] });

      const event = buildEvent({ userId: differentUserId });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).hasReported).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('user_reports'),
        [VALID_REPORTER_ID, differentUserId],
      );
    });
  });

  // ── 8. Error handling ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs during EXISTS query', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should return 500 when getPool throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
