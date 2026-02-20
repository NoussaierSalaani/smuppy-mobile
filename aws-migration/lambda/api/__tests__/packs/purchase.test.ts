/**
 * Tests for packs/purchase Lambda handler
 * Validates auth, rate limit, validation, pack lookup, Stripe interaction, and error handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
  corsHeaders: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  },
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
  isValidUUID: jest.fn((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('d4e5f6a7-b8c9-0123-defa-234567890123'),
}));

const mockStripePaymentIntentsCreate = jest.fn().mockResolvedValue({
  id: 'pi_test_123',
  client_secret: 'pi_test_123_secret_456',
});

const mockStripeCustomersCreate = jest.fn().mockResolvedValue({
  id: 'cus_test_123',
});

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    paymentIntents: {
      create: mockStripePaymentIntentsCreate,
    },
    customers: {
      create: mockStripeCustomersCreate,
    },
  }),
}));

// ── Import handler AFTER all mocks are declared ──

import { handler } from '../../packs/purchase';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';

// ── Test constants ──

const VALID_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_PROFILE_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const VALID_PACK_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const VALID_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

// ── Helpers ──

function makeEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ packId: VALID_PACK_ID }),
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

describe('packs/purchase handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  describe('OPTIONS', () => {
    it('should return 200 for OPTIONS request', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });
  });

  describe('authentication', () => {
    it('should return 401 when no authorizer claims present', async () => {
      const event = makeEvent({
        requestContext: {
          requestId: 'test-request-id',
          identity: { sourceIp: '127.0.0.1' },
        },
      });

      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(401);
      expect(JSON.parse(result!.body).message).toBe('Unauthorized');
    });
  });

  describe('rate limiting', () => {
    it('should return 429 when rate limit is exceeded', async () => {
      (requireRateLimit as jest.Mock).mockResolvedValueOnce({
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(429);
    });
  });

  describe('validation', () => {
    it('should return 400 when packId is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid ID format');
    });

    it('should return 400 when packId is not a valid UUID', async () => {
      const event = makeEvent({ body: JSON.stringify({ packId: 'not-uuid' }) });
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid ID format');
    });
  });

  describe('profile checks', () => {
    it('should return 404 when profile not found', async () => {
      (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Profile not found');
    });
  });

  describe('pack not found', () => {
    it('should return 404 when pack does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // pack not found

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Pack not found');
    });
  });

  describe('happy path', () => {
    it('should return 200 with payment intent on success', async () => {
      // Pack query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: VALID_PACK_ID,
          name: 'Yoga 5-Pack',
          sessions_included: 5,
          session_duration: 60,
          validity_days: 30,
          price: '49.99',
          creator_id: VALID_CREATOR_ID,
          creator_stripe_id: 'acct_creator123',
          creator_name: 'Creator',
        }],
      });
      // User query (has stripe customer)
      mockDb.query.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_existing', email: 'test@test.com' }],
      });
      // Insert pending purchase
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.paymentIntent.id).toBe('pi_test_123');
      expect(body.paymentIntent.clientSecret).toBe('pi_test_123_secret_456');
      expect(body.pack.name).toBe('Yoga 5-Pack');
    });

    it('should create Stripe customer if none exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: VALID_PACK_ID,
            name: 'Pack',
            sessions_included: 5,
            session_duration: 60,
            validity_days: 30,
            price: '29.99',
            creator_id: VALID_CREATOR_ID,
            creator_stripe_id: null,
            creator_name: 'Creator',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ stripe_customer_id: null, email: 'user@test.com' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // update stripe_customer_id
        .mockResolvedValueOnce({ rows: [] }); // insert pending purchase

      const event = makeEvent();
      await handler(event, {} as never, () => {});

      expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@test.com' }),
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 when Stripe throws', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: VALID_PACK_ID,
          name: 'Pack',
          sessions_included: 5,
          session_duration: 60,
          validity_days: 30,
          price: '29.99',
          creator_id: VALID_CREATOR_ID,
          creator_stripe_id: 'acct_123',
          creator_name: 'Creator',
        }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_test', email: 'test@test.com' }],
      });
      mockStripePaymentIntentsCreate.mockRejectedValueOnce(new Error('Stripe error'));

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(500);
      expect(JSON.parse(result!.body).message).toBe('Failed to process purchase');
    });

    it('should return 500 when database throws', async () => {
      mockDb.query.mockRejectedValue(new Error('Connection refused'));

      const event = makeEvent();
      const result = await handler(event, {} as never, () => {});

      expect(result!.statusCode).toBe(500);
    });
  });
});
