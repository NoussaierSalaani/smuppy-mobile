/**
 * Consent Handler Unit Tests
 * Tests auth, body validation, consent type validation, accepted flag,
 * version validation, profile resolution, upsert, and error handling
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

import { handler } from '../../profiles/consent';
import { resolveProfileId } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

// --- Test data ---

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: { 'User-Agent': 'TestAgent/1.0' },
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

describe('Consent Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveProfileId as jest.Mock).mockResolvedValue(TEST_PROFILE_ID);
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  describe('Authentication', () => {
    it('should return 401 when no cognito sub is present', async () => {
      const event = makeEvent({ sub: null });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('Unauthorized');
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

      const event = makeEvent({
        body: JSON.stringify({ consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }] }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Body validation', () => {
    it('should return 400 when body is missing', async () => {
      const event = makeEvent({ body: null });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Request body is required');
    });

    it('should return 400 when body is invalid JSON', async () => {
      const event = makeEvent({ body: 'not-json' });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('Invalid JSON body');
    });

    it('should return 400 when consents array is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('consents array is required');
    });

    it('should return 400 when consents array is empty', async () => {
      const event = makeEvent({ body: JSON.stringify({ consents: [] }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('consents array is required');
    });

    it('should return 400 when consents is not an array', async () => {
      const event = makeEvent({ body: JSON.stringify({ consents: 'not-array' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('consents array is required');
    });
  });

  describe('Consent type validation', () => {
    it('should return 400 for invalid consent type', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'invalid_type', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('Invalid consent type');
    });

    it('should accept terms_of_service consent type', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept privacy_policy consent type', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'privacy_policy', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should accept marketing consent type', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'marketing', accepted: false, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Accepted flag validation', () => {
    it('should return 400 when accepted is not a boolean', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: 'yes', version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toBe('accepted must be a boolean');
    });
  });

  describe('Version validation', () => {
    it('should return 400 when version is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('version is required');
    });

    it('should return 400 when version is too long', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: 'a'.repeat(21) }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('version is required');
    });

    it('should return 400 when version is not a string', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: 123 }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).message).toContain('version is required');
    });
  });

  describe('Profile resolution', () => {
    it('should return 404 when profile is not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValue(null);

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).message).toBe('Profile not found');
    });
  });

  describe('Happy path', () => {
    it('should return 200 with success message on single consent', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Consent recorded');
    });

    it('should insert one record per consent entry', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [
            { type: 'terms_of_service', accepted: true, version: '1.0' },
            { type: 'privacy_policy', accepted: true, version: '1.0' },
            { type: 'marketing', accepted: false, version: '1.0' },
          ],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      // 3 INSERT queries (one per consent)
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should pass IP address and user agent to the insert query', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }],
        }),
      });
      await handler(event);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        expect.arrayContaining([
          TEST_PROFILE_ID,
          'terms_of_service',
          true,
          '1.0',
          '127.0.0.1',
          'TestAgent/1.0',
        ])
      );
    });
  });

  describe('Error handling', () => {
    it('should return 500 on unexpected error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const event = makeEvent({
        body: JSON.stringify({
          consents: [{ type: 'terms_of_service', accepted: true, version: '1.0' }],
        }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      // withErrorHandler returns { message: 'Internal server error' } without success field
      expect(body.message).toBe('Internal server error');
    });
  });
});
