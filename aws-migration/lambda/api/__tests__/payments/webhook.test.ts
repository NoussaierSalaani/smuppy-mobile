/**
 * Stripe Webhook Handler Unit Tests
 *
 * Tests critical payment processing logic:
 * - Signature verification
 * - Event age rejection (stale events)
 * - Idempotency (duplicate event detection)
 * - Event routing to correct handlers
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock shared modules before imports
jest.mock('../../../shared/secrets', () => ({
  getStripeKey: jest.fn().mockResolvedValue('sk_test_fake'),
  getStripeWebhookSecret: jest.fn().mockResolvedValue('whsec_test_fake'),
}));

jest.mock('../../../shared/db', () => {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
  return {
    getPool: jest.fn().mockResolvedValue(mockPool),
  };
});

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
}));

// Mock Stripe
const mockConstructEvent = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

import { handler } from '../../payments/webhook';

// Helper to create a mock API Gateway event
function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/payments/webhook',
    body: '{}',
    headers: {
      'Stripe-Signature': 'test_signature',
      'Content-Type': 'application/json',
    },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as never,
      path: '/payments/webhook',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/payments/webhook',
    },
    resource: '/payments/webhook',
    ...overrides,
  };
}

describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Signature Verification', () => {
    it('should return 400 when Stripe-Signature header is missing', async () => {
      const event = createMockEvent({
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should return 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('should accept valid stripe-signature header (lowercase)', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_test_valid',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'pi_test', metadata: {} } },
      });

      const event = createMockEvent({
        headers: {
          'stripe-signature': 'valid_sig',
          'Content-Type': 'application/json',
        },
      });

      const result = await handler(event);
      // Should not be 400 (signature accepted)
      expect(result.statusCode).not.toBe(400);
    });
  });

  describe('Event Age Validation', () => {
    it('should reject events older than 5 minutes', async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      mockConstructEvent.mockReturnValue({
        id: 'evt_stale',
        type: 'payment_intent.succeeded',
        created: staleTimestamp,
        data: { object: {} },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.skipped).toBe('stale');
    });

    it('should accept recent events (within 5 minutes)', async () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      mockConstructEvent.mockReturnValue({
        id: 'evt_recent_' + Date.now(),
        type: 'payment_intent.succeeded',
        created: recentTimestamp,
        data: { object: { id: 'pi_test', metadata: {} } },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).not.toBe(400);
    });
  });

  describe('Idempotency', () => {
    it('should skip duplicate events (in-memory dedup)', async () => {
      const eventId = 'evt_dedup_test_' + Date.now();
      const stripeEvent = {
        id: eventId,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'pi_test', metadata: {} } },
      };
      mockConstructEvent.mockReturnValue(stripeEvent);

      const event = createMockEvent();

      // First call
      await handler(event);

      // Second call with same event ID — should be deduped
      const result2 = await handler(event);
      expect(result2.statusCode).toBe(200);
      const body = JSON.parse(result2.body);
      expect(body.skipped).toBe('duplicate');
    });
  });

  describe('Event Routing', () => {
    it('should return 200 for unhandled event types', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_unhandled_' + Date.now(),
        type: 'some.unknown.event',
        created: Math.floor(Date.now() / 1000),
        data: { object: {} },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should handle OPTIONS requests for CORS', async () => {
      const event = createMockEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Request Validation', () => {
    it('should handle empty body gracefully', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('No webhook payload was provided');
      });

      const event = createMockEvent({ body: null });
      const result = await handler(event);

      // Signature verification fails on empty body
      expect(result.statusCode).toBe(400);
    });
  });
});
