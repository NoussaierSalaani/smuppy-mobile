/**
 * Stripe Webhook Handler Unit Tests
 *
 * Tests critical payment processing logic:
 * - Signature verification
 * - Event age rejection (stale events)
 * - Idempotency (duplicate event detection)
 * - Event routing to correct handlers
 * - All event type handlers (payment_intent, checkout, subscription, invoice, etc.)
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

// ── Client-level mock (used inside transactions) ────────────────────
const mockClientQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockClientRelease = jest.fn();
const mockTransactionClient = { query: mockClientQuery, release: mockClientRelease };

// ── Pool-level mock (used for dedup INSERT + pool.connect()) ────────
const mockPoolQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const mockPoolConnect = jest.fn().mockResolvedValue(mockTransactionClient);

// Mock shared modules before imports
jest.mock('../../../shared/secrets', () => ({
  getStripeKey: jest.fn().mockResolvedValue('sk_test_fake'),
  getStripeWebhookSecret: jest.fn().mockResolvedValue('whsec_test_fake'),
}));

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({
    connect: mockPoolConnect,
    query: mockPoolQuery,
  }),
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

jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../utils/revenue-share', () => ({
  calculatePlatformFeePercent: jest.fn().mockReturnValue(20),
}));

const mockSNSSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSNSSend })),
  PublishCommand: jest.fn().mockImplementation((p: unknown) => p),
}));

// Mock Stripe — constructor returns an instance with needed methods
const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }));
});

import { handler } from '../../payments/webhook';

// ── Test Constants ──────────────────────────────────────────────────
const UUID_1 = '11111111-1111-1111-1111-111111111111';
const UUID_2 = '22222222-2222-2222-2222-222222222222';
const UUID_3 = '33333333-3333-3333-3333-333333333333';

// Helper to create a mock API Gateway event
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

/** Build a Stripe event object with a unique ID and recent timestamp */
function stripeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: `evt_${type.replace(/\./g, '_')}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type,
    created: Math.floor(Date.now() / 1000) - 10,
    data: { object: dataObject },
    ...extra,
  };
}

describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPoolConnect.mockResolvedValue(mockTransactionClient);
  });

  // ================================================================
  // SIGNATURE VERIFICATION
  // ================================================================

  describe('Signature Verification', () => {
    it('should return 400 when Stripe-Signature header is missing', async () => {
      const event = createMockEvent({
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing signature');
    });

    it('should return 400 when signature verification fails', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid signature');
    });

    it('should accept valid stripe-signature header (lowercase)', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_test_valid',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'pi_test', metadata: {} } },
      });

      const event = createMockEvent({
        headers: {
          'stripe-signature': 'valid_sig',
          'Content-Type': 'application/json',
        },
      });

      const result = await handler(event);
      // Should not be 400 (signature accepted)
      expect(result.statusCode).not.toBe(400);
    });
  });

  // ================================================================
  // EVENT AGE VALIDATION
  // ================================================================

  describe('Event Age Validation', () => {
    it('should reject events older than 5 minutes', async () => {
      const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      mockConstructEvent.mockReturnValue({
        id: 'evt_stale',
        type: 'payment_intent.succeeded',
        created: staleTimestamp,
        data: { object: {} },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.skipped).toBe('stale');
    });

    it('should accept recent events (within 5 minutes)', async () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      mockConstructEvent.mockReturnValue({
        id: 'evt_recent_' + Date.now(),
        type: 'payment_intent.succeeded',
        created: recentTimestamp,
        data: { object: { id: 'pi_test', metadata: {} } },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).not.toBe(400);
    });
  });

  // ================================================================
  // IDEMPOTENCY / DEDUPLICATION
  // ================================================================

  describe('Idempotency', () => {
    it('should skip duplicate events (in-memory dedup)', async () => {
      const eventId = 'evt_dedup_test_' + Date.now();
      const evt = {
        id: eventId,
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'pi_test', metadata: {} } },
      };
      mockConstructEvent.mockReturnValue(evt);

      const event = createMockEvent();

      // First call
      await handler(event);

      // Second call with same event ID — should be deduped
      const result2 = await handler(event);
      expect(result2.statusCode).toBe(200);
      const body = JSON.parse(result2.body);
      expect(body.skipped).toBe('duplicate');
    });

    it('should skip duplicate events (DB-level 23505)', async () => {
      const evt = stripeEvent('charge.refunded', { id: 'ch_dbdupe' });
      mockConstructEvent.mockReturnValue(evt);
      mockPoolQuery.mockRejectedValueOnce({ code: '23505' });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).skipped).toBe('duplicate');
    });

    it('should return 500 when processed_webhook_events table is missing (42P01)', async () => {
      const evt = stripeEvent('charge.refunded', { id: 'ch_notable' });
      mockConstructEvent.mockReturnValue(evt);
      mockPoolQuery.mockRejectedValueOnce({ code: '42P01' });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(500);
    });

    it('should fall back to in-memory dedup on transient DB error', async () => {
      const evt = stripeEvent('account.updated', {
        id: 'acct_transient', charges_enabled: true, payouts_enabled: true,
      });
      mockConstructEvent.mockReturnValue(evt);
      mockPoolQuery.mockRejectedValueOnce(new Error('connection reset'));

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).received).toBe(true);
    });
  });

  // ================================================================
  // EVENT ROUTING
  // ================================================================

  describe('Event Routing', () => {
    it('should return 200 for unhandled event types', async () => {
      mockConstructEvent.mockReturnValue({
        id: 'evt_unhandled_' + Date.now(),
        type: 'some.unknown.event',
        created: Math.floor(Date.now() / 1000),
        data: { object: {} },
      });

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should handle OPTIONS requests for CORS', async () => {
      const event = createMockEvent({ httpMethod: 'OPTIONS' });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  // ================================================================
  // REQUEST VALIDATION
  // ================================================================

  describe('Request Validation', () => {
    it('should handle empty body gracefully', async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error('No webhook payload was provided');
      });

      const event = createMockEvent({ body: null });
      const result = await handler(event);

      // Signature verification fails on empty body
      expect(result.statusCode).toBe(400);
    });
  });

  // ================================================================
  // payment_intent.succeeded
  // ================================================================

  describe('payment_intent.succeeded', () => {
    it('updates payment + private_session for session type', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_session_1',
        latest_charge: 'ch_session_1',
        amount: 5000,
        metadata: {
          type: 'session',
          session_id: UUID_1,
          creator_id: UUID_2,
          buyer_id: UUID_3,
          creator_amount: '4000',
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      // buyer profile lookup inside transaction
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [] }) // UPDATE private_sessions
        .mockResolvedValueOnce({ rows: [{ full_name: 'John Doe', username: 'john' }] }) // buyer
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        expect.arrayContaining(['pi_session_1']),
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE private_sessions'),
        [UUID_1],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([UUID_2, 'session_booked']),
      );
    });

    it('creates pack_purchased notification for pack type', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_pack_1',
        latest_charge: 'ch_pack_1',
        amount: 3000,
        metadata: {
          type: 'pack',
          pack_id: UUID_1,
          creator_id: UUID_2,
          buyer_id: UUID_3,
          creator_amount: '2400',
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [{ full_name: 'Jane', username: 'jane' }] }) // buyer
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining(['pack_purchased']),
      );
    });

    it('records identity_verification payment', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_idv_1',
        metadata: { type: 'identity_verification', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('verification_payment_status'),
        [UUID_1],
      );
    });

    it('skips identity_verification when userId is invalid', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_idv_bad',
        metadata: { type: 'identity_verification', userId: 'bad' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('verification_payment_status'),
        expect.anything(),
      );
    });

    it('skips notification when creator_id or buyer_id are not valid UUIDs', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_bad_ids',
        latest_charge: 'ch_bad',
        amount: 1000,
        metadata: { type: 'session', creator_id: 'bad', buyer_id: 'also-bad' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.anything(),
      );
    });

    it('skips private_sessions update when session_id is missing', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_no_session',
        latest_charge: 'ch_no_sess',
        amount: 1000,
        metadata: { type: 'session' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE private_sessions'),
        expect.anything(),
      );
    });
  });

  // ================================================================
  // payment_intent.payment_failed
  // ================================================================

  describe('payment_intent.payment_failed', () => {
    it('updates payment to failed with sanitized error', async () => {
      const evt = stripeEvent('payment_intent.payment_failed', {
        id: 'pi_fail_1',
        last_payment_error: { message: 'Card <script>alert(1)</script> declined' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'failed'"),
        expect.arrayContaining(['pi_fail_1']),
      );
    });

    it('uses "Payment failed" when last_payment_error is null', async () => {
      const evt = stripeEvent('payment_intent.payment_failed', {
        id: 'pi_fail_null',
        last_payment_error: null,
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'failed'"),
        ['pi_fail_null', 'Payment failed'],
      );
    });
  });

  // ================================================================
  // checkout.session.completed
  // ================================================================

  describe('checkout.session.completed', () => {
    describe('business_drop_in', () => {
      it('creates booking and notifies business', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_dropin',
          amount_total: 2000,
          metadata: {
            productType: 'business_drop_in',
            userId: UUID_1,
            businessId: UUID_2,
            serviceId: UUID_3,
            date: '2026-03-01',
            slotId: '10:00',
          },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT business_bookings
          .mockResolvedValueOnce({ rows: [{ full_name: 'Booker', username: 'bk' }] })
          .mockResolvedValueOnce({ rows: [] }) // notification
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO business_bookings'),
          expect.arrayContaining([UUID_1, UUID_2, UUID_3]),
        );
      });

      it('returns early with invalid UUIDs', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_dropin_bad',
          amount_total: 2000,
          metadata: { productType: 'business_drop_in', userId: 'bad', businessId: UUID_2, serviceId: UUID_3 },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO business_bookings'),
          expect.anything(),
        );
      });
    });

    describe('business_pass', () => {
      it('creates pass with entries from service', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_pass',
          amount_total: 5000,
          metadata: { productType: 'business_pass', userId: UUID_1, businessId: UUID_2, serviceId: UUID_3 },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{ entries_total: 20 }] }) // service
          .mockResolvedValueOnce({ rows: [] }) // INSERT business_passes
          .mockResolvedValueOnce({ rows: [{ full_name: 'Buyer', username: 'b' }] })
          .mockResolvedValueOnce({ rows: [] }) // notification
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO business_passes'),
          expect.arrayContaining([UUID_1, UUID_2, UUID_3]),
        );
      });

      it('defaults to 10 entries when service has none', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_pass_default',
          amount_total: 5000,
          metadata: { productType: 'business_pass', userId: UUID_1, businessId: UUID_2, serviceId: UUID_3 },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [{}] }) // service (no entries_total)
          .mockResolvedValueOnce({ rows: [] }) // INSERT
          .mockResolvedValueOnce({ rows: [{ full_name: 'B', username: 'b' }] })
          .mockResolvedValueOnce({ rows: [] }) // notif
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO business_passes'),
          expect.arrayContaining([10]),
        );
      });
    });

    describe('business_subscription', () => {
      it('creates subscription with stripe retrieval', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({
          id: 'sub_biz',
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        });
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_biz_sub',
          amount_total: 10000,
          subscription: 'sub_biz',
          metadata: {
            productType: 'business_subscription',
            userId: UUID_1, businessId: UUID_2, serviceId: UUID_3, period: 'monthly',
          },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT
          .mockResolvedValueOnce({ rows: [{ full_name: 'M', username: 'm' }] })
          .mockResolvedValueOnce({ rows: [] }) // notif
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO business_subscriptions'),
          expect.arrayContaining([UUID_1, UUID_2, UUID_3, 'sub_biz']),
        );
      });

      it('handles null subscription gracefully', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_biz_nosub',
          amount_total: 10000,
          subscription: null,
          metadata: {
            productType: 'business_subscription',
            userId: UUID_1, businessId: UUID_2, serviceId: UUID_3, period: 'yearly',
          },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [{ full_name: 'B', username: 'b' }] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
      });
    });

    describe('platform_subscription', () => {
      it('activates subscription and upgrades to pro_creator', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_plat',
          payment_status: 'paid',
          subscription: 'sub_plat',
          metadata: { subscriptionType: 'platform', userId: UUID_1, planType: 'pro_creator' },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO platform_subscriptions'),
          expect.arrayContaining([UUID_1, 'sub_plat', 'pro_creator']),
        );
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE profiles SET account_type'),
          ['pro_creator', UUID_1],
        );
      });

      it('upgrades to pro_business for non pro_creator plan', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_plat_biz',
          payment_status: 'paid',
          subscription: 'sub_plat_biz',
          metadata: { subscriptionType: 'platform', userId: UUID_1, planType: 'pro_business' },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE profiles SET account_type'),
          ['pro_business', UUID_1],
        );
      });

      it('skips when payment_status is not paid', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_plat_unpaid',
          payment_status: 'unpaid',
          subscription: 'sub_unpaid',
          metadata: { subscriptionType: 'platform', userId: UUID_1, planType: 'pro_creator' },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO platform_subscriptions'),
          expect.anything(),
        );
      });

      it('skips when userId is invalid', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_plat_baduid',
          payment_status: 'paid',
          subscription: 'sub_x',
          metadata: { subscriptionType: 'platform', userId: 'bad', planType: 'pro_creator' },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO platform_subscriptions'),
          expect.anything(),
        );
      });
    });

    describe('channel_subscription', () => {
      it('creates channel subscription and notifies creator', async () => {
        mockSubscriptionsRetrieve.mockResolvedValue({
          id: 'sub_ch',
          items: { data: [{ price: { unit_amount: 999 } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        });
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_channel',
          subscription: 'sub_ch',
          metadata: { subscriptionType: 'channel', fanId: UUID_1, creatorId: UUID_2 },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT channel_subscriptions
          .mockResolvedValueOnce({ rows: [{ full_name: 'Fan', username: 'fan' }] })
          .mockResolvedValueOnce({ rows: [] }) // notification
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO channel_subscriptions'),
          expect.arrayContaining([UUID_1, UUID_2, 'sub_ch']),
        );
        expect(mockClientQuery).toHaveBeenCalledWith(
          expect.stringContaining('new_subscriber'),
          expect.arrayContaining([UUID_2]),
        );
      });

      it('skips with invalid fanId', async () => {
        const evt = stripeEvent('checkout.session.completed', {
          id: 'cs_ch_bad',
          subscription: 'sub_ch2',
          metadata: { subscriptionType: 'channel', fanId: 'bad', creatorId: UUID_2 },
        });
        mockConstructEvent.mockReturnValue(evt);
        mockClientQuery.mockResolvedValue({ rows: [] });

        const result = await handler(createMockEvent());
        expect(result.statusCode).toBe(200);
        expect(mockClientQuery).not.toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO channel_subscriptions'),
          expect.anything(),
        );
      });
    });

    it('does nothing for unknown productType + subscriptionType', async () => {
      const evt = stripeEvent('checkout.session.completed', {
        id: 'cs_unknown',
        metadata: { productType: 'alien' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
    });
  });

  // ================================================================
  // customer.subscription.updated
  // ================================================================

  describe('customer.subscription.updated', () => {
    it('updates platform subscription period', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_plat_upd',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { subscriptionType: 'platform' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE platform_subscriptions SET'),
        expect.arrayContaining(['active']),
      );
    });

    it('updates channel subscription period', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_ch_upd',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { subscriptionType: 'channel' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE channel_subscriptions SET'),
        expect.arrayContaining(['active']),
      );
    });

    it('updates business subscription period (no period_start column)', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_biz_upd',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { subscriptionType: 'business' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE business_subscriptions SET'),
        expect.arrayContaining(['active']),
      );
    });

    it('sets canceling status when cancel_at_period_end is true', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_canceling',
        status: 'active',
        cancel_at_period_end: true,
        cancel_at: Math.floor(Date.now() / 1000) + 86400,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { subscriptionType: 'platform' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE platform_subscriptions SET'),
        expect.arrayContaining(['canceling']),
      );
    });

    it('removes badge for identity_verification with past_due status', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_idv_pastdue',
        status: 'past_due',
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { subscriptionType: 'identity_verification', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = false'),
        [UUID_1],
      );
    });

    it('restores badge for identity_verification with active status', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_idv_active',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { subscriptionType: 'identity_verification', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = true'),
        [UUID_1],
      );
    });

    it('removes badge for identity_verification with canceled status (via type metadata)', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_idv_canceled',
        status: 'canceled',
        cancel_at_period_end: false,
        cancel_at: null,
        metadata: { type: 'identity_verification', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = false'),
        [UUID_1],
      );
    });

    it('skips identity verification when userId is invalid', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_idv_bad',
        status: 'past_due',
        metadata: { subscriptionType: 'identity_verification', userId: 'bad' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('is_verified'),
        expect.anything(),
      );
    });

    it('does nothing for unknown subscription type', async () => {
      const evt = stripeEvent('customer.subscription.updated', {
        id: 'sub_unknown',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        metadata: { subscriptionType: 'alien' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
    });
  });

  // ================================================================
  // customer.subscription.deleted
  // ================================================================

  describe('customer.subscription.deleted', () => {
    it('removes badge + notifies for identity_verification', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_idv_del',
        metadata: { subscriptionType: 'identity_verification', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = false'),
        [UUID_1],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('verification_expired'),
        expect.arrayContaining([UUID_1]),
      );
    });

    it('cancels + downgrades for platform subscription', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_plat_del',
        metadata: { subscriptionType: 'platform', userId: UUID_1 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE platform_subscriptions'),
        ['sub_plat_del'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("account_type = 'personal'"),
        [UUID_1],
      );
    });

    it('skips downgrade when userId is invalid for platform', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_plat_del2',
        metadata: { subscriptionType: 'platform', userId: 'bad' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("account_type = 'personal'"),
        expect.anything(),
      );
    });

    it('cancels + notifies creator for channel subscription', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_ch_del',
        metadata: { subscriptionType: 'channel', creatorId: UUID_2 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE channel_subscriptions'),
        ['sub_ch_del'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('subscriber_canceled'),
        expect.arrayContaining([UUID_2]),
      );
    });

    it('cancels + notifies business for business subscription', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_biz_del',
        metadata: { subscriptionType: 'business', businessId: UUID_2 },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE business_subscriptions'),
        ['sub_biz_del'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('business_sub_canceled'),
        expect.arrayContaining([UUID_2]),
      );
    });

    it('does nothing for unknown subscription type on delete', async () => {
      const evt = stripeEvent('customer.subscription.deleted', {
        id: 'sub_alien_del',
        metadata: { subscriptionType: 'alien' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
    });
  });

  // ================================================================
  // invoice.paid
  // ================================================================

  describe('invoice.paid', () => {
    it('records channel subscription payment with revenue tracking', async () => {
      const evt = stripeEvent('invoice.paid', {
        id: 'in_paid_ch',
        amount_paid: 999,
        subscription_details: {
          metadata: { subscriptionType: 'channel', creatorId: UUID_2, fanId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ fan_count: 50 }] }) // fan_count
        .mockResolvedValueOnce({ rows: [] }) // INSERT channel_subscription_payments
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO channel_subscription_payments'),
        expect.arrayContaining(['in_paid_ch', UUID_2, UUID_1]),
      );
    });

    it('defaults fan_count to 0 when profile not found', async () => {
      const evt = stripeEvent('invoice.paid', {
        id: 'in_paid_nofan',
        amount_paid: 999,
        subscription_details: {
          metadata: { subscriptionType: 'channel', creatorId: UUID_2, fanId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // fan_count (no rows)
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
    });

    it('does nothing for non-channel invoices', async () => {
      const evt = stripeEvent('invoice.paid', {
        id: 'in_paid_plat',
        amount_paid: 1999,
        subscription_details: { metadata: { subscriptionType: 'platform' } },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO channel_subscription_payments'),
        expect.anything(),
      );
    });
  });

  // ================================================================
  // invoice.payment_failed
  // ================================================================

  describe('invoice.payment_failed', () => {
    it('sends identity_verification payment failed notification', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_idv',
        subscription_details: {
          metadata: { type: 'identity_verification', userId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([UUID_1, 'verification_payment_failed']),
      );
    });

    it('sends platform failed notification and marks past_due', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_plat',
        subscription_details: {
          metadata: { subscriptionType: 'platform', userId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([UUID_1, 'subscription_payment_failed', 'Pro Subscription Payment Failed']),
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE platform_subscriptions SET status = 'past_due'"),
        [UUID_1],
      );
    });

    it('sends channel subscription failed notification', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_ch',
        subscription_details: {
          metadata: { subscriptionType: 'channel', userId: UUID_1, creatorId: UUID_2 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([UUID_1, 'subscription_payment_failed', 'Channel Subscription Payment Failed']),
      );
    });

    it('sends business membership failed notification', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_biz',
        subscription_details: {
          metadata: { subscriptionType: 'business', userId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([UUID_1, 'subscription_payment_failed', 'Membership Payment Failed']),
      );
    });

    it('skips when userId is invalid', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_bad',
        subscription_details: {
          metadata: { subscriptionType: 'platform', userId: 'bad' },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.anything(),
      );
    });

    it('skips when subscription type is unknown', async () => {
      const evt = stripeEvent('invoice.payment_failed', {
        id: 'in_fail_alien',
        subscription_details: {
          metadata: { subscriptionType: 'alien', userId: UUID_1 },
        },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.anything(),
      );
    });
  });

  // ================================================================
  // account.updated
  // ================================================================

  describe('account.updated', () => {
    it('updates profile stripe_charges_enabled and stripe_payouts_enabled', async () => {
      const evt = stripeEvent('account.updated', {
        id: 'acct_test_upd',
        charges_enabled: true,
        payouts_enabled: false,
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_charges_enabled'),
        [true, false, 'acct_test_upd'],
      );
    });
  });

  // ================================================================
  // identity.verification_session events
  // ================================================================

  describe('identity verification events', () => {
    it('marks profile verified for identity.verification_session.verified', async () => {
      const evt = stripeEvent('identity.verification_session.verified', {
        id: 'vs_verified',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = true'),
        ['vs_verified'],
      );
    });

    it('logs only for identity.verification_session.requires_input (no DB write)', async () => {
      const evt = stripeEvent('identity.verification_session.requires_input', {
        id: 'vs_needs_input',
        last_error: { code: 'document_expired', message: 'Expired' },
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      // Should not write to profiles
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE profiles'),
        expect.anything(),
      );
    });
  });

  // ================================================================
  // charge.refunded
  // ================================================================

  describe('charge.refunded', () => {
    it('updates payment status to refunded', async () => {
      const evt = stripeEvent('charge.refunded', {
        id: 'ch_refund_test',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'refunded'"),
        ['ch_refund_test'],
      );
    });
  });

  // ================================================================
  // charge.dispute.created / updated / closed
  // ================================================================

  describe('charge.dispute.created', () => {
    it('records dispute, marks payment disputed, and notifies creator', async () => {
      const evt = stripeEvent('charge.dispute.created', {
        id: 'dp_created',
        charge: 'ch_disputed',
        amount: 5000,
        currency: 'eur',
        reason: 'fraudulent',
        status: 'needs_response',
        payment_intent: 'pi_disputed',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT disputes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [{ creator_id: UUID_2, buyer_id: UUID_1, amount_cents: 5000 }] })
        .mockResolvedValueOnce({ rows: [] }) // INSERT notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO disputes'),
        expect.arrayContaining(['dp_created', 'ch_disputed', 5000, 'fraudulent', 'needs_response']),
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'disputed'"),
        ['ch_disputed', 'needs_response'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('dispute_created'),
        expect.arrayContaining([UUID_2]),
      );
    });

    it('sends SNS alert when SECURITY_ALERTS_TOPIC_ARN is set', async () => {
      const originalArn = process.env.SECURITY_ALERTS_TOPIC_ARN;
      process.env.SECURITY_ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:alerts';

      const evt = stripeEvent('charge.dispute.created', {
        id: 'dp_sns',
        charge: 'ch_sns',
        amount: 10000,
        currency: 'usd',
        reason: 'product_not_received',
        status: 'needs_response',
        payment_intent: 'pi_sns',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ creator_id: UUID_2, buyer_id: UUID_1, amount_cents: 10000 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockSNSSend).toHaveBeenCalled();

      process.env.SECURITY_ALERTS_TOPIC_ARN = originalArn;
    });

    it('skips notification when no payment found for charge', async () => {
      const evt = stripeEvent('charge.dispute.created', {
        id: 'dp_no_pay',
        charge: 'ch_orphan',
        amount: 1000,
        currency: 'eur',
        reason: 'general',
        status: 'needs_response',
        payment_intent: 'pi_orphan',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT disputes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [] }) // payment lookup (none)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('dispute_created'),
        expect.anything(),
      );
    });

    it('handles charge as object instead of string', async () => {
      const evt = stripeEvent('charge.dispute.created', {
        id: 'dp_obj',
        charge: { id: 'ch_from_obj' },
        amount: 2000,
        currency: 'eur',
        reason: 'duplicate',
        status: 'needs_response',
        payment_intent: 'pi_obj',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO disputes'),
        expect.arrayContaining(['ch_from_obj']),
      );
    });
  });

  describe('charge.dispute.updated', () => {
    it('updates dispute and payment dispute_status', async () => {
      const evt = stripeEvent('charge.dispute.updated', {
        id: 'dp_upd',
        charge: 'ch_upd',
        status: 'under_review',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE disputes'),
        ['under_review', 'dp_upd'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        ['under_review', 'ch_upd'],
      );
    });
  });

  describe('charge.dispute.closed', () => {
    it('handles dispute won — restores payment to succeeded', async () => {
      const evt = stripeEvent('charge.dispute.closed', {
        id: 'dp_won',
        charge: 'ch_won',
        amount: 3000,
        currency: 'eur',
        status: 'won',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE disputes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [{ creator_id: UUID_2 }] }) // payment lookup
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        ['succeeded', 'won', 'ch_won'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('dispute_closed'),
        expect.arrayContaining([UUID_2, 'Dispute Won!']),
      );
    });

    it('handles dispute lost — marks payment as disputed_lost', async () => {
      const evt = stripeEvent('charge.dispute.closed', {
        id: 'dp_lost',
        charge: 'ch_lost',
        amount: 4000,
        currency: 'usd',
        status: 'lost',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE disputes
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payments
        .mockResolvedValueOnce({ rows: [{ creator_id: UUID_2 }] }) // payment lookup
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments'),
        ['disputed_lost', 'lost', 'ch_lost'],
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('dispute_closed'),
        expect.arrayContaining([UUID_2, 'Dispute Lost']),
      );
    });

    it('skips notification when no payment found', async () => {
      const evt = stripeEvent('charge.dispute.closed', {
        id: 'dp_cl_nopay',
        charge: 'ch_cl_nopay',
        amount: 1000,
        currency: 'eur',
        status: 'won',
      });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // payment lookup (none)
        .mockResolvedValueOnce({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
    });
  });

  // ================================================================
  // payout.paid / payout.failed
  // ================================================================

  describe('payout.paid', () => {
    it('notifies creator of payout', async () => {
      const evt = stripeEvent('payout.paid', {
        id: 'po_paid',
        amount: 15000,
        currency: 'eur',
      }, { account: 'acct_creator' });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: UUID_2 }] }) // creator lookup
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('payout_received'),
        expect.arrayContaining([UUID_2]),
      );
    });

    it('skips when no account ID', async () => {
      const evt = stripeEvent('payout.paid', {
        id: 'po_no_acct',
        amount: 5000,
        currency: 'eur',
      }, { account: null });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('payout_received'),
        expect.anything(),
      );
    });

    it('skips when no creator found for account', async () => {
      const evt = stripeEvent('payout.paid', {
        id: 'po_no_creator',
        amount: 5000,
        currency: 'eur',
      }, { account: 'acct_unknown' });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // creator lookup (none)
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('payout_received'),
        expect.anything(),
      );
    });
  });

  describe('payout.failed', () => {
    it('notifies creator of failed payout', async () => {
      const evt = stripeEvent('payout.failed', {
        id: 'po_fail',
        amount: 8000,
        currency: 'eur',
        failure_code: 'account_closed',
        failure_message: 'Bank account closed',
      }, { account: 'acct_fail' });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: UUID_2 }] }) // creator lookup
        .mockResolvedValueOnce({ rows: [] }) // notification
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('payout_failed'),
        expect.arrayContaining([UUID_2]),
      );
    });

    it('skips when no account ID', async () => {
      const evt = stripeEvent('payout.failed', {
        id: 'po_fail_noacct',
        amount: 3000,
        currency: 'eur',
        failure_code: 'could_not_process',
        failure_message: null,
      }, { account: null });
      mockConstructEvent.mockReturnValue(evt);
      mockClientQuery.mockResolvedValue({ rows: [] });

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(200);
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('payout_failed'),
        expect.anything(),
      );
    });
  });

  // ================================================================
  // ERROR HANDLING
  // ================================================================

  describe('error handling', () => {
    it('returns 500 when transaction throws', async () => {
      const evt = stripeEvent('payment_intent.succeeded', {
        id: 'pi_txerr',
        metadata: { type: 'session' },
      });
      mockConstructEvent.mockReturnValue(evt);
      const failClient = {
        query: jest.fn().mockRejectedValue(new Error('DB connection lost')),
        release: jest.fn(),
      };
      mockPoolConnect.mockResolvedValue(failClient);

      const result = await handler(createMockEvent());
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Webhook handler failed');
    });
  });
});
