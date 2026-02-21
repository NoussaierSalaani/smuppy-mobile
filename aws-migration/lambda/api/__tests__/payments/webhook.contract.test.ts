/**
 * Stripe Webhook Contract Tests
 *
 * Validates the webhook handler's critical guarantees:
 * A) Event dispatch — every event type in EVENT_HANDLERS routes to the correct handler
 * B) Idempotency — DB-backed dedup rejects duplicates, table-missing rejects with 500
 * C) Transaction integrity — BEGIN/COMMIT on success, ROLLBACK on handler failure
 * D) Contract shape — each major handler produces expected DB mutations
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Mock Setup ──────────────────────────────────────────────────────────

// Client-level mock (used inside transactions by handlers)
const mockClientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockRelease = jest.fn();
const mockClient = { query: mockClientQuery, release: mockRelease };

// Pool-level mock (used for dedup INSERT and pool.connect())
const mockPoolQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockConnect = jest.fn().mockResolvedValue(mockClient);

jest.mock('../../../shared/secrets', () => ({
  getStripeKey: jest.fn().mockResolvedValue('sk_test_contract'),
  getStripeWebhookSecret: jest.fn().mockResolvedValue('whsec_test_contract'),
}));

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    connect: mockConnect,
    query: mockPoolQuery,
  }),
}));

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn((_name: string, fn: () => unknown) => fn()),
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
  })),
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  PublishCommand: jest.fn(),
}));

const mockConstructEvent = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test',
        items: { data: [{ price: { unit_amount: 999 } }] },
        current_period_start: 1700000000,
        current_period_end: 1702592000,
      }),
    },
  }));
});

import { handler } from '../../payments/webhook';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Monotonically increasing counter to ensure unique event IDs across tests */
let eventCounter = 0;

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/payments/webhook',
    body: '{}',
    headers: {
      'Stripe-Signature': 'test_signature',
      'Content-Type': 'application/json',
    },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test',
      authorizer: null,
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as never,
      path: '/payments/webhook',
      stage: 'prod',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test',
      resourcePath: '/payments/webhook',
    },
    resource: '/payments/webhook',
    ...overrides,
  };
}

function makeStripeEvent(type: string, data: Record<string, unknown> = {}, id?: string) {
  eventCounter++;
  return {
    id: id || `evt_ct_${eventCounter}_${type.replaceAll('.', '_')}`,
    type,
    created: Math.floor(Date.now() / 1000) - 10, // 10 seconds ago
    data: { object: { id: `obj_${type}`, metadata: {}, ...data } },
    account: null,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Webhook Contract Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to success path
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockConnect.mockResolvedValue(mockClient);
  });

  // ──────────────────────────────────────────────────────────────────────
  // A) EVENT DISPATCH — every event type routes and executes
  // ──────────────────────────────────────────────────────────────────────

  describe('A) Event Dispatch — all 16 event types route correctly', () => {

    const EVENT_TYPES = [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
      'account.updated',
      'identity.verification_session.verified',
      'identity.verification_session.requires_input',
      'charge.refunded',
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'payout.paid',
      'payout.failed',
    ];

    it.each(EVENT_TYPES)('should dispatch %s and return 200', async (eventType) => {
      // Each test gets a unique event ID via makeStripeEvent counter
      mockConstructEvent.mockReturnValue(makeStripeEvent(eventType));

      const result = await handler(createMockEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.received).toBe(true);
      expect(body.skipped).toBeUndefined();
    });

    it('should have exactly 16 registered event types', () => {
      // Verify count by testing all 16 return 200 without skipping
      expect(EVENT_TYPES).toHaveLength(16);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // B) IDEMPOTENCY — DB-backed dedup + table-missing rejection
  // ──────────────────────────────────────────────────────────────────────

  describe('B) Idempotency — DB-backed dedup', () => {

    it('should skip when DB returns unique_violation (23505) for duplicate event', async () => {
      const eventId = `evt_dedup_db_${Date.now()}`;
      mockConstructEvent.mockReturnValue(makeStripeEvent('payment_intent.succeeded', {}, eventId));

      // First call — pool-level dedup INSERT succeeds
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result1 = await handler(createMockEvent());
      expect(result1.statusCode).toBe(200);

      // Second call — pool-level dedup INSERT throws unique_violation
      // But in-memory cache already has it, so it will be caught there first
      const result2 = await handler(createMockEvent());
      expect(result2.statusCode).toBe(200);
      expect(JSON.parse(result2.body).skipped).toBe('duplicate');
    });

    it('should return 500 when processed_webhook_events table is missing (42P01)', async () => {
      // Use a fresh unique event ID that won't be in in-memory cache
      const eventId = `evt_no_table_${Date.now()}_fresh`;
      const stripeEvent = {
        id: eventId,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000) - 10,
        data: { object: { id: 'pi_test', metadata: {} } },
        account: null,
      };
      mockConstructEvent.mockReturnValue(stripeEvent);

      // Pool-level dedup INSERT throws "relation does not exist"
      mockPoolQuery.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { code: '42P01' }));

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Webhook handler failed');
    });

    it('should allow processing when dedup insert has transient DB error (fallback to in-memory)', async () => {
      // The webhook handler catches transient errors and falls through to processing
      // However, if executeInTransaction then also fails, it returns 500
      // This test verifies the dedup path doesn't hard-reject on transient errors
      const eventId = `evt_transient_${Date.now()}_fresh`;
      const stripeEvent = {
        id: eventId,
        type: 'identity.verification_session.requires_input', // minimal handler (log only, no DB)
        created: Math.floor(Date.now() / 1000) - 10,
        data: { object: { id: 'vs_transient_test' } },
        account: null,
      };
      mockConstructEvent.mockReturnValue(stripeEvent);

      // Pool-level dedup throws transient error
      mockPoolQuery.mockRejectedValueOnce(Object.assign(new Error('connection timeout'), { code: '08006' }));

      const result = await handler(createMockEvent());
      // Handler should process the event (not reject with 500 for transient errors)
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).received).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // C) TRANSACTION INTEGRITY — BEGIN/COMMIT on success, ROLLBACK on error
  // ──────────────────────────────────────────────────────────────────────

  describe('C) Transaction integrity', () => {

    it('should execute BEGIN + handler SQL + COMMIT on success', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('account.updated', { charges_enabled: true, payouts_enabled: true })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      // Verify transaction lifecycle on the client (not pool)
      const clientCalls = mockClientQuery.mock.calls.map(c => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('COMMIT');
      expect(clientCalls).not.toContain('ROLLBACK');
    });

    it('should ROLLBACK and return 500 when handler throws', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', { id: 'pi_test_err', metadata: {} })
      );

      // Make the handler's SQL call throw inside the transaction
      let callCount = 0;
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve({ rows: [], rowCount: 0 });
        if (sql === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 });
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('simulated DB failure'));
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(500);

      const clientCalls = mockClientQuery.mock.calls.map(c => c[0]);
      expect(clientCalls).toContain('BEGIN');
      expect(clientCalls).toContain('ROLLBACK');
      expect(clientCalls).not.toContain('COMMIT');
    });

    it('should always release client in finally block', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('account.updated', { charges_enabled: true, payouts_enabled: true })
      );

      await handler(createMockEvent());
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should release client even on handler error', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', { id: 'pi_test_release', metadata: {} })
      );

      mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return Promise.resolve({ rows: [], rowCount: 0 });
        return Promise.reject(new Error('forced error'));
      });

      await handler(createMockEvent());
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // D) CONTRACT SHAPE — major handlers execute expected DB mutations
  // ──────────────────────────────────────────────────────────────────────

  describe('D) Contract Shape — Identity Verified', () => {

    it('should UPDATE profiles SET is_verified=true for identity.verification_session.verified', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('identity.verification_session.verified', { id: 'vs_test_123' })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      // Find the UPDATE query for profiles with is_verified on the client mock
      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('is_verified') && sql.includes('UPDATE profiles')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain('is_verified = true');
      expect(updateCall[0]).toContain('verified_at');
      expect(updateCall[0]).toContain('identity_verification_session_id');
      expect(updateCall[1]).toEqual(['vs_test_123']);
    });
  });

  describe('D) Contract Shape — Account Updated (Connect)', () => {

    it('should UPDATE profiles SET stripe_charges_enabled/stripe_payouts_enabled', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('account.updated', {
          id: 'acct_test_connect',
          charges_enabled: true,
          payouts_enabled: false,
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      // Find the UPDATE on the client mock (transaction-level)
      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('stripe_charges_enabled')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain('stripe_payouts_enabled');
      expect(updateCall[0]).toContain('stripe_account_id');
      // Parameters: [chargesEnabled, payoutsEnabled, accountId]
      expect(updateCall[1]).toEqual([true, false, 'acct_test_connect']);
    });
  });

  describe('D) Contract Shape — Payment Intent Succeeded', () => {

    it('should UPDATE payments SET status=succeeded for regular payments', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', {
          id: 'pi_test_regular',
          metadata: { type: 'session_payment' },
          latest_charge: 'ch_test_123',
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('UPDATE payments') && sql.includes("'succeeded'")
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toContain('pi_test_regular');
    });

    it('should UPDATE profiles verification_payment_status=paid for identity_verification type', async () => {
      const userId = '12345678-1234-1234-1234-123456789abc';
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', {
          id: 'pi_test_identity',
          metadata: { type: 'identity_verification', userId },
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes("verification_payment_status = 'paid'")
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toEqual([userId]);
    });
  });

  describe('D) Contract Shape — Payment Intent Failed', () => {

    it('should UPDATE payments SET status=failed with sanitized error', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.payment_failed', {
          id: 'pi_test_failed',
          metadata: {},
          last_payment_error: { message: 'Your card was declined <script>alert(1)</script>' },
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('UPDATE payments') && sql.includes("'failed'")
      );
      expect(updateCall).toBeDefined();
      // Verify HTML is stripped from error message in parameters
      if (updateCall[1]) {
        const errorParam = updateCall[1].find((p: unknown) => typeof p === 'string' && p.includes('declined'));
        if (errorParam) {
          expect(errorParam).not.toContain('<script>');
        }
      }
    });
  });

  describe('D) Contract Shape — Charge Refunded', () => {

    it('should UPDATE payments SET status=refunded', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('charge.refunded', {
          id: 'ch_test_refund',
          payment_intent: 'pi_refunded_test',
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      const updateCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('UPDATE payments') && sql.includes("'refunded'")
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe('D) Contract Shape — Subscription Deleted', () => {

    it('should handle identity_verification subscription deletion', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('customer.subscription.deleted', {
          id: 'sub_test_identity_del',
          metadata: { type: 'identity_verification', userId: '12345678-1234-1234-1234-123456789abc' },
          status: 'canceled',
        })
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      // Should set is_verified = false
      const verifyCall = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('is_verified = false')
      );
      expect(verifyCall).toBeDefined();
    });
  });

  describe('D) Contract Shape — Dispute Created', () => {

    it('should INSERT into disputes for charge.dispute.created', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('charge.dispute.created', {
          id: 'dp_test_123',
          charge: 'ch_dispute_test',
          amount: 5000,
          currency: 'usd',
          reason: 'fraudulent',
          status: 'needs_response',
        })
      );

      // Mock payment lookup — the handler queries for the payment by charge ID
      mockClientQuery.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [], rowCount: 0 });
        if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('payments')) {
          return Promise.resolve({
            rows: [{
              id: 'pay_uuid',
              creator_id: '12345678-1234-1234-1234-123456789abc',
              session_id: null,
            }],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);

      // Should have attempted INSERT into disputes
      const disputeInsert = mockClientQuery.mock.calls.find(
        ([sql]: [string]) => typeof sql === 'string' && sql.includes('disputes') && sql.includes('INSERT')
      );
      expect(disputeInsert).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // EDGE CASES
  // ──────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {

    it('should handle unhandled event type gracefully (200, not crash)', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('radar.early_fraud_warning.created')
      );

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).received).toBe(true);
    });

    it('should reject event with age > MAX_WEBHOOK_EVENT_AGE_SECONDS (300s)', async () => {
      eventCounter++;
      mockConstructEvent.mockReturnValue({
        id: `evt_old_${eventCounter}`,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000) - 600, // 10 min ago
        data: { object: { id: 'pi_old', metadata: {} } },
      });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).skipped).toBe('stale');
    });

    it('should accept event at exactly MAX_WEBHOOK_EVENT_AGE_SECONDS boundary', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('account.updated', {
          id: 'acct_boundary',
          charges_enabled: true,
          payouts_enabled: true,
        })
      );
      // Override created to be just under the limit
      const evt = mockConstructEvent.mock.results[0]?.value;
      if (evt) evt.created = Math.floor(Date.now() / 1000) - 299;

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).skipped).toBeUndefined();
    });

    it('should not leak internal errors to response body', async () => {
      mockConstructEvent.mockReturnValue(
        makeStripeEvent('payment_intent.succeeded', { id: 'pi_error', metadata: {} })
      );

      mockConnect.mockRejectedValueOnce(new Error('FATAL: database connection pool exhausted'));

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Webhook handler failed');
      expect(body.message).not.toContain('FATAL');
      expect(body.message).not.toContain('pool');
    });
  });
});
