/**
 * Tests for Stripe Identity Lambda handler
 * Validates identity verification subscription and session flows
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../payments/identity';

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
  getStripeClient: jest.fn(),
}));

jest.mock('../../../shared/secrets', () => ({
  getStripePublishableKey: jest.fn().mockResolvedValue('pk_test_123'),
}));

jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/constants', () => ({
  VERIFICATION_FEE_CENTS: 1490,
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  PLATFORM_NAME: 'smuppy',
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

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

describe('payments/identity handler', () => {
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockPool: { query: jest.Mock; connect: jest.Mock };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any; // stripe mock object

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    const { getPool } = require('../../../shared/db');
    (getPool as jest.Mock).mockResolvedValue(mockPool);

    // Build fresh stripe mock and wire it into getStripeClient
    s = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ id: 'pi_test', client_secret: 'pi_secret', amount: 1490 }),
        retrieve: jest.fn().mockResolvedValue({ id: 'pi_test', status: 'succeeded', metadata: { userId: TEST_PROFILE_ID } }),
      },
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }) },
      subscriptions: {
        retrieve: jest.fn().mockResolvedValue({ id: 'sub_test', status: 'active' }),
        create: jest.fn().mockResolvedValue({ id: 'sub_new', latest_invoice: { payment_intent: { client_secret: 'cs_sub_secret' } } }),
        update: jest.fn().mockResolvedValue({ id: 'sub_test', cancel_at: 1234567890, current_period_end: 1234567890 }),
      },
      identity: {
        verificationSessions: {
          create: jest.fn().mockResolvedValue({ id: 'vs_test', url: 'https://verify.stripe.com/test', status: 'requires_input' }),
          retrieve: jest.fn().mockResolvedValue({ id: 'vs_test', status: 'verified', url: 'https://verify.stripe.com/test', last_error: null, created: 1234567890, verified_outputs: { id_number_type: 'passport' } }),
        },
      },
      products: {
        search: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({ id: 'prod_test' }),
      },
      prices: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({ id: 'price_test' }),
        retrieve: jest.fn().mockResolvedValue({ id: 'price_test', unit_amount: 1490, currency: 'usd', recurring: { interval: 'month' } }),
      },
      invoices: { retrieve: jest.fn() },
    };
    const { getStripeClient } = require('../../../shared/stripe-client');
    (getStripeClient as jest.Mock).mockResolvedValue(s);
  });

  // ── Auth & Validation ──────────────────────────────────────────────

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
  });

  it('returns 400 for invalid action', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'invalid' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid action');
  });

  it('returns 400 for invalid returnUrl', async () => {
    const event = makeEvent({
      body: JSON.stringify({ action: 'create-session', returnUrl: 'https://evil.com/phish' }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid return URL');
  });

  it('confirm-subscription returns 400 when returnUrl missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('confirm-payment returns 400 when fields missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-payment' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('create-session returns 400 when returnUrl missing', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });

  // ── get-status ─────────────────────────────────────────────────────

  it('get-status returns not_started when no session', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ identity_verification_session_id: null, is_verified: false }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('not_started');
    expect(body.isVerified).toBe(false);
  });

  it('get-status returns 404 when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('get-status returns verified and updates DB', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ identity_verification_session_id: 'vs_x', is_verified: false }],
    });
    s.identity.verificationSessions.retrieve.mockResolvedValueOnce({
      id: 'vs_x', status: 'verified', last_error: null,
    });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).isVerified).toBe(true);
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('get-status returns pending without DB update', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ identity_verification_session_id: 'vs_p', is_verified: false }],
    });
    s.identity.verificationSessions.retrieve.mockResolvedValueOnce({
      id: 'vs_p', status: 'requires_input', last_error: null,
    });

    const event = makeEvent({ body: JSON.stringify({ action: 'get-status' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).isVerified).toBe(false);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  // ── get-report ─────────────────────────────────────────────────────

  it('get-report returns 400 when no session', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ identity_verification_session_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-report' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('get-report returns 400 when no rows', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-report' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('get-report returns 400 when not verified', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ identity_verification_session_id: 'vs_p' }] });
    s.identity.verificationSessions.retrieve.mockResolvedValueOnce({ id: 'vs_p', status: 'requires_input' });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-report' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('get-report returns verified report', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ identity_verification_session_id: 'vs_v' }] });
    s.identity.verificationSessions.retrieve.mockResolvedValueOnce({
      id: 'vs_v', status: 'verified', created: 1234567890, verified_outputs: { id_number_type: 'passport' },
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'get-report' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).documentType).toBe('passport');
  });

  // ── get-config ─────────────────────────────────────────────────────

  it('get-config returns pricing info', async () => {
    const event = makeEvent({ body: JSON.stringify({ action: 'get-config' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.amount).toBe(1490);
    expect(body.currency).toBe('usd');
    expect(body.interval).toBe('month');
  });

  // ── create-subscription ────────────────────────────────────────────

  it('create-subscription returns 404 when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('create-subscription returns active when already verified', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: true, verification_subscription_id: null }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).subscriptionActive).toBe(true);
  });

  it('create-subscription returns existing active subscription', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_subscription_id: 'sub_e' }],
    });
    s.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_e', status: 'active' });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).subscriptionActive).toBe(true);
  });

  it('create-subscription returns client secret for incomplete sub', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_subscription_id: 'sub_i' }],
    });
    s.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_i', status: 'incomplete', latest_invoice: 'inv_1' });
    s.invoices.retrieve.mockResolvedValueOnce({ payment_intent: { client_secret: 'cs_retry' } });

    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).clientSecret).toBe('cs_retry');
  });

  it('create-subscription creates new when existing sub invalid', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_subscription_id: 'sub_bad' }],
    });
    s.subscriptions.retrieve.mockRejectedValueOnce(new Error('No such subscription'));
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).subscriptionId).toBe('sub_new');
  });

  it('create-subscription creates new when no existing', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_subscription_id: null }],
    });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).subscriptionId).toBe('sub_new');
    expect(JSON.parse(result.body).clientSecret).toBe('cs_sub_secret');
  });

  it('create-subscription creates Stripe customer when none exists', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: null, is_verified: false, verification_subscription_id: null }],
    });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 }); // update stripe_customer_id
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 }); // update sub id

    const event = makeEvent({ body: JSON.stringify({ action: 'create-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(s.customers.create).toHaveBeenCalled();
  });

  // ── confirm-subscription ───────────────────────────────────────────

  it('confirm-subscription returns 404 when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('confirm-subscription returns 402 when no sub', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ verification_subscription_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(402);
  });

  it('confirm-subscription returns 402 when sub not active', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ verification_subscription_id: 'sub_pd' }] });
    s.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_pd', status: 'past_due' });
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(402);
  });

  it('confirm-subscription creates verification session when active', async () => {
    s.subscriptions.retrieve.mockResolvedValueOnce({ id: 'sub_a', status: 'active' });
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ verification_subscription_id: 'sub_a' }] })
      .mockResolvedValueOnce({ rowCount: 1 }) // update payment status
      .mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: null, verification_payment_status: 'paid' }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // update session id

    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-subscription', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).sessionId).toBe('vs_test');
  });

  // ── cancel-subscription ────────────────────────────────────────────

  it('cancel-subscription returns 400 when no sub', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ verification_subscription_id: null }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('cancel-subscription returns 400 when no rows', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'cancel-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('cancel-subscription cancels at period end', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ verification_subscription_id: 'sub_c' }] });
    s.subscriptions.update.mockResolvedValueOnce({ id: 'sub_c', cancel_at: 1700000000, current_period_end: 1700000000 });

    const event = makeEvent({ body: JSON.stringify({ action: 'cancel-subscription' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).cancelAt).toBe(1700000000);
  });

  // ── create-payment-intent ──────────────────────────────────────────

  it('create-payment-intent returns 404 when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('create-payment-intent returns 400 when already verified', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: true, verification_payment_id: null }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('create-payment-intent returns existing succeeded payment', async () => {
    s.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_s', status: 'succeeded', metadata: { userId: TEST_PROFILE_ID } });
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_payment_id: 'pi_s' }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).paymentCompleted).toBe(true);
  });

  it('create-payment-intent returns existing pending payment', async () => {
    s.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_p', status: 'requires_payment_method', client_secret: 'cs_p', amount: 1490 });
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_payment_id: 'pi_p' }],
    });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).paymentIntent.clientSecret).toBe('cs_p');
  });

  it('create-payment-intent creates new payment intent', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 't@t.com', full_name: 'T', stripe_customer_id: 'cus_x', is_verified: false, verification_payment_id: null }],
    });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).paymentIntent.id).toBe('pi_test');
    expect(JSON.parse(result.body).publishableKey).toBe('pk_test_123');
  });

  it('create-payment-intent creates customer if none', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: TEST_PROFILE_ID, email: 'n@t.com', full_name: 'N', stripe_customer_id: null, is_verified: false, verification_payment_id: null }],
    });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-payment-intent' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(s.customers.create).toHaveBeenCalled();
  });

  // ── confirm-payment ────────────────────────────────────────────────

  it('confirm-payment returns 400 when payment not succeeded', async () => {
    s.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_p', status: 'requires_payment_method', metadata: { userId: TEST_PROFILE_ID } });
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-payment', paymentIntentId: 'pi_p', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it('confirm-payment returns 403 when payment belongs to other user', async () => {
    s.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_o', status: 'succeeded', metadata: { userId: 'other-user' } });
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-payment', paymentIntentId: 'pi_o', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });

  it('confirm-payment creates verification session on success', async () => {
    s.paymentIntents.retrieve.mockResolvedValueOnce({ id: 'pi_s', status: 'succeeded', metadata: { userId: TEST_PROFILE_ID } });
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 1 }) // update payment status
      .mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: null, verification_payment_status: 'paid' }] })
      .mockResolvedValueOnce({ rowCount: 1 }); // update session id
    const event = makeEvent({ body: JSON.stringify({ action: 'confirm-payment', paymentIntentId: 'pi_s', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).sessionId).toBe('vs_test');
  });

  // ── create-session ─────────────────────────────────────────────────

  it('create-session returns 404 when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it('create-session returns 402 when fee not paid', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: null, verification_payment_status: 'pending' }] });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(402);
  });

  it('create-session reuses existing requires_input session', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: 'vs_e', verification_payment_status: 'paid' }] });
    s.identity.verificationSessions.retrieve.mockResolvedValueOnce({ id: 'vs_e', status: 'requires_input', url: 'https://verify.stripe.com/e' });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).sessionId).toBe('vs_e');
  });

  it('create-session creates new when existing expired', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: 'vs_exp', verification_payment_status: 'paid' }] });
    s.identity.verificationSessions.retrieve.mockRejectedValueOnce(new Error('expired'));
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).sessionId).toBe('vs_test');
  });

  it('create-session creates new when no existing', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ email: 't@t.com', identity_verification_session_id: null, verification_payment_status: 'paid' }] });
    mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
    const event = makeEvent({ body: JSON.stringify({ action: 'create-session', returnUrl: 'smuppy://v' }) });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).sessionId).toBe('vs_test');
  });
});
