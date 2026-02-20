/**
 * Tests for peaks/save-decision Lambda handler
 * Validates save_to_profile and dismiss actions with auth, ownership, transaction
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks ──────────────────────────────────────────────────────────

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
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
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/validators', () => ({
  requireAuth: jest.fn(),
  validateUUIDParam: jest.fn(),
  isErrorResponse: jest.fn().mockReturnValue(false),
}));

import { handler } from '../../peaks/save-decision';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../../utils/validators';
import { resolveProfileId } from '../../utils/auth';
import { checkRateLimit } from '../../utils/rate-limit';

// ── Helpers ────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PEAK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: TEST_PEAK_ID },
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

// ── Tests ──────────────────────────────────────────────────────────

describe('peaks/save-decision handler', () => {
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
    (requireAuth as jest.Mock).mockReturnValue(TEST_SUB);
    (validateUUIDParam as jest.Mock).mockReturnValue(TEST_PEAK_ID);
    (isErrorResponse as unknown as jest.Mock).mockReturnValue(false);
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true, retryAfter: 0 });
  });

  describe('auth checks', () => {
    it('should return 401 when not authenticated', async () => {
      const authResponse = {
        statusCode: 401,
        headers: {},
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
      (requireAuth as jest.Mock).mockReturnValue(authResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation((v) => typeof v !== 'string');

      const event = makeEvent({ sub: null });
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limited', async () => {
      (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: false, retryAfter: 30 });

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(429);
      expect(JSON.parse(result.body).retryAfter).toBe(30);
    });
  });

  describe('UUID validation', () => {
    it('should return 400 when peak ID is invalid', async () => {
      const validationResponse = {
        statusCode: 400,
        headers: {},
        body: JSON.stringify({ message: 'Invalid peak ID format' }),
      };
      (validateUUIDParam as jest.Mock).mockReturnValue(validationResponse);
      (isErrorResponse as unknown as jest.Mock).mockImplementation((v) => typeof v !== 'string');

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });
  });

  describe('body validation', () => {
    it('should return 400 when action is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({}),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid action');
    });

    it('should return 400 when action is invalid', async () => {
      const event = makeEvent({
        body: JSON.stringify({ action: 'invalid_action' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('save_to_profile');
    });
  });

  describe('profile resolution', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('profile not found');
    });
  });

  describe('peak ownership', () => {
    it('should return 404 when peak not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // peak not found (FOR UPDATE)

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Peak not found');
    });

    it('should return 403 when user is not the peak author', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: 'other-user-id' }],
        }); // peak found, different author

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toContain('Not authorized');
    });
  });

  describe('save_to_profile action', () => {
    it('should save peak to profile successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_PROFILE_ID }],
        }) // peak found, owned by user
        .mockResolvedValueOnce({ rows: [] }) // UPDATE saved_to_profile = true
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.savedToProfile).toBe(true);
      expect(body.message).toContain('saved to profile');
    });
  });

  describe('dismiss action', () => {
    it('should dismiss peak successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_PROFILE_ID }],
        }) // peak found, owned by user
        .mockResolvedValueOnce({ rows: [] }) // UPDATE saved_to_profile = false
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const event = makeEvent({
        body: JSON.stringify({ action: 'dismiss' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.savedToProfile).toBe(false);
      expect(body.message).toContain('dismissed');
    });
  });

  describe('transaction handling', () => {
    it('should rollback on error and release client', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // peak query fails

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should always release client even on commit error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: TEST_PEAK_ID, author_id: TEST_PROFILE_ID }],
        }) // peak
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockRejectedValueOnce(new Error('COMMIT failed')); // COMMIT fails

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 on unexpected error', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const event = makeEvent({
        body: JSON.stringify({ action: 'save_to_profile' }),
      });
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });
});
