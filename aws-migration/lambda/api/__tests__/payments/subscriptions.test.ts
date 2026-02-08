/**
 * Tests for subscriptions Lambda - Critical bug fix validation
 * Ensures subscriptions handler uses channel_subscriptions table (not subscriptions)
 */

import { handler } from '../../payments/subscriptions';
import { getPool } from '../../../shared/db';
import { getStripeKey } from '../../../shared/secrets';

// Mocks
jest.mock('../../../shared/db');
jest.mock('../../../shared/secrets');
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test123' }),
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
  }));
});

describe('subscriptions handler - critical bug fix', () => {
  let mockClient: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockResolvedValue(mockPool);
    (getStripeKey as jest.Mock).mockResolvedValue('sk_test_xxx');
  });

  describe('createSubscription', () => {
    it('should insert into channel_subscriptions (NOT subscriptions table)', async () => {
      // Setup
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'profile_123', stripe_customer_id: 'cus_123', email: 'test@test.com' }] }) // subscriber lookup
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_123' }] }) // creator lookup
        .mockResolvedValueOnce({ rows: [] }); // insert result

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'create',
          creatorId: 'creator_123',
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

      // Execute
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);

      // CRITICAL: Must use channel_subscriptions, NOT subscriptions
      const insertCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => call[0].includes('INSERT INTO')
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
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'profile_123', stripe_customer_id: null, email: 'test@test.com' }] })
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_123' }] })
        .mockResolvedValueOnce({ rows: [] });

      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          action: 'create',
          creatorId: 'creator_123',
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

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
          creatorId: 'creator_123',
          priceId: 'price_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('not set up payments');
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
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      // Must query channel_subscriptions
      const selectCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => call[0].includes('SELECT') && call[0].includes('FROM')
      );
      expect(selectCalls[0][0]).toContain('channel_subscriptions');

      // Must update channel_subscriptions
      const updateCalls = mockClient.query.mock.calls.filter(
        (call: any[]) => call[0].includes('UPDATE')
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
      } as any;

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
      } as any;

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
            creator_id: 'creator_123',
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
          creatorId: 'creator_123',
        }),
        requestContext: {
          authorizer: {
            claims: { sub: 'cognito_user_123' },
          },
        },
      } as any;

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
      } as any;

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
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should handle OPTIONS request for CORS', async () => {
      const event = {
        httpMethod: 'OPTIONS',
        headers: {},
        body: null,
      } as any;

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
      } as any;

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
      } as any;

      const result = await handler(event);
      expect(result.statusCode).toBe(500);
    });
  });
});
