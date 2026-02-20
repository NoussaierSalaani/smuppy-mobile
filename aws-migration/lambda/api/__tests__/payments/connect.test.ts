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
});
