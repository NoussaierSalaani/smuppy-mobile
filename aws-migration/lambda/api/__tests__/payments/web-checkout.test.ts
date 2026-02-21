/**
 * Tests for web-checkout Lambda handler
 * Validates Stripe Checkout Session creation for web payments
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/web-checkout';

// ── Mocks ────────────────────────────────────────────────────────────

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
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new_test' }) },
    products: { create: jest.fn().mockResolvedValue({ id: 'prod_test' }) },
    prices: { create: jest.fn().mockResolvedValue({ id: 'price_test' }) },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test', expires_at: 1234567890 }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'cs_test', status: 'complete', payment_status: 'paid',
          metadata: { productType: 'session', userId: 'cognito-sub-test123' },
          amount_total: 5000, currency: 'eur',
        }),
      },
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PACK_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const USER_PROFILE = {
  id: 'p1',
  email: 'test@test.com',
  full_name: 'Test User',
  username: 'testuser',
  stripe_customer_id: 'cus_existing',
};

const USER_PROFILE_NO_STRIPE = {
  id: 'p1',
  email: 'test@test.com',
  full_name: 'Test User',
  username: 'testuser',
  stripe_customer_id: null,
};

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/payments/web-checkout',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

function setupAuth(sub = TEST_SUB) {
  const { getUserFromEvent } = require('../../utils/auth');
  (getUserFromEvent as jest.Mock).mockReturnValue({ sub, id: sub });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/web-checkout handler', () => {
  let mockPool: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = { query: jest.fn() };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  // ── Basic handler tests ──

  it('returns 204 for OPTIONS preflight', async () => {
    setupAuth();
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValue(null);
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    setupAuth();
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(429);
  });

  it('POST returns 400 when productType missing', async () => {
    setupAuth();
    mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
    const event = makeEvent({ body: JSON.stringify({}) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('productType is required');
  });

  it('POST returns 404 when user not found', async () => {
    setupAuth();
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ productType: 'session' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(404);
  });

  it('POST returns 400 for invalid productType', async () => {
    setupAuth();
    mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
    const event = makeEvent({ body: JSON.stringify({ productType: 'invalid_type' }) });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toBe('Invalid productType');
  });

  it('returns 405 for unsupported method', async () => {
    setupAuth();
    const event = makeEvent({ httpMethod: 'PUT' });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(405);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('Unexpected'); });
    const event = makeEvent();
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(500);
  });

  // ── getOrCreateStripeCustomer ──

  it('creates a new Stripe customer when user has no stripe_customer_id', async () => {
    setupAuth();
    // 1st query: user profile (no stripe_customer_id)
    mockPool.query
      .mockResolvedValueOnce({ rows: [USER_PROFILE_NO_STRIPE] })
      // 2nd query: UPDATE profiles SET stripe_customer_id
      .mockResolvedValueOnce({ rows: [] })
      // 3rd query: session lookup
      .mockResolvedValueOnce({
        rows: [{
          id: TEST_SESSION_ID,
          creator_id: TEST_CREATOR_ID,
          price_cents: 5000,
          duration_minutes: 30,
          creator_name: 'Creator',
          stripe_account_id: 'acct_creator',
        }],
      });

    const event = makeEvent({
      body: JSON.stringify({ productType: 'session', productId: TEST_SESSION_ID }),
    });
    const result = await handler(event, {} as never, () => {});
    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
    // Verify the UPDATE query was called
    expect(mockPool.query).toHaveBeenCalledWith(
      'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      ['cus_new_test', 'p1']
    );
  });

  // ── Session checkout ──

  describe('session checkout', () => {
    it('returns 400 when productId missing', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({ body: JSON.stringify({ productType: 'session' }) });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('productId');
    });

    it('returns 404 when session not found', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({ rows: [] }); // session not found
      const event = makeEvent({
        body: JSON.stringify({ productType: 'session', productId: TEST_SESSION_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Session not found');
    });

    it('creates session checkout with price_cents', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_SESSION_ID,
            creator_id: TEST_CREATOR_ID,
            price_cents: 5000,
            price: 50,
            duration_minutes: 30,
            creator_name: 'Creator User',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'session', productId: TEST_SESSION_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test');
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
      expect(body.expiresAt).toBe(1234567890);
    });

    it('creates session checkout with fallback price * 100', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_SESSION_ID,
            creator_id: TEST_CREATOR_ID,
            price_cents: null,
            price: 25.50,
            duration_minutes: null,
            duration: 45,
            creator_name: 'Creator User',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'session', productId: TEST_SESSION_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      expect(JSON.parse(result!.body).success).toBe(true);
    });
  });

  // ── Pack checkout ──

  describe('pack checkout', () => {
    it('returns 400 when productId or creatorId missing', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'pack', productId: TEST_PACK_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('creatorId');
    });

    it('returns 400 when only creatorId provided (no productId)', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'pack', creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
    });

    it('returns 404 when pack not found', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({ rows: [] }); // pack not found
      const event = makeEvent({
        body: JSON.stringify({ productType: 'pack', productId: TEST_PACK_ID, creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Pack not found');
    });

    it('creates pack checkout successfully', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PACK_ID,
            creator_id: TEST_CREATOR_ID,
            name: 'Bronze Pack',
            price_cents: 9900,
            price: 99,
            sessions_included: 5,
            creator_name: 'Pack Creator',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'pack', productId: TEST_PACK_ID, creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test');
    });

    it('creates pack checkout using fallback price * 100', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PACK_ID,
            creator_id: TEST_CREATOR_ID,
            name: 'Silver Pack',
            price_cents: null,
            price: 49.99,
            sessions_included: 3,
            creator_name: 'Pack Creator',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'pack', productId: TEST_PACK_ID, creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });
  });

  // ── Channel subscription checkout ──

  describe('channel_subscription checkout', () => {
    it('returns 400 when creatorId missing', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'channel_subscription' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('creatorId');
    });

    it('returns 404 when creator not found', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({ rows: [] }); // creator not found
      const event = makeEvent({
        body: JSON.stringify({ productType: 'channel_subscription', creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Creator not found');
    });

    it('creates channel subscription with existing Stripe price', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        // creator profile
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: 'Channel Creator',
            username: 'channelcreator',
            stripe_account_id: 'acct_creator',
            channel_price_cents: 799,
            fan_count: '500',
          }],
        })
        // existing stripe price
        .mockResolvedValueOnce({ rows: [{ stripe_price_id: 'price_existing' }] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'channel_subscription', creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test');
    });

    it('creates channel subscription with new Stripe product/price when none exists', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        // creator profile
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: 'Channel Creator',
            username: 'channelcreator',
            stripe_account_id: 'acct_creator',
            channel_price_cents: null, // default to 499
            fan_count: '0',
          }],
        })
        // no existing stripe price
        .mockResolvedValueOnce({ rows: [] })
        // INSERT new price
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'channel_subscription', creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
    });

    it('uses default price of 499 when channel_price_cents is null', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: '',
            username: 'channelcreator',
            stripe_account_id: 'acct_creator',
            channel_price_cents: null,
            fan_count: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [{ stripe_price_id: 'price_existing' }] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'channel_subscription', creatorId: TEST_CREATOR_ID }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });
  });

  // ── Platform subscription checkout ──

  describe('platform_subscription checkout', () => {
    it('returns 400 when planType missing', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'platform_subscription' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('planType');
    });

    it('returns 400 for invalid planType', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'platform_subscription', planType: 'invalid' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid planType');
    });

    it('creates pro_creator subscription with env price ID', async () => {
      process.env.STRIPE_PRICE_PRO_CREATOR = 'price_env_creator';
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'platform_subscription', planType: 'pro_creator' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test');
      delete process.env.STRIPE_PRICE_PRO_CREATOR;
    });

    it('creates pro_business subscription with env price ID', async () => {
      process.env.STRIPE_PRICE_PRO_BUSINESS = 'price_env_business';
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'platform_subscription', planType: 'pro_business' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      delete process.env.STRIPE_PRICE_PRO_BUSINESS;
    });

    it('creates platform subscription by creating Stripe product/price dynamically', async () => {
      // No env price ID set — should create product + price
      delete process.env.STRIPE_PRICE_PRO_CREATOR;
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'platform_subscription', planType: 'pro_creator' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
    });
  });

  // ── Tip checkout ──

  describe('tip checkout', () => {
    it('returns 400 when creatorId and amount missing', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip' }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('creatorId and amount');
    });

    it('returns 400 when amount below minimum (< 1.00)', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 0.50 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('Invalid tip amount');
    });

    it('returns 400 when amount above maximum (> 500.00)', async () => {
      setupAuth();
      mockPool.query.mockResolvedValueOnce({ rows: [USER_PROFILE] });
      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 600 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toContain('Invalid tip amount');
    });

    it('returns 404 when creator not found for tip', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({ rows: [] }); // creator not found
      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 5 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Creator not found');
    });

    it('creates tip checkout successfully', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: 'Tip Creator',
            username: 'tipcreator',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 10 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.sessionId).toBe('cs_test');
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
    });

    it('creates tip checkout with minimum amount', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: '',
            username: 'tipcreator',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 1 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });

    it('creates tip checkout with maximum amount', async () => {
      setupAuth();
      mockPool.query
        .mockResolvedValueOnce({ rows: [USER_PROFILE] })
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_CREATOR_ID,
            full_name: 'Max Tipper',
            username: 'maxtipper',
            stripe_account_id: 'acct_creator',
          }],
        });

      const event = makeEvent({
        body: JSON.stringify({ productType: 'tip', creatorId: TEST_CREATOR_ID, amount: 500 }),
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });
  });

  // ── GET session status ──

  describe('GET session status', () => {
    it('returns session status successfully', async () => {
      setupAuth();
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/web-checkout/status/cs_test',
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.status).toBe('complete');
      expect(body.paymentStatus).toBe('paid');
      expect(body.metadata).toEqual({ productType: 'session' });
      expect(body.amountTotal).toBe(5000);
      expect(body.currency).toBe('eur');
    });

    it('returns 403 when session userId does not match requesting user', async () => {
      setupAuth('different-user-sub');
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_test',
        status: 'complete',
        payment_status: 'paid',
        metadata: { productType: 'session', userId: 'other-user-sub' },
        amount_total: 5000,
        currency: 'eur',
      });

      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/web-checkout/status/cs_test',
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(403);
      expect(JSON.parse(result!.body).message).toBe('Access denied');
    });

    it('returns 200 when session metadata has no userId (legacy sessions)', async () => {
      setupAuth();
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_test',
        status: 'complete',
        payment_status: 'paid',
        metadata: { productType: 'session' },
        amount_total: 5000,
        currency: 'eur',
      });

      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/web-checkout/status/cs_legacy',
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
    });

    it('returns 200 when session has null metadata', async () => {
      setupAuth();
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripe = await getStripeClient();
      mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
        id: 'cs_test',
        status: 'open',
        payment_status: 'unpaid',
        metadata: null,
        amount_total: 3000,
        currency: 'eur',
      });

      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/web-checkout/status/cs_null_meta',
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.metadata).toEqual({});
    });

    it('returns 404 when Stripe session retrieval throws', async () => {
      setupAuth();
      const { safeStripeCall } = require('../../../shared/stripe-resilience');
      // Override safeStripeCall for this specific call to throw
      (safeStripeCall as jest.Mock).mockRejectedValueOnce(new Error('No such session'));

      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/web-checkout/status/cs_nonexistent',
      });
      const result = await handler(event, {} as never, () => {});
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Session not found');
    });
  });

  // ── Rate limit differentiation ──

  it('uses different rate limit prefix for GET vs POST', async () => {
    setupAuth();
    const { requireRateLimit } = require('../../utils/rate-limit');
    const { getStripeClient } = require('../../../shared/stripe-client');
    const mockStripe = await getStripeClient();
    mockStripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_test', status: 'complete', payment_status: 'paid',
      metadata: { productType: 'session', userId: TEST_SUB },
      amount_total: 5000, currency: 'eur',
    });

    const event = makeEvent({
      httpMethod: 'GET',
      path: '/payments/web-checkout/status/cs_test',
    });
    await handler(event, {} as never, () => {});
    expect(requireRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'web-checkout-status', maxRequests: 30 }),
      expect.any(Object)
    );
  });
});
