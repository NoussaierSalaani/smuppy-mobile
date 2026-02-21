/**
 * Tests for refunds Lambda handler
 * Validates refund creation, listing, and detail retrieval
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler as _handler } from '../../payments/refunds';
const handler = _handler as unknown as (event: APIGatewayProxyEvent) => Promise<{ statusCode: number; body: string; headers?: Record<string, string> }>;

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
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
      retrieve: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
    },
  }),
}));

jest.mock('../../utils/auth', () => ({
  getUserFromEvent: jest.fn().mockReturnValue({ id: 'cognito-sub-test123', sub: 'cognito-sub-test123' }),
  resolveProfileId: jest.fn().mockResolvedValue('a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn().mockReturnValue(true),
}));

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_PAYMENT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: overrides.path as string ?? '/payments/refunds',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: { claims: { sub: TEST_SUB } },
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

// ── Tests ────────────────────────────────────────────────────────────

const TEST_REFUND_ID = 'f1234567-abcd-4321-ef01-abcdef012345';

describe('payments/refunds handler', () => {
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
    const { getStripeClient } = require('../../../shared/stripe-client');
    (getStripeClient as jest.Mock).mockResolvedValue({
      refunds: {
        create: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
        retrieve: jest.fn().mockResolvedValue({ id: 're_test', status: 'succeeded', amount: 5000, currency: 'usd', created: 1234567890 }),
      },
    });
  });

  // ── Preflight / Auth / Rate Limit / Profile ─────────────────────────

  it('returns 204 for OPTIONS preflight', async () => {
    const event = makeEvent({ httpMethod: 'OPTIONS' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(204);
  });

  it('returns 401 when unauthenticated', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockReturnValueOnce(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(401);
  });

  it('returns 429 when rate limited (GET — read path)', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(429);
  });

  it('returns 429 when rate limited (POST — write path)', async () => {
    const { requireRateLimit } = require('../../utils/rate-limit');
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429, headers: {}, body: JSON.stringify({ message: 'Rate limited' }),
    });
    const event = makeEvent({ httpMethod: 'POST', path: '/payments/refunds', body: JSON.stringify({}) });
    const result = await handler(event);
    expect(result!.statusCode).toBe(429);
  });

  it('returns 404 when profile not found', async () => {
    const { resolveProfileId } = require('../../utils/auth');
    (resolveProfileId as jest.Mock).mockResolvedValueOnce(null);
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(404);
  });

  it('returns 405 for unsupported method', async () => {
    const event = makeEvent({ httpMethod: 'PUT', path: '/payments/refunds' });
    const result = await handler(event);
    expect(result!.statusCode).toBe(405);
  });

  it('returns 500 on unexpected error', async () => {
    const { getUserFromEvent } = require('../../utils/auth');
    (getUserFromEvent as jest.Mock).mockImplementationOnce(() => { throw new Error('Unexpected'); });
    const event = makeEvent();
    const result = await handler(event);
    expect(result!.statusCode).toBe(500);
  });

  // ── List Refunds (GET /payments/refunds) ────────────────────────────

  describe('listRefunds', () => {
    it('lists refunds for non-admin user (empty)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // admin check
        .mockResolvedValueOnce({ rows: [] }); // refunds query
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
      expect(body.refunds).toEqual([]);
      expect(body.hasMore).toBe(false);
      expect(body.nextCursor).toBeNull();
    });

    it('lists refunds for admin user (sees all)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
        .mockResolvedValueOnce({ rows: [] }); // refunds query (no user filter)
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.success).toBe(true);
    });

    it('applies status filter when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // admin check
        .mockResolvedValueOnce({ rows: [] }); // refunds query
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: { status: 'succeeded' },
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      // Verify the status param was passed
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('r.status =');
      expect(queryCall[1]).toContain('succeeded');
    });

    it('applies cursor pagination when cursor is a valid date', async () => {
      const cursorDate = '2026-01-15T10:00:00.000Z';
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // admin check
        .mockResolvedValueOnce({ rows: [] }); // refunds query
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: { cursor: cursorDate },
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      // Verify cursor was used as timestamptz param
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).toContain('r.created_at <');
    });

    it('ignores cursor when it is an invalid date', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // admin check
        .mockResolvedValueOnce({ rows: [] }); // refunds query
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: { cursor: 'not-a-date' },
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      // Query should NOT have timestamptz clause
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[0]).not.toContain('r.created_at <');
    });

    it('applies custom limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: { limit: '5' },
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      // Limit param should be 6 (5 + 1 for hasMore detection)
      const queryCall = mockPool.query.mock.calls[1];
      expect(queryCall[1][queryCall[1].length - 1]).toBe(6);
    });

    it('returns hasMore=true and nextCursor when more results exist', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        id: `refund-${i}`,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: null,
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: new Date(2026, 0, 20 - i).toISOString(),
        processed_at: null,
      }));
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows });
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
      const result = await handler(event);
      const body = JSON.parse(result!.body);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toBeDefined();
      expect(body.refunds.length).toBe(20);
    });

    it('formats refund list items correctly (camelCase mapping)', async () => {
      const row = {
        id: 'refund-1',
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: 'some note',
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: '2026-01-20T01:00:00Z',
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [row] });
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
      const result = await handler(event);
      const body = JSON.parse(result!.body);
      expect(body.refunds[0]).toEqual({
        id: 'refund-1',
        paymentId: TEST_PAYMENT_ID,
        stripeRefundId: 're_test',
        amount: 50, // 5000 / 100
        reason: 'duplicate',
        status: 'succeeded',
        notes: 'some note',
        buyer: { username: 'buyer', name: 'Buyer Name' },
        creator: { username: 'creator', name: 'Creator Name' },
        createdAt: '2026-01-20T00:00:00Z',
        processedAt: '2026-01-20T01:00:00Z',
      });
    });

    it('handles null queryStringParameters gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: null,
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
    });

    it('combines status + cursor + admin filters', async () => {
      const cursorDate = '2026-01-15T10:00:00.000Z';
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        httpMethod: 'GET',
        path: '/payments/refunds',
        queryStringParameters: { status: 'pending', cursor: cursorDate, limit: '10' },
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const queryCall = mockPool.query.mock.calls[1];
      // Admin: no buyer/creator filter in WHERE clause; status present; cursor present
      expect(queryCall[0]).not.toContain('AND (p.buyer_id = $');
      expect(queryCall[0]).toContain('r.status =');
      expect(queryCall[0]).toContain('r.created_at <');
    });
  });

  // ── Get Refund (GET /payments/refunds/{refundId}) ───────────────────

  describe('getRefund', () => {
    it('returns 400 when refundId is invalid UUID', async () => {
      const { isValidUUID } = require('../../utils/security');
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds/bad-uuid' });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid refund ID format');
    });

    it('returns 404 when refund not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // refund query returns empty
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Refund not found');
    });

    it('returns 403 when non-admin user is not buyer or creator', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: null,
        buyer_id: 'other-buyer-id',
        creator_id: 'other-creator-id',
        buyer_username: 'other_buyer',
        buyer_name: 'Other Buyer',
        creator_username: 'other_creator',
        creator_name: 'Other Creator',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] }) // refund found
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }); // admin check
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(403);
      expect(JSON.parse(result!.body).message).toBe('Forbidden');
    });

    it('allows access when user is the buyer', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: 'refund note',
        buyer_id: TEST_PROFILE_ID,
        creator_id: 'other-creator-id',
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: '2026-01-20T01:00:00Z',
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] }) // refund found
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }); // admin check
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.refund.id).toBe(TEST_REFUND_ID);
      expect(body.refund.stripeDetails).toBeDefined();
    });

    it('allows access when user is the creator', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: null,
        buyer_id: 'other-buyer-id',
        creator_id: TEST_PROFILE_ID,
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] })
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
    });

    it('allows access when user is admin (even if not buyer/creator)', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: null,
        buyer_id: 'other-buyer-id',
        creator_id: 'other-creator-id',
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] })
        .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }); // admin
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
    });

    it('returns null stripeDetails when stripe_refund_id is null', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: null, // no Stripe refund
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'pending',
        notes: null,
        buyer_id: TEST_PROFILE_ID,
        creator_id: 'other-creator-id',
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] })
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.refund.stripeDetails).toBeNull();
    });

    it('returns null stripeDetails when Stripe retrieve fails', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: {
          create: jest.fn(),
          retrieve: jest.fn().mockRejectedValue(new Error('Stripe API error')),
        },
      });
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_stripe_123',
        amount_cents: 5000,
        reason: 'duplicate',
        status: 'succeeded',
        notes: null,
        buyer_id: TEST_PROFILE_ID,
        creator_id: 'other-creator-id',
        buyer_username: 'buyer',
        buyer_name: 'Buyer Name',
        creator_username: 'creator',
        creator_name: 'Creator Name',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: null,
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] })
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      expect(result!.statusCode).toBe(200);
      const body = JSON.parse(result!.body);
      expect(body.refund.stripeDetails).toBeNull();
    });

    it('formats refund detail with all fields (camelCase mapping)', async () => {
      const refundRow = {
        id: TEST_REFUND_ID,
        payment_id: TEST_PAYMENT_ID,
        stripe_refund_id: 're_test',
        amount_cents: 2500,
        reason: 'requested_by_customer',
        status: 'succeeded',
        notes: 'customer requested',
        buyer_id: TEST_PROFILE_ID,
        creator_id: 'creator-id-123',
        buyer_username: 'buyer_user',
        buyer_name: 'Buyer Full',
        creator_username: 'creator_user',
        creator_name: 'Creator Full',
        created_at: '2026-01-20T00:00:00Z',
        processed_at: '2026-01-20T01:00:00Z',
      };
      mockPool.query
        .mockResolvedValueOnce({ rows: [refundRow] })
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      const event = makeEvent({ httpMethod: 'GET', path: `/payments/refunds/${TEST_REFUND_ID}` });
      const result = await handler(event);
      const body = JSON.parse(result!.body);
      expect(body.refund.paymentId).toBe(TEST_PAYMENT_ID);
      expect(body.refund.amount).toBe(25); // 2500/100
      expect(body.refund.buyer.id).toBe(TEST_PROFILE_ID);
      expect(body.refund.creator.id).toBe('creator-id-123');
      expect(body.refund.notes).toBe('customer requested');
      expect(body.refund.processedAt).toBe('2026-01-20T01:00:00Z');
    });
  });

  // ── Create Refund (POST /payments/refunds) ──────────────────────────

  describe('createRefund', () => {
    const makePaymentRow = (overrides: Record<string, unknown> = {}) => ({
      id: TEST_PAYMENT_ID,
      buyer_id: TEST_PROFILE_ID,
      creator_id: 'creator-id-123',
      status: 'succeeded',
      amount_cents: 5000,
      stripe_payment_intent_id: 'pi_test123',
      currency: 'eur',
      creator_stripe_account: null,
      ...overrides,
    });

    // ── Validation branches ──

    it('returns 400 when paymentId missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('paymentId and reason are required');
    });

    it('returns 400 when reason missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('paymentId and reason are required');
    });

    it('returns 400 when body is empty (null event.body)', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: null,
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('paymentId and reason are required');
    });

    it('returns 400 for invalid reason', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'revenge' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid refund reason');
    });

    it('returns 400 for invalid paymentId UUID', async () => {
      const { isValidUUID } = require('../../utils/security');
      (isValidUUID as jest.Mock).mockReturnValueOnce(false);
      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: 'bad-id', reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Invalid paymentId format');
    });

    // ── Payment validation branches ──

    it('returns 404 when payment not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // payment not found

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(404);
      expect(JSON.parse(result!.body).message).toBe('Payment not found');
    });

    it('returns 403 when non-admin is not buyer or creator of payment', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow({ buyer_id: 'other-buyer', creator_id: 'other-creator' })] });

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(403);
      expect(JSON.parse(result!.body).message).toBe('Forbidden');
      // Verify ROLLBACK was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('allows admin to refund any payment (even not buyer/creator)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
        .mockResolvedValueOnce(undefined); // notification insert
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow({ buyer_id: 'other-buyer', creator_id: 'other-creator' })] }) // payment
        .mockResolvedValueOnce({ rows: [] }) // existing refund check
        .mockResolvedValueOnce({ rows: [{ id: 'new-refund-id' }] }) // refund insert
        .mockResolvedValueOnce(undefined) // payment status update
        .mockResolvedValueOnce(undefined); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'fraudulent' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(201);
    });

    it('returns 400 when payment status is not succeeded', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow({ status: 'pending' })] });

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Only succeeded payments can be refunded');
    });

    it('returns 400 when refund already exists (pending)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] }) // payment found
        .mockResolvedValueOnce({ rows: [{ id: 'existing-refund' }] }); // existing refund

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('A refund already exists for this payment');
    });

    // ── Amount calculation branches ──

    it('uses full payment amount when no amount provided (full refund)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] }) // payment
        .mockResolvedValueOnce({ rows: [] }) // no existing refund
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] }) // refund insert
        .mockResolvedValueOnce(undefined) // payment status update
        .mockResolvedValueOnce(undefined); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(201);
      const body = JSON.parse(result!.body);
      expect(body.refund.amount).toBe(50); // 5000/100
      // Verify payment status set to 'refunded' (full amount)
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE payments')
      );
      expect(updateCall![1][0]).toBe('refunded');
    });

    it('uses custom amount for partial refund', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] }) // payment
        .mockResolvedValueOnce({ rows: [] }) // no existing refund
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] }) // refund insert
        .mockResolvedValueOnce(undefined) // payment status update
        .mockResolvedValueOnce(undefined); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'requested_by_customer', amount: 25 }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(201);
      const body = JSON.parse(result!.body);
      expect(body.refund.amount).toBe(25);
      // Verify payment status set to 'partially_refunded'
      const updateCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE payments')
      );
      expect(updateCall![1][0]).toBe('partially_refunded');
    });

    it('returns 400 when refund amount exceeds payment amount', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] }) // payment (5000 cents = $50)
        .mockResolvedValueOnce({ rows: [] }); // no existing refund

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate', amount: 100 }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Refund amount cannot exceed payment amount');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    // ── Stripe processing branches ──

    it('sets reverse_transfer when creator has a Stripe Connect account', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripeCreate = jest.fn().mockResolvedValue({ id: 're_connect', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockStripeCreate, retrieve: jest.fn() },
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow({ creator_stripe_account: 'acct_123' })] })
        .mockResolvedValueOnce({ rows: [] }) // no existing refund
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined) // payment update
        .mockResolvedValueOnce(undefined); // COMMIT

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({ reverse_transfer: true }),
        expect.any(Object),
      );
    });

    it('does NOT set reverse_transfer when creator_stripe_account is null', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockStripeCreate = jest.fn().mockResolvedValue({ id: 're_direct', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockStripeCreate, retrieve: jest.fn() },
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow({ creator_stripe_account: null })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({ reverse_transfer: true }),
        expect.any(Object),
      );
    });

    it('saves pending status when Stripe refund status is not succeeded', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: {
          create: jest.fn().mockResolvedValue({ id: 're_pending', status: 'pending' }),
          retrieve: jest.fn(),
        },
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(201);
      // Verify INSERT used 'pending' status
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO refunds')
      );
      expect(insertCall![1][5]).toBe('pending');
    });

    it('stores notes as null when not provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO refunds')
      );
      expect(insertCall![1][4]).toBeNull(); // notes || null -> null
    });

    it('stores notes when provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'other', notes: 'My refund note' }),
      });
      await handler(event);
      const insertCall = mockClient.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO refunds')
      );
      expect(insertCall![1][4]).toBe('My refund note');
    });

    // ── Stripe error path ──

    it('returns 400 and records failed refund when Stripe refund fails', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: {
          create: jest.fn().mockRejectedValue(new Error('Stripe declined')),
          retrieve: jest.fn(),
        },
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }) // admin check
        .mockResolvedValueOnce(undefined); // recordFailedRefund insert
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [makePaymentRow()] }) // payment
        .mockResolvedValueOnce({ rows: [] }); // no existing refund

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'technical_issue', notes: 'system issue' }),
      });
      const result = await handler(event);
      expect(result!.statusCode).toBe(400);
      expect(JSON.parse(result!.body).message).toBe('Failed to process refund');
      // Verify ROLLBACK on client
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      // Verify failed refund recorded via pool (outside transaction)
      const failedInsert = mockPool.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO refunds')
      );
      expect(failedInsert).toBeDefined();
      expect(failedInsert![1]).toContain('system issue');
    });

    it('records failed refund with null notes when notes not provided', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: {
          create: jest.fn().mockRejectedValue(new Error('Stripe error')),
          retrieve: jest.fn(),
        },
      });

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      const failedInsert = mockPool.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO refunds')
      );
      expect(failedInsert![1][3]).toBeNull(); // notes || null -> null
    });

    // ── Notification branches ──

    it('notifies creator when buyer requests refund', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined); // notification insert
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [makePaymentRow({ buyer_id: TEST_PROFILE_ID, creator_id: 'creator-id' })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      const notifCall = mockPool.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall![1][0]).toBe('creator-id'); // notify the creator
    });

    it('notifies buyer when creator requests refund', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [makePaymentRow({ buyer_id: 'buyer-id', creator_id: TEST_PROFILE_ID })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'creator_unavailable' }),
      });
      await handler(event);
      const notifCall = mockPool.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall![1][0]).toBe('buyer-id'); // notify the buyer
    });

    it('uses EUR currency default when payment.currency is null in notification', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] })
        .mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [makePaymentRow({ currency: null })] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      const notifCall = mockPool.query.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO notifications')
      );
      expect(notifCall![1][1]).toContain('EUR'); // default currency
    });

    // ── Stripe reason mapping branches ──

    it('maps "duplicate" reason to Stripe "duplicate"', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockCreate = jest.fn().mockResolvedValue({ id: 're_1', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockCreate, retrieve: jest.fn() },
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }).mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'r1' }] })
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST', path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'duplicate' }), expect.any(Object));
    });

    it('maps "fraudulent" reason to Stripe "fraudulent"', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockCreate = jest.fn().mockResolvedValue({ id: 're_2', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockCreate, retrieve: jest.fn() },
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }).mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'r2' }] })
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST', path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'fraudulent' }),
      });
      await handler(event);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'fraudulent' }), expect.any(Object));
    });

    it('maps "session_cancelled" reason to Stripe "requested_by_customer"', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockCreate = jest.fn().mockResolvedValue({ id: 're_3', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockCreate, retrieve: jest.fn() },
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }).mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'r3' }] })
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST', path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'session_cancelled' }),
      });
      await handler(event);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'requested_by_customer' }), expect.any(Object));
    });

    it('maps "other" reason to Stripe "requested_by_customer"', async () => {
      const { getStripeClient } = require('../../../shared/stripe-client');
      const mockCreate = jest.fn().mockResolvedValue({ id: 're_4', status: 'succeeded' });
      (getStripeClient as jest.Mock).mockResolvedValue({
        refunds: { create: mockCreate, retrieve: jest.fn() },
      });
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] }).mockResolvedValueOnce(undefined);
      mockClient.query
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'r4' }] })
        .mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

      const event = makeEvent({
        httpMethod: 'POST', path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'other' }),
      });
      await handler(event);
      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'requested_by_customer' }), expect.any(Object));
    });

    // ── Transaction cleanup ──

    it('always releases client even when payment validation fails', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // payment not found

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate' }),
      });
      await handler(event);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('always releases client even when refund amount exceeds payment', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [makePaymentRow()] })
        .mockResolvedValueOnce({ rows: [] });

      const event = makeEvent({
        httpMethod: 'POST',
        path: '/payments/refunds',
        body: JSON.stringify({ paymentId: TEST_PAYMENT_ID, reason: 'duplicate', amount: 999 }),
      });
      await handler(event);
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ── checkAdminStatus edge case: no profile row ──

  describe('checkAdminStatus', () => {
    it('returns false when profile row has no account_type (undefined)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // admin check returns no rows -> undefined account_type
        .mockResolvedValueOnce({ rows: [] }); // refunds query
      const event = makeEvent({ httpMethod: 'GET', path: '/payments/refunds' });
      const result = await handler(event);
      // Should still succeed (treated as non-admin)
      expect(result!.statusCode).toBe(200);
    });
  });
});
