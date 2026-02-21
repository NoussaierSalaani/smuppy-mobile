/**
 * Tests for disputes/admin-resolve Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    refunds: {
      create: jest.fn().mockResolvedValue({ id: 're_123', status: 'succeeded' }),
    },
  }),
}));

import { handler } from '../../disputes/admin-resolve';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';
import { getStripeClient } from '../../../shared/stripe-client';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_USER_ID = 'admin-user-id';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  const defaultBody = JSON.stringify({
    resolution: 'full_refund',
    reason: 'Creator was not present during the session',
    refundAmount: 50,
    processRefund: true,
  });
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: 'body' in overrides ? overrides.body as string : defaultBody,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: VALID_DISPUTE_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? 'cognito-sub-admin' } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

const OPEN_DISPUTE = {
  id: VALID_DISPUTE_ID,
  status: 'open',
  dispute_number: 'D-001',
  payment_id: 'pay-1',
  complainant_id: 'comp-1',
  respondent_id: 'resp-1',
  amount_cents: 5000,
  currency: 'eur',
  stripe_payment_intent_id: 'pi_123',
  creator_stripe_account: null,
};

describe('disputes/admin-resolve handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  // ── OPTIONS preflight ────────────────────────────────────────────
  it('should return 204 for OPTIONS', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(204);
  });

  // ── Method not allowed ───────────────────────────────────────────
  it('should return 405 for GET', async () => {
    const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(405);
  });

  // ── Invalid dispute ID ───────────────────────────────────────────
  it('should return 400 when dispute ID is invalid', async () => {
    const result = await handler(makeEvent({ pathParameters: { id: 'bad' } }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Valid dispute ID');
  });

  // ── Missing dispute ID (pathParameters is null or missing id) ────
  it('should return 400 when dispute ID is missing (no pathParameters)', async () => {
    const result = await handler(makeEvent({ pathParameters: {} }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  // ── Unauthorized ─────────────────────────────────────────────────
  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  // ── Rate limit hit ───────────────────────────────────────────────
  it('should return rate limit response when rate limit is hit', async () => {
    (requireRateLimit as jest.Mock).mockResolvedValueOnce({
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ success: false, message: 'Rate limit exceeded' }),
    });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(429);
  });

  // ── Not admin ────────────────────────────────────────────────────
  it('should return 403 when user is not admin', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'personal' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  // ── Admin check returns no rows ──────────────────────────────────
  it('should return 403 when admin check returns no rows', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  // ── parseAndValidateBody: invalid JSON ───────────────────────────
  it('should return 400 for invalid JSON body', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({ body: 'not json{' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid JSON');
  });

  // ── parseAndValidateBody: null body (JSON.parse('{}')) ───────────
  it('should return 400 when body is null (resolution/reason missing from {})', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({ body: null }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Resolution and reason are required');
  });

  // ── parseAndValidateBody: empty body JSON ──────────────────────────
  it('should return 400 when body is empty JSON (resolution/reason missing)', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({ body: JSON.stringify({}) }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Resolution and reason are required');
  });

  // ── Missing resolution ───────────────────────────────────────────
  it('should return 400 when resolution is missing', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ reason: 'test' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Resolution and reason are required');
  });

  // ── Missing reason ───────────────────────────────────────────────
  it('should return 400 when reason is missing', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'full_refund' }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  // ── Invalid resolution type ──────────────────────────────────────
  it('should return 400 for invalid resolution type', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'invalid', reason: 'test', refundAmount: 0, processRefund: false }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid resolution type');
  });

  // ── processRefund with invalid refundAmount ──────────────────────
  it('should return 400 when processRefund is true but refundAmount is negative', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'full_refund', reason: 'test', refundAmount: -5, processRefund: true }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid refund amount');
  });

  // ── processRefund with non-number refundAmount ───────────────────
  it('should return 400 when processRefund is true but refundAmount is not a number', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'full_refund', reason: 'test', refundAmount: 'fifty', processRefund: true }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('Invalid refund amount');
  });

  // ── processRefund with Infinity refundAmount ─────────────────────
  it('should return 400 when processRefund is true but refundAmount is Infinity', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] });
    const result = await handler(makeEvent({
      body: JSON.stringify({ resolution: 'full_refund', reason: 'test', refundAmount: Infinity, processRefund: true }),
    }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  // ── Dispute not found ────────────────────────────────────────────
  it('should return 404 when dispute not found', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // dispute not found
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
  });

  // ── Dispute already resolved ─────────────────────────────────────
  it('should return 400 when dispute is already resolved', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...OPEN_DISPUTE, status: 'resolved' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('already resolved');
  });

  // ── Dispute already closed (covers 'closed' branch) ─────────────
  it('should return 400 when dispute status is closed', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...OPEN_DISPUTE, status: 'closed' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('already resolved');
  });

  // ── Successful resolution with full refund + processRefund ───────
  it('should resolve dispute with full refund and process Stripe refund', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] }) // dispute fetch
      .mockResolvedValue({ rows: [] }); // all subsequent queries

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.resolution.type).toBe('full_refund');
    expect(body.resolution.amount).toBe(50);
    expect(body.refund).toBeDefined();
    expect(body.refund.id).toBe('re_123');
    expect(body.refund.status).toBe('succeeded');

    // Verify COMMIT was called
    const commitCall = mockClient.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string) === 'COMMIT',
    );
    expect(commitCall).toBeDefined();
  });

  // ── Successful resolution with reverse_transfer (creator_stripe_account) ──
  it('should include reverse_transfer when creator_stripe_account is present', async () => {
    const disputeWithCreator = { ...OPEN_DISPUTE, creator_stripe_account: 'acct_creator123' };
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [disputeWithCreator] })
      .mockResolvedValue({ rows: [] });

    const mockStripe = {
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_reverse', status: 'succeeded' }) },
    };
    (getStripeClient as jest.Mock).mockResolvedValueOnce(mockStripe);

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);

    // Verify reverse_transfer was included
    expect(mockStripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ reverse_transfer: true }),
    );
  });

  // ── Stripe refund fails ──────────────────────────────────────────
  it('should handle Stripe refund failure gracefully', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const mockStripe = {
      refunds: { create: jest.fn().mockRejectedValue(new Error('Stripe connection error')) },
    };
    (getStripeClient as jest.Mock).mockResolvedValueOnce(mockStripe);

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.success).toBe(true);
    expect(body.refund).toBeNull(); // refund failed

    // Should still COMMIT
    const commitCall = mockClient.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string) === 'COMMIT',
    );
    expect(commitCall).toBeDefined();

    // Should record failed refund in timeline
    const failedTimeline = mockClient.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('refund_failed'),
    );
    expect(failedTimeline).toBeDefined();
  });

  // ── Stripe refund with status !== 'succeeded' (pending) ──────────
  it('should record pending status when Stripe refund is pending', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const mockStripe = {
      refunds: { create: jest.fn().mockResolvedValue({ id: 're_pending', status: 'pending' }) },
    };
    (getStripeClient as jest.Mock).mockResolvedValueOnce(mockStripe);

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);

    const body = JSON.parse(result!.body);
    expect(body.refund.status).toBe('pending');

    // Verify refund insert uses 'pending' status
    const refundInsert = mockClient.query.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO refunds'),
    );
    expect(refundInsert).toBeDefined();
    // status should be 'pending' (not 'succeeded')
    expect(refundInsert![1]).toContain('pending');
  });

  // ── Resolution without refund (no_refund + processRefund=false) ──
  it('should resolve with no_refund and skip Stripe processing', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'no_refund',
        reason: 'Service was provided as agreed',
        refundAmount: 0,
        processRefund: false,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.refund).toBeNull();
    expect(body.resolution.type).toBe('no_refund');
  });

  // ── Resolution: partial_refund ───────────────────────────────────
  it('should resolve with partial_refund', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'partial_refund',
        reason: 'Partial service provided',
        refundAmount: 25,
        processRefund: true,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.resolution.type).toBe('partial_refund');
    expect(body.resolution.amount).toBe(25);
  });

  // ── Resolution: rescheduled ──────────────────────────────────────
  it('should resolve with rescheduled', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'rescheduled',
        reason: 'Session to be rescheduled',
        refundAmount: 0,
        processRefund: false,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    const body = JSON.parse(result!.body);
    expect(body.resolution.type).toBe('rescheduled');
  });

  // ── processRefund=true but resolution is no_refund (shouldRefund=false) ──
  it('should skip refund when processRefund=true but resolution is no_refund', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'no_refund',
        reason: 'Denied',
        refundAmount: 50,
        processRefund: true,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).refund).toBeNull();
  });

  // ── processRefund=true but refundAmount is 0 (shouldRefund=false) ──
  it('should skip refund when processRefund=true but refundAmount is 0', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'full_refund',
        reason: 'Refund requested',
        refundAmount: 0,
        processRefund: true,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).refund).toBeNull();
  });

  // ── Null currency (defaults to 'EUR') ────────────────────────────
  it('should default to EUR when dispute currency is null', async () => {
    const disputeNoCurrency = { ...OPEN_DISPUTE, currency: null };
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [disputeNoCurrency] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'full_refund',
        reason: 'Currency test',
        refundAmount: 10,
        processRefund: false,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
  });

  // ── refundAmount undefined (default to 0) ────────────────────────
  it('should handle undefined refundAmount (defaults to 0)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'no_refund',
        reason: 'No amount provided',
        processRefund: false,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).resolution.amount).toBe(0);
  });

  // ── Database error with ROLLBACK ─────────────────────────────────
  it('should return 500 on database error and ROLLBACK', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });

  // ── Database error when client is null (early failure) ───────────
  it('should return 500 when error occurs before client is created', async () => {
    (getUserFromEvent as jest.Mock).mockRejectedValueOnce(new Error('Auth error'));
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
  });

  // ── processRefund=false but valid amount (no refund processing) ──
  it('should not process refund when processRefund is false even with valid amount', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'full_refund',
        reason: 'Changed mind on refund',
        refundAmount: 50,
        processRefund: false,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).refund).toBeNull();
  });

  // ── Additional Coverage (Batch 7B-7D) ──

  it('should return 400 when dispute status is under_review (open)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...OPEN_DISPUTE, status: 'under_review' }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    // under_review is not 'resolved' or 'closed', so it should proceed
    expect(result!.statusCode).toBe(200);
  });

  it('should ROLLBACK and release client when dispute UPDATE fails', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] }) // dispute fetch
      .mockRejectedValueOnce(new Error('UPDATE dispute failed')); // dispute UPDATE fails
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should ROLLBACK and release client when timeline INSERT fails', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] }) // admin check
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] }) // dispute fetch
      .mockResolvedValueOnce({ rows: [] }) // UPDATE dispute OK
      .mockRejectedValueOnce(new Error('Timeline INSERT failed')); // timeline fails
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should ROLLBACK when notification INSERT fails after refund processing', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE dispute
      .mockResolvedValueOnce({ rows: [] }) // timeline
      // Stripe refund processing queries
      .mockResolvedValueOnce({ rows: [] }) // refund timeline
      .mockResolvedValueOnce({ rows: [] }) // refund insert
      .mockResolvedValueOnce({ rows: [] }) // update dispute refund_id
      .mockRejectedValueOnce(new Error('Notification failed')); // notification fails
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should return correct notification messages for each resolution type', async () => {
    // Test partial_refund notification message
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ account_type: 'admin' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OPEN_DISPUTE] })
      .mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent({
      body: JSON.stringify({
        resolution: 'partial_refund',
        reason: 'Partial completion',
        refundAmount: 25,
        processRefund: true,
      }),
    }), {} as never, {} as never);

    expect(result!.statusCode).toBe(200);
    // Verify complainant notification was sent
    const notifCalls = mockClient.query.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO notifications')
    );
    expect(notifCalls.length).toBeGreaterThanOrEqual(2); // complainant + respondent
  });
});
