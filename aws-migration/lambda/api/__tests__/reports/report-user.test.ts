/**
 * Tests for reports/report-user Lambda handler
 * Validates auth, validation, can't report self, duplicate check, sanitization, and error handling.
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

jest.mock('../../../shared/moderation/autoEscalation', () => ({
  checkUserEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
  checkPostEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
  checkPeakEscalation: jest.fn().mockResolvedValue({ action: 'none' }),
}));

import { handler } from '../../reports/report-user';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { checkUserEscalation } from '../../../shared/moderation/autoEscalation';

// ── Constants ──

const VALID_COGNITO_SUB = 'cognito-sub-abc123';
const VALID_REPORTER_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_TARGET_USER_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const VALID_REPORT_ID = 'e5f6a7b8-c9d0-1234-efab-345678901234';

// ── Helpers ──

function buildEvent(overrides: {
  sub?: string | null;
  body?: Record<string, unknown> | null;
} = {}): APIGatewayProxyEvent {
  const sub = overrides.sub === undefined ? VALID_COGNITO_SUB : overrides.sub;
  const body = overrides.body === undefined
    ? { userId: VALID_TARGET_USER_ID, reason: 'harassment', details: 'Sending threatening messages' }
    : overrides.body;
  return {
    httpMethod: 'POST',
    headers: {},
    body: body !== null ? JSON.stringify(body) : null,
    pathParameters: null,
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

describe('reports/report-user handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
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

  // ── 2. Rate limiting ──

  describe('rate limiting', () => {
    it('should return rate limit response when limit is exceeded', async () => {
      const rateLimitResp = {
        statusCode: 429,
        headers: {},
        body: JSON.stringify({ message: 'Too many requests' }),
      };
      (requireRateLimit as jest.Mock).mockResolvedValueOnce(rateLimitResp);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(429);
    });
  });

  // ── 3. Validation ──

  describe('validation', () => {
    it('should return 400 when userId is missing', async () => {
      const event = buildEvent({ body: { reason: 'spam' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid user ID format');
    });

    it('should return 400 when userId is not a valid UUID', async () => {
      const event = buildEvent({ body: { userId: 'bad-uuid', reason: 'spam' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid user ID format');
    });

    it('should return 400 when reason is missing', async () => {
      const event = buildEvent({ body: { userId: VALID_TARGET_USER_ID } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Reason is required');
    });

    it('should return 400 when reason is empty whitespace', async () => {
      const event = buildEvent({ body: { userId: VALID_TARGET_USER_ID, reason: '   ' } });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Reason is required');
    });
  });

  // ── 4. Profile not found ──

  describe('profile resolution', () => {
    it('should return 404 when reporter profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Profile not found');
    });
  });

  // ── 5. Cannot report self ──

  describe('self-report prevention', () => {
    it('should return 400 when user tries to report themselves', async () => {
      // Reporter's profile ID equals the userId in the body
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(VALID_TARGET_USER_ID);

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Cannot report yourself');
    });
  });

  // ── 6. Target user not found ──

  describe('target user existence', () => {
    it('should return 404 when target user does not exist', async () => {
      // Target profile lookup returns empty
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User not found');
    });
  });

  // ── 7. Duplicate report ──

  describe('duplicate check', () => {
    it('should return 409 when user has already reported this user', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction: BEGIN, then duplicate check finds existing report
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing-report-id' }] });   // SELECT existing

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toBe('You have already reported this user');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── 8. Happy path ──

  describe('successful report', () => {
    it('should create a user report and return 201 with report ID', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction: BEGIN, no duplicate, INSERT, COMMIT
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
        .mockResolvedValueOnce({ rows: [] })                                  // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })           // INSERT RETURNING id
        .mockResolvedValueOnce({ rows: [] });                                 // COMMIT

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.id).toBe(VALID_REPORT_ID);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should sanitize HTML tags from reason and details', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
        .mockResolvedValueOnce({ rows: [] })                                  // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })           // INSERT
        .mockResolvedValueOnce({ rows: [] });                                 // COMMIT

      const event = buildEvent({
        body: {
          userId: VALID_TARGET_USER_ID,
          reason: '<img src=x onerror=alert(1)>harassment',
          details: '<div>Some <b>bold</b> text</div>',
        },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);

      // Verify the INSERT call used sanitized values
      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO user_reports'),
      );
      expect(insertCall).toBeDefined();
      const insertParams = insertCall![1] as string[];
      expect(insertParams[2]).not.toContain('<img');
      expect(insertParams[2]).not.toContain('<div>');
      expect(insertParams[3]).not.toContain('<b>');
    });

    it('should handle null details gracefully', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
        .mockResolvedValueOnce({ rows: [] })                                  // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })           // INSERT
        .mockResolvedValueOnce({ rows: [] });                                 // COMMIT

      const event = buildEvent({
        body: { userId: VALID_TARGET_USER_ID, reason: 'impersonation' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(201);

      const insertCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO user_reports'),
      );
      expect(insertCall).toBeDefined();
      const insertParams = insertCall![1] as (string | null)[];
      expect(insertParams[3]).toBeNull();
    });
  });

  // ── 9. Auto-escalation ──

  describe('auto-escalation', () => {
    it('should call checkUserEscalation after report', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
        .mockResolvedValueOnce({ rows: [] })                                  // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })           // INSERT
        .mockResolvedValueOnce({ rows: [] });                                 // COMMIT

      const event = buildEvent({});

      await handler(event);

      expect(checkUserEscalation).toHaveBeenCalledWith(mockDb, VALID_TARGET_USER_ID);
    });

    it('should not fail if auto-escalation throws (non-blocking)', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                                  // BEGIN
        .mockResolvedValueOnce({ rows: [] })                                  // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: VALID_REPORT_ID }] })           // INSERT
        .mockResolvedValueOnce({ rows: [] });                                 // COMMIT

      (checkUserEscalation as jest.Mock).mockRejectedValueOnce(new Error('Escalation service down'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });
  });

  // ── 10. Error handling ──

  describe('error handling', () => {
    it('should return 500 when a database error occurs', async () => {
      // resolveProfileId succeeds but target user lookup fails
      mockDb.query.mockRejectedValueOnce(new Error('Connection refused'));

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });

    it('should ROLLBACK and release client when transaction fails', async () => {
      // Target user exists
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: VALID_TARGET_USER_ID }] });

      // Transaction: BEGIN succeeds, then SELECT fails
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })                          // BEGIN
        .mockRejectedValueOnce(new Error('deadlock detected'));       // duplicate check fails

      const event = buildEvent({});

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');

      // Verify ROLLBACK was called
      const rollbackCall = mockClient.query.mock.calls.find(
        (call: unknown[]) => call[0] === 'ROLLBACK',
      );
      expect(rollbackCall).toBeDefined();

      // Verify client was released
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
