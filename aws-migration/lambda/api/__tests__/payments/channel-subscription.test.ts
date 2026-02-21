/**
 * Tests for channel-subscription Lambda handler
 * Validates fan-to-creator channel subscription flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/channel-subscription';

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
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
    products: {
      search: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
    },
    prices: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: 'price_test' }),
      update: jest.fn().mockResolvedValue({}),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }),
      },
    },
    subscriptions: {
      update: jest.fn().mockResolvedValue({ id: 'sub_test', cancel_at: 1234567890 }),
    },
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

jest.mock('../../utils/revenue-share', () => ({
  calculatePlatformFeePercent: jest.fn().mockReturnValue(40),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Users: [{ Attributes: [{ Name: 'email', Value: 'test@test.com' }] }] }),
  })),
  ListUsersCommand: jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_CREATOR_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_SUBSCRIPTION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

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

// ── Tests ────────────────────────────────────────────────────────────

describe('payments/channel-subscription handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);
  });

  // ── Common handler tests ──────────────────────────────────────────

  it('returns 200 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('returns 400 for invalid creatorId UUID format', async () => {
    const { isValidUUID } = require('../../utils/security');
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe', creatorId: 'not-a-uuid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid creatorId format');
  });

  it('returns 400 for invalid subscriptionId UUID format', async () => {
    const { isValidUUID } = require('../../utils/security');
    // First call is for creatorId (not present), second is for subscriptionId
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel', subscriptionId: 'not-a-uuid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid subscriptionId format');
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('returns 400 for invalid action when body is null (fallback to empty object)', async () => {
    const event = makeEvent({ body: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('returns 400 when get-channel-info is called without creatorId', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'get-channel-info' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('creatorId is required');
  });

  it('returns 400 for invalid subscriptionId UUID format', async () => {
    const { isValidUUID } = require('../../utils/security');
    // subscriptionId check only fires when there's no creatorId in body
    // isValidUUID is called once for subscriptionId only (no creatorId present)
    (isValidUUID as jest.Mock).mockReturnValueOnce(false);
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel', subscriptionId: 'not-a-uuid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid subscriptionId format');
  });

  it('subscribe returns 400 when creatorId missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'subscribe' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('creatorId is required');
  });

  it('cancel returns 400 when subscriptionId missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('subscriptionId is required');
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });

  // ── list-subscriptions ────────────────────────────────────────────

  it('list-subscriptions returns 200 with subscriptions array', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'sub-1', creator_id: TEST_CREATOR_ID, status: 'active', price_cents: 999,
        current_period_start: '2025-01-01', current_period_end: '2025-02-01',
        cancel_at: null, username: 'creator', full_name: 'Creator Name',
        avatar_url: null, is_verified: true,
      }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.subscriptions).toHaveLength(1);
  });

  // ── subscribe (full flow) ─────────────────────────────────────────

  describe('subscribe', () => {
    const subscribeEvent = () => makeEvent({
      body: JSON.stringify({ action: 'subscribe', creatorId: TEST_CREATOR_ID }),
    });

    it('returns 400 when already subscribed to channel', async () => {
      // validateSubscriptionEligibility: existing sub found
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'existing-sub' }] });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Already subscribed to this channel');
    });

    it('returns 404 when creator not found or not pro_creator', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator query returns nothing
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Creator not found or not a Pro account');
    });

    it('returns 400 when creator has no stripe account', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found but no stripe_account_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: null,
          channel_price_cents: 999,
          username: 'creator',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Creator has not set up payments yet');
    });

    it('returns 400 when creator has no channel price set', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found but no channel_price_cents
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_test',
          channel_price_cents: null,
          username: 'creator',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Creator has not set a channel subscription price');
    });

    it('returns 400 when creator channel price is zero', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_test',
          channel_price_cents: 0,
          username: 'creator',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Creator has not set a channel subscription price');
    });

    it('returns 404 when fan profile not found', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_test',
          channel_price_cents: 999,
          username: 'creator',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: not found
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User not found');
    });

    it('returns 200 with checkout session when fan has existing stripe customer', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: found with existing stripe_customer_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.checkoutUrl).toBe('https://checkout.stripe.com/test');
      expect(body.sessionId).toBe('cs_test');
      expect(body.pricePerMonth).toBe(999);
      expect(body.platformFeePercent).toBe(40);
      expect(body.creatorSharePercent).toBe(60);
      expect(body.tier).toBe('Bronze');
      // Fan had existing customer, so no customer create call
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('creates a new stripe customer when fan has none', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: found but no stripe_customer_id, has email
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: null,
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });
      // UPDATE profiles SET stripe_customer_id (from getOrCreateStripeCustomer)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      const result = await handler(subscribeEvent());

      expect(result.statusCode).toBe(200);
      // stripe.customers.create was called
      expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'fan@test.com',
        name: 'Fan Name',
      }));
      // DB updated with new customer ID
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        ['cus_test', TEST_PROFILE_ID]
      );
    });

    it('syncs fan email from Cognito when email is null', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: found but no email, has cognito_sub
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: null,
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });
      // UPDATE profiles SET email (from syncFanEmailFromCognito)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // Cognito was queried to sync email, then profiles updated
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE profiles SET email = $1 WHERE id = $2',
        ['test@test.com', TEST_PROFILE_ID]
      );
    });

    it('continues without email when cognito returns no email attribute', async () => {
      const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
      // Override Cognito to return user with no email attribute
      (CognitoIdentityProviderClient as jest.Mock).mockImplementationOnce(() => ({
        send: jest.fn().mockResolvedValue({
          Users: [{ Attributes: [{ Name: 'phone_number', Value: '+1234567890' }] }],
        }),
      }));

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: no email, has cognito_sub
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: null,
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // Email was null from cognito (no email attr), so no UPDATE for email
      const emailUpdateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE profiles SET email')
      );
      expect(emailUpdateCalls).toHaveLength(0);
    });

    it('handles cognito error gracefully and continues subscription flow', async () => {
      const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
      // Override Cognito to throw an error
      (CognitoIdentityProviderClient as jest.Mock).mockImplementationOnce(() => ({
        send: jest.fn().mockRejectedValue(new Error('Cognito service unavailable')),
      }));

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: no email, has cognito_sub (will trigger cognito sync attempt)
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: null,
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      // Should still succeed despite cognito error
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).success).toBe(true);
    });

    it('creates stripe customer with undefined email when fan email is null', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: no stripe customer, no email, no cognito_sub (skip cognito sync)
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: null,
          email: null,
          full_name: 'Fan Name',
          cognito_sub: null,
        }],
      });
      // UPDATE profiles SET stripe_customer_id
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      const result = await handler(subscribeEvent());

      expect(result.statusCode).toBe(200);
      // stripe.customers.create was called with undefined email (not null)
      expect(stripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({
        email: undefined,
        name: 'Fan Name',
      }));
    });

    it('handles null fan_count in subscribe flow (defaults to 0)', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found with null fan_count
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: null,
        }],
      });
      // fan query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // With null fan_count, parseInt returns NaN, fallback to 0 -> Bronze tier, 40% fee
      expect(body.tier).toBe('Bronze');
      expect(body.platformFeePercent).toBe(40);
      expect(body.creatorSharePercent).toBe(60);
    });

    it('skips cognito sync when fan has no cognito_sub', async () => {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: found but no email and no cognito_sub
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: null,
          full_name: 'Fan Name',
          cognito_sub: null,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // Should NOT have called UPDATE for email since cognito_sub is null
      const emailUpdateCalls = mockClient.query.mock.calls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('UPDATE profiles SET email')
      );
      expect(emailUpdateCalls).toHaveLength(0);
    });

    it('uses existing stripe product if found', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      // Override products.search to return an existing product
      (stripe.products.search as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'prod_existing' }],
      });

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: found with existing customer
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // products.create should NOT have been called since existing product found
      expect(stripe.products.create).not.toHaveBeenCalled();
    });

    it('uses existing stripe price if matching amount found', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      // Override prices.list to return a matching price
      (stripe.prices.list as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'price_existing', unit_amount: 999 }],
      });

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // prices.create should NOT be called since matching price found
      expect(stripe.prices.create).not.toHaveBeenCalled();
    });

    it('deactivates old prices when amount changes', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      // Override prices.list to return a price with different amount
      (stripe.prices.list as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'price_old', unit_amount: 500 }],
      });

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // Old price deactivated
      expect(stripe.prices.update).toHaveBeenCalledWith('price_old', { active: false });
      // New price created
      expect(stripe.prices.create).toHaveBeenCalledWith(expect.objectContaining({
        unit_amount: 999,
        currency: 'usd',
        recurring: { interval: 'month' },
      }));
    });

    it('uses full_name as fallback when username is missing', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found, no username
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: '',
          full_name: 'Creator Full Name',
          fan_count: '500',
        }],
      });
      // fan query
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // When username is falsy, full_name is used for product name
      expect(stripe.products.create).toHaveBeenCalledWith(expect.objectContaining({
        name: "Creator Full Name's Channel",
      }));
    });
  });

  // ── cancel ────────────────────────────────────────────────────────

  describe('cancel', () => {
    const cancelEvent = () => makeEvent({
      body: JSON.stringify({ action: 'cancel', subscriptionId: TEST_SUBSCRIPTION_ID }),
    });

    it('returns 404 when subscription not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler(cancelEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Subscription not found');
    });

    it('returns 200 and cancels at period end on success', async () => {
      // Query: find active subscription
      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_stripe_123' }],
      });
      // Query: UPDATE channel_subscriptions SET status = 'canceling'
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const stripe = await require('../../../shared/stripe-client').getStripeClient();
      const result = await handler(cancelEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Subscription will be canceled at end of billing period');
      expect(body.cancelAt).toBe(1234567890);

      // Stripe subscription updated to cancel_at_period_end
      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_stripe_123', {
        cancel_at_period_end: true,
      });

      // DB updated with canceling status
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'canceling'"),
        [1234567890, TEST_SUBSCRIPTION_ID]
      );

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── get-channel-info ──────────────────────────────────────────────

  describe('get-channel-info', () => {
    const channelInfoEvent = () => makeEvent({
      body: JSON.stringify({ action: 'get-channel-info', creatorId: TEST_CREATOR_ID }),
    });

    it('returns 404 when creator not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const result = await handler(channelInfoEvent());
      expect(result.statusCode).toBe(404);
    });

    it('returns 200 with channel info on success', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          username: 'topcreator',
          full_name: 'Top Creator',
          avatar_url: 'https://cdn.smuppy.com/avatar.jpg',
          is_verified: true,
          channel_price_cents: 999,
          channel_description: 'My awesome channel',
          fan_count: '15000',
          subscriber_count: '42',
        }],
      });

      const result = await handler(channelInfoEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.channel.creatorId).toBe(TEST_CREATOR_ID);
      expect(body.channel.username).toBe('topcreator');
      expect(body.channel.fullName).toBe('Top Creator');
      expect(body.channel.avatarUrl).toBe('https://cdn.smuppy.com/avatar.jpg');
      expect(body.channel.isVerified).toBe(true);
      expect(body.channel.pricePerMonth).toBe(999);
      expect(body.channel.description).toBe('My awesome channel');
      expect(body.channel.fanCount).toBe(15000);
      expect(body.channel.subscriberCount).toBe(42);
      expect(body.channel.tier).toBe('Gold');
    });

    it('returns Bronze tier for low fan count', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          username: 'newcreator',
          full_name: 'New Creator',
          avatar_url: null,
          is_verified: false,
          channel_price_cents: 499,
          channel_description: null,
          fan_count: '50',
          subscriber_count: '0',
        }],
      });

      const result = await handler(channelInfoEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.channel.fanCount).toBe(50);
      expect(body.channel.subscriberCount).toBe(0);
      expect(body.channel.tier).toBe('Bronze');
    });

    it('handles null fan_count gracefully', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          username: 'newcreator',
          full_name: 'New Creator',
          avatar_url: null,
          is_verified: false,
          channel_price_cents: 499,
          channel_description: null,
          fan_count: null,
          subscriber_count: null,
        }],
      });

      const result = await handler(channelInfoEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.channel.fanCount).toBe(0);
      expect(body.channel.subscriberCount).toBe(0);
      expect(body.channel.tier).toBe('Bronze');
    });
  });

  // ── set-price ─────────────────────────────────────────────────────

  describe('set-price', () => {
    it('returns 403 when not a pro_creator', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 999 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
    });

    it('returns 404 when user not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 999 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User not found');
    });

    it('returns 400 for price below minimum ($1 = 100 cents)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 50 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('between $1 and $999');
    });

    it('returns 400 for price above maximum ($999 = 99900 cents)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 100000 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('between $1 and $999');
    });

    it('returns 200 and updates price on success', async () => {
      // First query: check account_type
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      // Second query: UPDATE profiles SET channel_price_cents
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 1999 }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.pricePerMonth).toBe(1999);

      // Verify the UPDATE query was called with correct params
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE profiles SET channel_price_cents = $1, updated_at = NOW() WHERE id = $2',
        [1999, TEST_PROFILE_ID]
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns 200 for price at minimum boundary (100 cents)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 100 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).pricePerMonth).toBe(100);
    });

    it('returns 200 for price at maximum boundary (99900 cents)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 99900 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).pricePerMonth).toBe(99900);
    });
  });

  // ── get-subscribers ───────────────────────────────────────────────

  describe('get-subscribers', () => {
    it('returns 200 with subscribers and earnings', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // subscribers
        .mockResolvedValueOnce({ rows: [{ total_gross: '0', total_net: '0' }] }); // earnings
      const event = makeEvent({ body: JSON.stringify({ action: 'get-subscribers' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.subscriberCount).toBe(0);
    });

    it('returns 200 with populated subscribers and earnings data', async () => {
      // subscribers query
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sub-1', fan_id: 'fan-uuid-1', status: 'active', price_cents: 999,
            created_at: '2025-01-15', username: 'fan1', full_name: 'Fan One', avatar_url: 'https://cdn.smuppy.com/fan1.jpg',
          },
          {
            id: 'sub-2', fan_id: 'fan-uuid-2', status: 'canceling', price_cents: 999,
            created_at: '2025-02-01', username: 'fan2', full_name: 'Fan Two', avatar_url: null,
          },
        ],
      });
      // earnings query
      mockClient.query.mockResolvedValueOnce({
        rows: [{ total_gross: '5994', total_net: '3596' }],
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-subscribers' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.subscriberCount).toBe(2);
      expect(body.subscribers).toHaveLength(2);

      // Verify first subscriber mapping
      expect(body.subscribers[0].id).toBe('sub-1');
      expect(body.subscribers[0].fanId).toBe('fan-uuid-1');
      expect(body.subscribers[0].fan.username).toBe('fan1');
      expect(body.subscribers[0].fan.fullName).toBe('Fan One');
      expect(body.subscribers[0].fan.avatarUrl).toBe('https://cdn.smuppy.com/fan1.jpg');
      expect(body.subscribers[0].status).toBe('active');
      expect(body.subscribers[0].pricePerMonth).toBe(999);
      expect(body.subscribers[0].subscribedAt).toBe('2025-01-15');

      // Verify earnings
      expect(body.earnings.totalGross).toBe(5994);
      expect(body.earnings.totalNet).toBe(3596);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ── Tier name tests ───────────────────────────────────────────────

  describe('tier names via get-channel-info', () => {
    const channelInfoEvent = () => makeEvent({
      body: JSON.stringify({ action: 'get-channel-info', creatorId: TEST_CREATOR_ID }),
    });

    function makeCreatorRow(fanCount: string) {
      return {
        id: TEST_CREATOR_ID,
        username: 'creator',
        full_name: 'Creator',
        avatar_url: null,
        is_verified: false,
        channel_price_cents: 999,
        channel_description: null,
        fan_count: fanCount,
        subscriber_count: '0',
      };
    }

    it('returns Silver tier for 1000+ fans', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeCreatorRow('1000')] });
      const result = await handler(channelInfoEvent());
      expect(JSON.parse(result.body).channel.tier).toBe('Silver');
    });

    it('returns Gold tier for 10000+ fans', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeCreatorRow('10000')] });
      const result = await handler(channelInfoEvent());
      expect(JSON.parse(result.body).channel.tier).toBe('Gold');
    });

    it('returns Platinum tier for 100000+ fans', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeCreatorRow('100000')] });
      const result = await handler(channelInfoEvent());
      expect(JSON.parse(result.body).channel.tier).toBe('Platinum');
    });

    it('returns Diamond tier for 1000000+ fans', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [makeCreatorRow('1000000')] });
      const result = await handler(channelInfoEvent());
      expect(JSON.parse(result.body).channel.tier).toBe('Diamond');
    });
  });

  // ── Extended Coverage (Batch 7A) ────────────────────────────────

  describe('subscribe — error propagation and client.release', () => {
    const subscribeEvent = () => makeEvent({
      body: JSON.stringify({ action: 'subscribe', creatorId: TEST_CREATOR_ID }),
    });

    it('releases DB client when subscribe throws mid-flow (Stripe customer creation failure)', async () => {
      const { safeStripeCall } = require('../../../shared/stripe-resilience');

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: no stripe_customer_id (triggers customer creation)
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: null,
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      // Make safeStripeCall throw on the customers.create call
      (safeStripeCall as jest.Mock).mockRejectedValueOnce(new Error('Stripe customer creation failed'));

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      // client.release must still be called via finally block
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases DB client when checkout session creation fails', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: has existing stripe_customer_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });

      // checkout.sessions.create throws
      (stripe.checkout.sessions.create as jest.Mock).mockRejectedValueOnce(
        new Error('Checkout session creation failed')
      );

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns 500 when pool.connect itself fails', async () => {
      const { getPool } = require('../../../shared/db');
      const failingPool = { connect: jest.fn().mockRejectedValue(new Error('Connection pool exhausted')) };
      // First call for resolveProfileId uses pool.query, second getPool() for subscribe uses pool.connect
      (getPool as jest.Mock)
        .mockResolvedValueOnce(mockPool)   // for resolveProfileId
        .mockResolvedValueOnce(failingPool); // for subscribeToChannel

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
    });
  });

  describe('cancel — Stripe rejection and edge cases', () => {
    const cancelEvent = () => makeEvent({
      body: JSON.stringify({ action: 'cancel', subscriptionId: TEST_SUBSCRIPTION_ID }),
    });

    it('returns 500 when Stripe rejects the cancellation (subscription already ended)', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // Query: find active subscription with a stripe_subscription_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_already_ended' }],
      });

      // Stripe rejects: subscription is already canceled/ended
      (stripe.subscriptions.update as jest.Mock).mockRejectedValueOnce(
        new Error('No such subscription: sub_already_ended')
      );

      const result = await handler(cancelEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      // client.release still called via finally
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('returns 404 for an already-canceled subscription (status is no longer active)', async () => {
      // The SQL filters status = 'active', so a subscription with status = 'canceled'
      // or 'canceling' will not be returned → 404
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await handler(cancelEvent());
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Subscription not found');
    });

    it('passes stripe_subscription_id to Stripe even when it is null (DB allows null)', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // Query: subscription found but stripe_subscription_id is null
      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: null }],
      });

      // Stripe will reject null subscription ID
      (stripe.subscriptions.update as jest.Mock).mockRejectedValueOnce(
        new Error('Missing required param: subscription')
      );

      const result = await handler(cancelEvent());
      // The error propagates to the top-level catch → 500
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('releases DB client even when DB update after Stripe cancel fails', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // Query: find active subscription
      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: 'sub_stripe_456' }],
      });

      // Stripe cancel succeeds
      (stripe.subscriptions.update as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_456', cancel_at: 9999999999,
      });

      // DB UPDATE fails
      mockClient.query.mockRejectedValueOnce(new Error('DB write timeout'));

      const result = await handler(cancelEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Internal server error');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('subscribe — Stripe product search branches', () => {
    const subscribeEvent = () => makeEvent({
      body: JSON.stringify({ action: 'subscribe', creatorId: TEST_CREATOR_ID }),
    });

    function setupValidSubscribeFlow() {
      // validateSubscriptionEligibility: no existing sub
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // validateSubscriptionEligibility: creator found and valid
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          stripe_account_id: 'acct_creator',
          channel_price_cents: 999,
          username: 'creatoruser',
          full_name: 'Creator Name',
          fan_count: '500',
        }],
      });
      // fan query: has existing stripe_customer_id
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          stripe_customer_id: 'cus_existing',
          email: 'fan@test.com',
          full_name: 'Fan Name',
          cognito_sub: TEST_SUB,
        }],
      });
    }

    it('reuses existing active product from Stripe search and does not create new one', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // products.search returns an active product
      (stripe.products.search as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'prod_reused_123' }],
      });
      // prices.list returns a matching price for the existing product
      (stripe.prices.list as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'price_reused_456', unit_amount: 999 }],
      });

      setupValidSubscribeFlow();

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // Product was reused, not created
      expect(stripe.products.create).not.toHaveBeenCalled();
      // Price was also reused
      expect(stripe.prices.create).not.toHaveBeenCalled();
      // Checkout session was called with the reused price
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_reused_456', quantity: 1 }],
        })
      );
    });

    it('creates new product when search returns empty (inactive products are filtered by query)', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // products.search returns empty (all products are inactive or none exist)
      (stripe.products.search as jest.Mock).mockResolvedValueOnce({ data: [] });
      // products.create returns new product
      (stripe.products.create as jest.Mock).mockResolvedValueOnce({ id: 'prod_new_789' });

      setupValidSubscribeFlow();

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // New product was created since search returned empty
      expect(stripe.products.create).toHaveBeenCalledWith(expect.objectContaining({
        name: "creatoruser's Channel",
        metadata: { creatorId: TEST_CREATOR_ID, type: 'channel_subscription' },
      }));
    });

    it('deactivates multiple old prices when price amount changes', async () => {
      const stripe = await require('../../../shared/stripe-client').getStripeClient();

      // prices.list returns multiple prices with different amounts (none matching 999)
      (stripe.prices.list as jest.Mock).mockResolvedValueOnce({
        data: [
          { id: 'price_old_a', unit_amount: 500 },
          { id: 'price_old_b', unit_amount: 799 },
          { id: 'price_old_c', unit_amount: 1200 },
        ],
      });

      setupValidSubscribeFlow();

      const result = await handler(subscribeEvent());
      expect(result.statusCode).toBe(200);
      // All three old prices should be deactivated
      expect(stripe.prices.update).toHaveBeenCalledTimes(3);
      expect(stripe.prices.update).toHaveBeenCalledWith('price_old_a', { active: false });
      expect(stripe.prices.update).toHaveBeenCalledWith('price_old_b', { active: false });
      expect(stripe.prices.update).toHaveBeenCalledWith('price_old_c', { active: false });
      // New price created at 999 cents
      expect(stripe.prices.create).toHaveBeenCalledWith(expect.objectContaining({
        unit_amount: 999,
      }));
    });
  });

  describe('list-subscriptions — empty result', () => {
    it('returns 200 with empty subscriptions array when user has no active subscriptions', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({ body: JSON.stringify({ action: 'list-subscriptions' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.subscriptions).toEqual([]);
      expect(body.subscriptions).toHaveLength(0);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('get-subscribers — edge cases', () => {
    it('returns empty subscribers list with zero earnings when no subscriptions exist', async () => {
      // subscribers query: empty
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // earnings query: COALESCE returns '0'
      mockClient.query.mockResolvedValueOnce({ rows: [{ total_gross: '0', total_net: '0' }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-subscribers' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.subscriberCount).toBe(0);
      expect(body.subscribers).toEqual([]);
      expect(body.earnings.totalGross).toBe(0);
      expect(body.earnings.totalNet).toBe(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('handles null earnings values gracefully (parseInt fallback to 0)', async () => {
      // subscribers query: one subscriber
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: 'sub-1', fan_id: 'fan-uuid-1', status: 'active', price_cents: 499,
          created_at: '2025-03-01', username: 'fan1', full_name: 'Fan One', avatar_url: null,
        }],
      });
      // earnings query: null values (edge case if COALESCE somehow not applied)
      mockClient.query.mockResolvedValueOnce({ rows: [{ total_gross: null, total_net: null }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-subscribers' }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.subscriberCount).toBe(1);
      // parseInt(null) returns NaN, || 0 fallback applies
      expect(body.earnings.totalGross).toBe(0);
      expect(body.earnings.totalNet).toBe(0);
    });
  });

  describe('set-price — boundary edge cases', () => {
    it('returns 400 for price of 99 cents (one below minimum)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 99 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('between $1 and $999');
    });

    it('returns 400 for price of 99901 cents (one above maximum)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_creator' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 99901 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('between $1 and $999');
    });

    it('returns 403 for pro_business account (only pro_creator allowed)', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'pro_business' }] });
      const event = makeEvent({ body: JSON.stringify({ action: 'set-price', pricePerMonth: 999 }) });
      const result = await handler(event);
      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Only Pro Creators can set channel prices');
    });
  });

  describe('get-channel-info — additional edge cases', () => {
    const channelInfoEvent = () => makeEvent({
      body: JSON.stringify({ action: 'get-channel-info', creatorId: TEST_CREATOR_ID }),
    });

    it('returns channel info even when creator has no stripe_account_id (not checked in this action)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          id: TEST_CREATOR_ID,
          username: 'newcreator',
          full_name: 'New Creator',
          avatar_url: null,
          is_verified: false,
          channel_price_cents: null,
          channel_description: null,
          fan_count: null,
          subscriber_count: '0',
        }],
      });

      const result = await handler(channelInfoEvent());
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.channel.pricePerMonth).toBeNull();
      expect(body.channel.fanCount).toBe(0);
      expect(body.channel.tier).toBe('Bronze');
      expect(body.channel.description).toBeNull();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
