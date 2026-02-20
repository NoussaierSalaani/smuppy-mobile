/**
 * Tests for settings/currency Lambda handler
 * Validates GET (detect + user preference) and PUT (update preference) flows
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
  cors: jest.fn((response: { statusCode: number; body: string; headers?: Record<string, string> }) => ({
    ...response,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(response.headers || {}),
    },
  })),
  handleOptions: jest.fn(() => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
  })),
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'private, max-age=30',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler as _handler } from '../../settings/currency';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: { 'CloudFront-Viewer-Country': 'FR' },
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: {
        claims: { sub: VALID_USER_ID },
      },
      identity: { sourceIp: '127.0.0.1' },
    },
    ...overrides,
  } as unknown as APIGatewayProxyEvent;
}

// ── Test suite ──

describe('settings/currency handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  // ── OPTIONS ──
  // Note: withErrorHandler does not handle OPTIONS separately.
  // API Gateway handles CORS preflight before the Lambda is invoked.
  // If OPTIONS reaches the handler, it hits the method not allowed check.
  describe('OPTIONS preflight', () => {
    it('should return 405 for OPTIONS request (no special handling)', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);
      expect(result!.statusCode).toBe(405);
    });
  });

  // ── GET: currency detection ──
  describe('GET - currency detection', () => {
    it('should return 200 with detected currency for unauthenticated user', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ code: 'EUR', name: 'Euro', symbol: '\u20ac' }],
      });

      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.currency.code).toBe('EUR');
      expect(body.currency.detected).toBe('EUR');
      expect(body.currency.countryCode).toBe('FR');
    });

    it('should detect USD for US country code', async () => {
      mockClient.query.mockResolvedValue({
        rows: [{ code: 'USD', name: 'US Dollar', symbol: '$' }],
      });

      const event = makeEvent({
        headers: { 'CloudFront-Viewer-Country': 'US' },
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.currency.detected).toBe('USD');
    });

    it('should return user preference when authenticated and preference exists', async () => {
      // First call: supported currencies
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ code: 'EUR', name: 'Euro', symbol: '\u20ac' }],
        })
        // Second call: user preference
        .mockResolvedValueOnce({
          rows: [{ preferred_currency: 'GBP' }],
        });

      const event = makeEvent();

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.currency.code).toBe('GBP');
      expect(body.currency.symbol).toBe('\u00a3');
    });

    it('should default to detected currency when user has no preference', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // supported currencies
        .mockResolvedValueOnce({ rows: [] }); // no user preference

      const event = makeEvent({
        headers: { 'CloudFront-Viewer-Country': 'JP' },
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.currency.code).toBe('JPY');
    });

    it('should default to EUR for unknown country code', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const event = makeEvent({
        headers: { 'CloudFront-Viewer-Country': 'ZZ' },
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.currency.detected).toBe('EUR');
    });
  });

  // ── PUT: update preference ──
  describe('PUT - update currency preference', () => {
    it('should return 401 when user is not authenticated', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ currency: 'USD' }),
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(401);
      expect(JSON.parse(result!.body).message).toBe('Unauthorized');
    });

    it('should return 400 when currency is missing', async () => {
      const event = makeEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({}),
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Currency code required');
    });

    it('should return 400 when currency is not supported', async () => {
      mockClient.query.mockResolvedValue({ rows: [] }); // currency check fails

      const event = makeEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ currency: 'XYZ' }),
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Currency not supported');
    });

    it('should return 200 when currency preference is updated successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ code: 'USD' }] }) // currency check passes
        .mockResolvedValueOnce({ rows: [] }); // upsert

      const event = makeEvent({
        httpMethod: 'PUT',
        body: JSON.stringify({ currency: 'usd' }),
      });

      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.currency.code).toBe('USD');
      expect(body.message).toBe('Currency preference updated');
    });
  });

  // ── Method not allowed ──
  describe('method not allowed', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      const event = makeEvent({ httpMethod: 'DELETE' });
      const result = await handler(event);
      expect(result!.statusCode).toBe(405);
      expect(JSON.parse(result!.body).message).toBe('Method not allowed');
    });
  });

  // ── Error handling ──
  describe('error handling', () => {
    it('should return 500 when client query throws', async () => {
      mockClient.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event);
      expect(result!.statusCode).toBe(500);
      expect(JSON.parse(result!.body).message).toBe('Internal server error');
    });

    it('should release client in finally block', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const event = makeEvent();
      await handler(event);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
});
