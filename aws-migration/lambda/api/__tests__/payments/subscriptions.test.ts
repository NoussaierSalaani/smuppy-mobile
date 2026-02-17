/**
 * Tests for subscriptions Lambda - Critical bug fix validation
 * Ensures subscriptions handler uses channel_subscriptions table (not subscriptions)
 */

import { getPool } from '../../../shared/db';
import { handler } from '../../payments/subscriptions';

// Valid UUID for tests (handler validates with isValidUUID)
const VALID_CREATOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Mocks — factory mock to avoid shared/db module-level side effects
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
  getSecureHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
  })),
}));

jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
    },
    prices: {
      retrieve: jest.fn().mockResolvedValue({ id: 'price_123', active: true, unit_amount: 999 }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        status: 'active',
        items: { data: [{ price: { unit_amount: 999 } }] },
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test123',
        cancel_at_period_end: true,
        cancel_at: 1234567890,
      }),
    },
  }),
}));

describe('subscriptions handler - critical bug fix', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { connect: jest.Mock; query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      // Default: profile lookup returns a valid profile
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'profile_123' }] }),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  describe('createSubscription', () => {
    it('should insert into channel_subscriptions (NOT subscriptions table)', async () => {
      // Setup: subscriber has existing stripe_customer_id
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'profile_123', stripe_customer_id: 'cus_123', email: 'test@test.com' }] }) // subscriber lookup
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_123' }] }) // creator lookup
        .mockResolvedValueOnce({ rows: [] }); // insert result

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'create',
          creatorId: VALID_CREATOR_ID,
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      // Execute
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);

      // CRITICAL: Must use channel_subscriptions, NOT subscriptions
      const insertCalls = mockClient.query.mock.calls.filter(
        (call: string[]) => call[0].includes('INSERT INTO')
      );
      expect(insertCalls.length).toBeGreaterThan(0);

      const insertQuery = insertCalls[0][0];
      expect(insertQuery).toContain('channel_subscriptions');
      expect(insertQuery).not.toContain('INSERT INTO subscriptions');

      // Must use correct column names
      expect(insertQuery).toContain('fan_id');
      expect(insertQuery).toContain('creator_id');
      expect(insertQuery).toContain('price_cents');
    });

    it('should handle missing Stripe customer', async () => {
      // When stripe_customer_id is null, handler creates a Stripe customer
      // then runs UPDATE profiles SET stripe_customer_id (extra query)
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'profile_123', stripe_customer_id: null, email: 'test@test.com' }] }) // subscriber lookup
        .mockResolvedValueOnce({ rows: [] }) // UPDATE profiles SET stripe_customer_id
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_123' }] }) // creator lookup
        .mockResolvedValueOnce({ rows: [] }); // INSERT channel_subscriptions

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'create',
          creatorId: VALID_CREATOR_ID,
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });

    it('should reject when creator has no Stripe account', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'profile_123', stripe_customer_id: 'cus_123', email: 'test@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] }); // No Stripe account

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'create',
          creatorId: VALID_CREATOR_ID,
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('not set up payments');
    });
  });

  describe('cancelSubscription', () => {
    it('should update channel_subscriptions table', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ stripe_subscription_id: 'sub_test123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'cancel',
          subscriptionId: 'sub_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      // Must query channel_subscriptions
      const selectCalls = mockClient.query.mock.calls.filter(
        (call: string[]) => call[0].includes('SELECT') && call[0].includes('FROM')
      );
      expect(selectCalls[0][0]).toContain('channel_subscriptions');

      // Must update channel_subscriptions
      const updateCalls = mockClient.query.mock.calls.filter(
        (call: string[]) => call[0].includes('UPDATE')
      );
      expect(updateCalls[0][0]).toContain('channel_subscriptions');
    });

    it('should return 404 for non-existent subscription', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Not found

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'cancel',
          subscriptionId: 'non_existent',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('listSubscriptions', () => {
    it('should query from channel_subscriptions with fan_id', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub_1',
            subscriber_id: 'fan_123',
            creator_id: 'creator_1',
            stripe_subscription_id: 'stripe_sub_1',
            stripe_price_id: 999,
            status: 'active',
            created_at: '2026-01-01',
            username: 'creator1',
            full_name: 'Creator One',
            avatar_url: 'https://example.com/avatar.jpg',
          },
        ],
      });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ action: 'list' }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.subscriptions).toHaveLength(1);

      // Must query from channel_subscriptions with fan_id
      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('channel_subscriptions');
      expect(query).toContain('fan_id');
    });
  });

  describe('getCreatorPrices', () => {
    it('should return creator subscription tiers', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'tier_1',
            creator_id: VALID_CREATOR_ID,
            name: 'Basic',
            price_cents: 499,
            currency: 'usd',
            stripe_price_id: 'price_123',
            is_active: true,
          },
        ],
      });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'get-prices',
          creatorId: VALID_CREATOR_ID,
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.tiers).toHaveLength(1);
      expect(body.tiers[0].name).toBe('Basic');
    });
  });

  describe('authorization', () => {
    it('should reject requests without authentication', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ action: 'list' }),
        requestContext: {},
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(401);
    });

    it('should reject invalid actions', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ action: 'invalid_action' }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should handle OPTIONS request for CORS', async () => {
      const event = {
        httpMethod: 'OPTIONS',
        headers: {},
        body: null,
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPool.connect.mockRejectedValue(new Error('Database connection failed'));

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ action: 'list' }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });

    it('should handle JSON parse errors', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: 'invalid json',
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as unknown as Parameters<typeof handler>[0];

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });
  });
});
