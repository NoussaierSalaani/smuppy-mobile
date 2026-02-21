/**
 * Tests for Stripe Connect Lambda handler
 * Validates connect account creation, linking, status, dashboard, balance, admin actions
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/connect';

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
    accounts: {
      create: jest.fn().mockResolvedValue({ id: 'acct_test' }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'acct_test',
        type: 'express',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: {
          currently_due: [],
          eventually_due: [],
          past_due: [],
          disabled_reason: null,
        },
      }),
      createLoginLink: jest.fn().mockResolvedValue({ url: 'https://dashboard.stripe.com/login' }),
    },
    accountLinks: {
      create: jest.fn().mockResolvedValue({
        url: 'https://connect.stripe.com/setup',
        expires_at: 1234567890,
      }),
    },
    balance: {
      retrieve: jest.fn().mockResolvedValue({
        available: [{ amount: 10000, currency: 'usd' }],
        pending: [{ amount: 5000, currency: 'usd' }],
      }),
    },
  }),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Users: [{ Attributes: [{ Name: 'email', Value: 'test@test.com' }] }],
    }),
  })),
  ListUsersCommand: jest.fn(),
}));

jest.mock('../../../shared/secrets', () => ({
  getAdminKey: jest.fn().mockResolvedValue('real-admin-key-for-testing'),
  getStripeKey: jest.fn().mockResolvedValue('sk_test_key'),
}));

// ── Default Stripe mock value (reused in beforeEach) ────────────────

const DEFAULT_STRIPE_MOCK = {
  accounts: {
    create: jest.fn().mockResolvedValue({ id: 'acct_test' }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'acct_test',
      type: 'express',
      charges_enabled: true,
      payouts_enabled: true,
      requirements: {
        currently_due: [],
        eventually_due: [],
        past_due: [],
        disabled_reason: null,
      },
    }),
    createLoginLink: jest.fn().mockResolvedValue({ url: 'https://dashboard.stripe.com/login' }),
  },
  accountLinks: {
    create: jest.fn().mockResolvedValue({
      url: 'https://connect.stripe.com/setup',
      expires_at: 1234567890,
    }),
  },
  balance: {
    retrieve: jest.fn().mockResolvedValue({
      available: [{ amount: 10000, currency: 'usd' }],
      pending: [{ amount: 5000, currency: 'usd' }],
    }),
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: overrides.headers as Record<string, string> ?? {},
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

describe('payments/connect handler', () => {
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
    // Reset stripe mock to default (tests that override must use mockResolvedValue within their scope)
    const { getStripeClient } = require('../../../shared/stripe-client');
    (getStripeClient as jest.Mock).mockResolvedValue(DEFAULT_STRIPE_MOCK);
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ sub: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 429 when rate limited', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Too many requests' }),
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('get-status returns hasAccount: false when no stripe account', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.hasAccount).toBe(false);
    expect(body.status).toBe('not_created');
  });

  it('get-status returns active status when stripe account has charges enabled', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.hasAccount).toBe(true);
    expect(body.status).toBe('active');
    expect(body.chargesEnabled).toBe(true);
  });

  it('create-account returns existing account if already created', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ stripe_account_id: 'acct_existing', email: 'test@test.com', cognito_sub: TEST_SUB }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.accountId).toBe('acct_existing');
    expect(body.message).toBe('Account already exists');
  });

  it('create-link returns 400 for invalid returnUrl', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        action: 'create-link',
        returnUrl: 'https://evil.com/phish',
        refreshUrl: 'smuppy://refresh',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid return URL');
  });

  it('create-link returns 400 for invalid refreshUrl', async () => {
    const event = makeEvent({
      body: JSON.stringify({
        action: 'create-link',
        returnUrl: 'smuppy://return',
        refreshUrl: 'https://evil.com/phish',
      }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid refresh URL');
  });

  it('get-balance returns 400 when no connect account', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('admin-set-account returns 403 without admin key', async () => {
    const event = makeEvent({
      body: JSON.stringify({ action: 'admin-set-account', targetProfileId: TEST_PROFILE_ID, stripeAccountId: 'acct_123' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  // ── create-account: new account creation ──

  describe('create-account', () => {
    it('creates a new Connect account when no existing account', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: null, email: 'user@test.com', cognito_sub: TEST_SUB }] })
        .mockResolvedValueOnce({ rows: [] }); // UPDATE profiles

      const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.accountId).toBe('acct_test');
    });

    it('returns 404 when user not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('User not found');
    });

    it('returns 400 when no email found and Cognito lookup fails', async () => {
      // Profile has no email and no cognito_sub
      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_account_id: null, email: null, cognito_sub: null }],
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No email found for this account');
    });

    it('fetches email from Cognito when missing in profile and updates profile', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ stripe_account_id: null, email: null, cognito_sub: TEST_SUB }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE profiles SET email
        .mockResolvedValueOnce({ rows: [] }); // UPDATE profiles SET stripe_account_id

      const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.accountId).toBe('acct_test');
    });

    it('returns 400 when Cognito does not return email', async () => {
      const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
      CognitoIdentityProviderClient.mockImplementationOnce(() => ({
        send: jest.fn().mockResolvedValue({ Users: [{ Attributes: [] }] }),
      }));

      mockClient.query.mockResolvedValueOnce({
        rows: [{ stripe_account_id: null, email: null, cognito_sub: TEST_SUB }],
      });

      const event = makeEvent({ body: JSON.stringify({ action: 'create-account' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No email found for this account');
    });
  });

  // ── create-link ──

  describe('create-link', () => {
    it('returns account link URL when valid URLs and account exists', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const event = makeEvent({
        body: JSON.stringify({
          action: 'create-link',
          returnUrl: 'smuppy://return',
          refreshUrl: 'smuppy://refresh',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.url).toBe('https://connect.stripe.com/setup');
      expect(body.expiresAt).toBe(1234567890);
    });

    it('returns 400 when no Connect account exists', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });

      const event = makeEvent({
        body: JSON.stringify({
          action: 'create-link',
          returnUrl: 'smuppy://return',
          refreshUrl: 'smuppy://refresh',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No Connect account found. Create one first.');
    });

    it('accepts https://smuppy.com URLs', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const event = makeEvent({
        body: JSON.stringify({
          action: 'create-link',
          returnUrl: 'https://smuppy.com/return',
          refreshUrl: 'https://www.smuppy.com/refresh',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('returns 400 when returnUrl is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          action: 'create-link',
          refreshUrl: 'smuppy://refresh',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid return URL');
    });

    it('returns 400 when refreshUrl is missing', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          action: 'create-link',
          returnUrl: 'smuppy://return',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid refresh URL');
    });
  });

  // ── get-status: pending status ──

  describe('get-status extended', () => {
    it('returns pending status when charges are not enabled', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const pendingStripe = {
        accounts: {
          create: jest.fn(),
          retrieve: jest.fn().mockResolvedValue({
            id: 'acct_test',
            charges_enabled: false,
            payouts_enabled: false,
            requirements: {
              currently_due: ['identity.document'],
              eventually_due: [],
              past_due: [],
              disabled_reason: 'requirements.pending_verification',
            },
          }),
          createLoginLink: jest.fn(),
        },
        accountLinks: { create: jest.fn() },
        balance: { retrieve: jest.fn() },
      };
      const { getStripeClient } = require('../../../shared/stripe-client');
      // Must mock for both calls: top-level init + getAccountStatus internal call
      (getStripeClient as jest.Mock).mockResolvedValue(pendingStripe);

      const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('pending');
      expect(body.chargesEnabled).toBe(false);
      expect(body.requirements).toBeDefined();
      expect(body.requirements.currentlyDue).toEqual(['identity.document']);
    });

    it('returns null requirements when account has no requirements', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const noReqStripe = {
        accounts: {
          create: jest.fn(),
          retrieve: jest.fn().mockResolvedValue({
            id: 'acct_test',
            charges_enabled: true,
            payouts_enabled: true,
            requirements: null,
          }),
          createLoginLink: jest.fn(),
        },
        accountLinks: { create: jest.fn() },
        balance: { retrieve: jest.fn() },
      };
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue(noReqStripe);

      const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.requirements).toBeNull();
    });
  });

  // ── get-dashboard-link ──

  describe('get-dashboard-link', () => {
    it('returns dashboard link URL when account exists', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard-link' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.url).toBe('https://dashboard.stripe.com/login');
    });

    it('returns 400 when no Connect account for dashboard link', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: null }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-dashboard-link' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('No Connect account found');
    });
  });

  // ── get-balance ──

  describe('get-balance', () => {
    it('returns balance when account exists', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ stripe_account_id: 'acct_test' }] });

      const event = makeEvent({ body: JSON.stringify({ action: 'get-balance' }) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.balance.available).toEqual([{ amount: 10000, currency: 'usd' }]);
      expect(body.balance.pending).toEqual([{ amount: 5000, currency: 'usd' }]);
    });
  });

  // ── admin-set-account ──

  describe('admin-set-account', () => {
    const ADMIN_KEY = 'real-admin-key-for-testing';

    it('returns 403 without admin key header', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_admin123',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Admin key required');
    });

    it('returns 403 with incorrect admin key', async () => {
      const event = makeEvent({
        headers: { 'x-admin-key': 'wrong-key-value' },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_admin123',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Invalid admin key');
    });

    it('returns 400 when missing targetProfileId or stripeAccountId', async () => {
      const event = makeEvent({
        headers: { 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing targetProfileId or stripeAccountId');
    });

    it('returns 400 when Stripe account is not found', async () => {
      const failStripe = {
        accounts: {
          create: jest.fn(),
          retrieve: jest.fn().mockRejectedValue(new Error('No such account')),
          createLoginLink: jest.fn(),
        },
        accountLinks: { create: jest.fn() },
        balance: { retrieve: jest.fn() },
      };
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue(failStripe);

      const event = makeEvent({
        headers: { 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_nonexistent',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Stripe account not found');
    });

    it('returns 400 when Stripe account is not Express type', async () => {
      const customStripe = {
        accounts: {
          create: jest.fn(),
          retrieve: jest.fn().mockResolvedValue({ id: 'acct_custom', type: 'custom' }),
          createLoginLink: jest.fn(),
        },
        accountLinks: { create: jest.fn() },
        balance: { retrieve: jest.fn() },
      };
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue(customStripe);

      const event = makeEvent({
        headers: { 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_custom',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Only Express accounts are supported');
    });

    it('returns 409 when Stripe account already assigned to another user', async () => {
      // db.query is the pool-level query (not client-level)
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'other-profile-id' }],
      });

      const event = makeEvent({
        headers: { 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_express',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body).message).toBe('Stripe account already assigned to another user');
    });

    it('returns 200 and updates profile on success', async () => {
      // No existing assignment
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // existing assignment check
        .mockResolvedValueOnce({ rows: [] }); // UPDATE profiles

      const event = makeEvent({
        headers: { 'x-admin-key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_express_new',
        }),
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.targetProfileId).toBe(TEST_PROFILE_ID);
      expect(body.stripeAccountId).toBe('acct_express_new');
    });

    it('reads admin key from X-Admin-Key header (uppercase)', async () => {
      const event = makeEvent({
        headers: { 'X-Admin-Key': ADMIN_KEY },
        body: JSON.stringify({
          action: 'admin-set-account',
          targetProfileId: TEST_PROFILE_ID,
          stripeAccountId: 'acct_test',
        }),
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ── empty body handling ──

  describe('body parsing', () => {
    it('parses empty body as empty object', async () => {
      const event = makeEvent({ body: null });
      const result = await handler(event);

      // action is undefined → 'Invalid action'
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid action');
    });
  });
});
