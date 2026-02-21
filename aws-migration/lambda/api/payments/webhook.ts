/**
 * Stripe Webhook Lambda Handler
 * Handles all Stripe webhook events:
 * - PaymentIntent events (sessions, packs)
 * - Subscription events (platform subscriptions, channel subscriptions)
 * - Connect events (creator onboarding)
 * - Identity events (verification status)
 * - Checkout session events
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { Pool, PoolClient } from 'pg';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { getStripeWebhookSecret } from '../../shared/secrets';
import { getStripeClient } from '../../shared/stripe-client';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger, Logger } from '../utils/logger';
import { MAX_WEBHOOK_EVENT_AGE_SECONDS } from '../utils/constants';
import { isValidUUID } from '../utils/security';
import { safeStripeCall } from '../../shared/stripe-resilience';
import { calculatePlatformFeePercent } from '../utils/revenue-share';

const snsClient = new SNSClient({ region: process.env.AWS_REGION });

const log = createLogger('payments/webhook');

// Webhook secret loaded from Secrets Manager at runtime
let webhookSecret: string | null = null;

// Event deduplication: reject replayed events
const processedEvents = new Map<string, number>();

// Cleanup old entries at handler start (not setInterval — Lambda freezes between invocations)
function cleanupProcessedEvents(): void {
  if (processedEvents.size < 500) return;
  const cutoff = Date.now() - MAX_WEBHOOK_EVENT_AGE_SECONDS * 2 * 1000;
  for (const [id, ts] of processedEvents.entries()) {
    if (ts < cutoff) processedEvents.delete(id);
  }
}

// ========================================
// PAYMENT INTENT EVENTS
// ========================================

async function handlePaymentIntentSucceeded(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
  logger.info('Payment succeeded', { paymentIntentId: paymentIntent.id });

  const paymentType = paymentIntent.metadata?.type;

  // Handle identity verification payment
  if (paymentType === 'identity_verification') {
    const userId = paymentIntent.metadata?.userId;
    if (!isValidUUID(userId)) {
      logger.warn('Invalid userId in identity verification metadata', { userId: userId?.substring(0, 8) + '***' });
      return;
    }
    await client.query(
      `UPDATE profiles
       SET verification_payment_status = 'paid',
           verification_payment_date = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
    logger.info('Identity verification payment recorded', { userId: userId?.substring(0, 8) + '***' });
    return;
  }

  // Handle session/pack payments
  await client.query(
    `UPDATE payments
     SET status = 'succeeded',
         updated_at = NOW(),
         stripe_charge_id = $2
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id, paymentIntent.latest_charge]
  );

  // If there's a session, update its status
  const sessionId = paymentIntent.metadata?.session_id;
  if (sessionId && isValidUUID(sessionId)) {
    await client.query(
      `UPDATE private_sessions
       SET payment_status = 'paid',
           status = 'confirmed',
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );
  }

  // Create notification for creator
  const creatorId = paymentIntent.metadata?.creator_id;
  const buyerId = paymentIntent.metadata?.buyer_id;
  const packId = paymentIntent.metadata?.pack_id || null;
  if (creatorId && buyerId && isValidUUID(creatorId) && isValidUUID(buyerId)) {
    const buyerResult = await client.query(
      'SELECT full_name, username FROM profiles WHERE id = $1',
      [buyerId]
    );
    const buyerName = buyerResult.rows[0]?.full_name || 'Someone';

    const notifType = paymentType === 'pack' ? 'pack_purchased' : 'session_booked';
    const notifTitle = paymentType === 'pack' ? 'New Pack Purchased' : 'New Session Booked';
    const notifBody = paymentType === 'pack'
      ? `${buyerName} purchased a monthly pack`
      : `${buyerName} booked a session with you`;

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        creatorId,
        notifType,
        notifTitle,
        notifBody,
        JSON.stringify({
          sessionId,
          packId,
          buyerId,
          amount: paymentIntent.amount,
          creatorAmount: Number.parseInt(paymentIntent.metadata?.creator_amount || '0'),
        }),
      ]
    );
  }
}

async function handlePaymentIntentFailed(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
  logger.warn('Payment failed', {
    paymentIntentId: paymentIntent.id,
    error: paymentIntent.last_payment_error?.message,
  });

  // SECURITY: Sanitize error message before storing — strip sensitive details, limit length
  const sanitizedErrorMsg = (paymentIntent.last_payment_error?.message || 'Payment failed')
    .replaceAll(/<[^>]*>/g, '').substring(0, 200); // NOSONAR
  await client.query(
    `UPDATE payments
     SET status = 'failed',
         error_message = $2,
         updated_at = NOW()
     WHERE stripe_payment_intent_id = $1`,
    [paymentIntent.id, sanitizedErrorMsg]
  );
}

// ========================================
// CHECKOUT SESSION EVENTS
// ========================================

async function handleBusinessDropIn(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  logger: Logger,
): Promise<void> {
  const userId = session.metadata?.userId;
  const businessId = session.metadata?.businessId;
  const serviceId = session.metadata?.serviceId;
  const bookingDate = session.metadata?.date || null;
  const slotId = session.metadata?.slotId || null;

  if (!isValidUUID(userId) || !isValidUUID(businessId) || !isValidUUID(serviceId)) return;

  const amountTotal = session.amount_total || 0;
  const platformFee = Math.round(amountTotal * 0.15);
  const qrCode = `smuppy-bk-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`; // NOSONAR

  await client.query(
    `INSERT INTO business_bookings (
      user_id, business_id, service_id, stripe_checkout_session_id,
      amount_cents, platform_fee_cents, status, booking_date, slot_time, qr_code
    ) VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9)`,
    [userId, businessId, serviceId, session.id, amountTotal, platformFee, bookingDate, slotId, qrCode]
  );

  // Notify business
  const buyerResult = await client.query('SELECT full_name, username FROM profiles WHERE id = $1', [userId]);
  const buyerName = buyerResult.rows[0]?.full_name || 'Someone';
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'business_booking', 'New Booking!', $2, $3)`,
    [businessId, `${buyerName} booked a class`, JSON.stringify({ bookingDate, userId, serviceId })]
  );

  logger.info('Business drop_in booking created', { businessId: businessId!.substring(0, 8) + '***', userId: userId?.substring(0, 8) + '***' });
}

async function handleBusinessPass(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  logger: Logger,
): Promise<void> {
  const userId = session.metadata?.userId;
  const businessId = session.metadata?.businessId;
  const serviceId = session.metadata?.serviceId;

  if (!isValidUUID(userId) || !isValidUUID(businessId) || !isValidUUID(serviceId)) return;

  const amountTotal = session.amount_total || 0;
  const platformFee = Math.round(amountTotal * 0.15);

  // Get entries_total from the service
  const serviceResult = await client.query(
    'SELECT entries_total FROM business_services WHERE id = $1',
    [serviceId]
  );
  const entriesTotal = serviceResult.rows[0]?.entries_total || 10;

  await client.query(
    `INSERT INTO business_passes (
      user_id, business_id, service_id, stripe_checkout_session_id,
      amount_cents, platform_fee_cents, entries_total, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
    [userId, businessId, serviceId, session.id, amountTotal, platformFee, entriesTotal]
  );

  // Notify business
  const buyerResult = await client.query('SELECT full_name, username FROM profiles WHERE id = $1', [userId]);
  const buyerName = buyerResult.rows[0]?.full_name || 'Someone';
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'business_pass', 'New Pass Purchased!', $2, $3)`,
    [businessId, `${buyerName} purchased a pass`, JSON.stringify({ userId, serviceId })]
  );

  logger.info('Business pass created', { businessId: businessId!.substring(0, 8) + '***' });
}

async function handleBusinessSubscriptionCheckout(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  logger: Logger,
): Promise<void> {
  const userId = session.metadata?.userId;
  const businessId = session.metadata?.businessId;
  const serviceId = session.metadata?.serviceId;

  if (!isValidUUID(userId) || !isValidUUID(businessId) || !isValidUUID(serviceId)) return;

  const amountTotal = session.amount_total || 0;
  const platformFee = Math.round(amountTotal * 0.15);

  // Get subscription details
  const subscription = session.subscription
    ? await safeStripeCall(
        () => stripe.subscriptions.retrieve(session.subscription as string),
        'subscriptions.retrieve', logger
      )
    : null;

  const period = session.metadata?.period || 'monthly';

  await client.query(
    `INSERT INTO business_subscriptions (
      user_id, business_id, service_id, stripe_subscription_id,
      stripe_checkout_session_id, amount_cents, platform_fee_cents,
      period, status, current_period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    ON CONFLICT DO NOTHING`,
    [
      userId, businessId, serviceId,
      subscription?.id || null,
      session.id, amountTotal, platformFee, period,
      subscription ? new Date(((subscription as unknown as { current_period_end: number }).current_period_end) * 1000).toISOString() : null,
    ]
  );

  // Notify business
  const buyerResult = await client.query('SELECT full_name, username FROM profiles WHERE id = $1', [userId]);
  const buyerName = buyerResult.rows[0]?.full_name || 'Someone';
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'business_subscription', 'New Member!', $2, $3)`,
    [businessId, `${buyerName} subscribed to your service`, JSON.stringify({ userId, serviceId, period })]
  );

  logger.info('Business subscription created', { businessId: businessId!.substring(0, 8) + '***' });
}

async function handlePlatformSubscriptionCheckout(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  logger: Logger,
): Promise<void> {
  const userId = session.metadata?.userId;
  const planType = session.metadata?.planType;

  if (!isValidUUID(userId)) {
    logger.warn('Invalid userId in platform subscription metadata', { userId: userId?.substring(0, 8) + '***' });
    return;
  }

  // BUG-2026-02-14: Verify payment was actually collected before upgrading account
  if (session.payment_status !== 'paid') {
    logger.warn('Platform subscription checkout completed but payment not collected', {
      userId: userId?.substring(0, 8) + '***',
      paymentStatus: session.payment_status,
    });
    return;
  }

  await client.query(
    `INSERT INTO platform_subscriptions (
       user_id, stripe_subscription_id, plan_type, status, created_at
     ) VALUES ($1, $2, $3, 'active', NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET stripe_subscription_id = $2, plan_type = $3, status = 'active', updated_at = NOW()`,
    [userId, session.subscription, planType]
  );

  // Update account type
  const accountType = planType === 'pro_creator' ? 'pro_creator' : 'pro_business';
  await client.query(
    'UPDATE profiles SET account_type = $1, updated_at = NOW() WHERE id = $2',
    [accountType, userId]
  );

  logger.info('Platform subscription activated', { userId: userId?.substring(0, 8) + '***', planType });
}

async function handleChannelSubscriptionCheckout(
  client: PoolClient,
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  logger: Logger,
): Promise<void> {
  const fanId = session.metadata?.fanId;
  const creatorId = session.metadata?.creatorId;

  if (!isValidUUID(fanId) || !isValidUUID(creatorId)) {
    logger.warn('Invalid IDs in channel subscription metadata', { fanId: fanId?.substring(0, 8) + '***', creatorId: creatorId?.substring(0, 8) + '***' });
    return;
  }

  // Get current period from subscription
  const subscription = await safeStripeCall(
    () => stripe.subscriptions.retrieve(session.subscription as string),
    'subscriptions.retrieve', logger
  );

  await client.query(
    `INSERT INTO channel_subscriptions (
       fan_id, creator_id, stripe_subscription_id, price_cents, status,
       current_period_start, current_period_end, created_at
     ) VALUES ($1, $2, $3, $4, 'active', to_timestamp($5), to_timestamp($6), NOW())`,
    [
      fanId,
      creatorId,
      subscription.id,
      subscription.items.data[0]?.price?.unit_amount || 0,
      (subscription as unknown as { current_period_start: number }).current_period_start,
      (subscription as unknown as { current_period_end: number }).current_period_end,
    ]
  );

  // Create notification for creator
  const fanResult = await client.query(
    'SELECT full_name, username FROM profiles WHERE id = $1',
    [fanId]
  );
  const fanName = fanResult.rows[0]?.full_name || 'Someone';

  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'new_subscriber', 'New Channel Subscriber!', $2, $3)`,
    [
      creatorId,
      `${fanName} subscribed to your channel`,
      JSON.stringify({ fanId }),
    ]
  );

  logger.info('Channel subscription created', { fanId: fanId?.substring(0, 8) + '***', creatorId: creatorId?.substring(0, 8) + '***' });
}

// ── Checkout dispatch maps ──

type CheckoutHandler = (
  client: PoolClient,
  session: Stripe.Checkout.Session,
  stripe: Stripe,
  logger: Logger,
) => Promise<void>;

const CHECKOUT_PRODUCT_HANDLERS: Record<string, CheckoutHandler> = {
  business_drop_in: (client, session, _stripe, logger) =>
    handleBusinessDropIn(client, session, logger),
  business_pass: (client, session, _stripe, logger) =>
    handleBusinessPass(client, session, logger),
  business_subscription: (client, session, stripe, logger) =>
    handleBusinessSubscriptionCheckout(client, session, stripe, logger),
};

const CHECKOUT_SUBSCRIPTION_HANDLERS: Record<string, CheckoutHandler> = {
  platform: (client, session, _stripe, logger) =>
    handlePlatformSubscriptionCheckout(client, session, logger),
  channel: (client, session, stripe, logger) =>
    handleChannelSubscriptionCheckout(client, session, stripe, logger),
};

async function handleCheckoutSessionCompleted(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  stripe: Stripe,
  logger: Logger,
): Promise<void> {
  const session = stripeEvent.data.object as Stripe.Checkout.Session;
  logger.info('Checkout session completed', { sessionId: session.id });

  const productType = session.metadata?.productType;
  const productHandler = productType ? CHECKOUT_PRODUCT_HANDLERS[productType] : undefined;
  if (productHandler) {
    await productHandler(client, session, stripe, logger);
    return;
  }

  const subscriptionType = session.metadata?.subscriptionType;
  const subscriptionHandler = subscriptionType ? CHECKOUT_SUBSCRIPTION_HANDLERS[subscriptionType] : undefined;
  if (subscriptionHandler) {
    await subscriptionHandler(client, session, stripe, logger);
  }
}

// ========================================
// SUBSCRIPTION LIFECYCLE EVENTS
// ========================================

const SUBSCRIPTION_TABLE_MAP: Record<string, string> = {
  platform: 'platform_subscriptions',
  channel: 'channel_subscriptions',
  business: 'business_subscriptions',
};

async function updateSubscriptionPeriod(
  client: PoolClient,
  table: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const subPeriod = subscription as unknown as { current_period_start: number; current_period_end: number };
  const status = subscription.cancel_at_period_end ? 'canceling' : subscription.status;
  const hasPeriodStart = table !== 'business_subscriptions';

  const params: (string | number | null)[] = [status];
  const setClauses: string[] = ['status = $1'];

  if (hasPeriodStart) {
    params.push(subPeriod.current_period_start);
    setClauses.push(`current_period_start = to_timestamp($${params.length})`);
  }

  params.push(subPeriod.current_period_end);
  setClauses.push(`current_period_end = to_timestamp($${params.length})`);

  if (subscription.cancel_at != null) {
    params.push(subscription.cancel_at);
    setClauses.push(`cancel_at = to_timestamp($${params.length})`);
  } else {
    setClauses.push('cancel_at = NULL');
  }

  if (hasPeriodStart) {
    setClauses.push('updated_at = NOW()');
  }

  params.push(subscription.id);
  await client.query(
    `UPDATE ${table} SET ${setClauses.join(', ')} WHERE stripe_subscription_id = $${params.length}`,
    params
  );
}

async function handleIdentityVerificationUpdate(
  client: PoolClient,
  subscription: Stripe.Subscription,
  logger: Logger,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId || !isValidUUID(userId)) return;

  // If subscription went past_due or unpaid, remove verification
  if (subscription.status === 'past_due' || subscription.status === 'unpaid' || subscription.status === 'canceled') {
    await client.query(
      `UPDATE profiles SET is_verified = false, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
    logger.warn('Verification sub degraded, badge removed', { userId: userId.substring(0, 8) + '***', status: subscription.status });
  }
  // If reactivated, restore verification (only if identity was already verified)
  if (subscription.status === 'active') {
    await client.query(
      `UPDATE profiles SET is_verified = true, updated_at = NOW()
       WHERE id = $1 AND identity_verification_session_id IS NOT NULL AND verified_at IS NOT NULL`,
      [userId]
    );
    logger.info('Verification sub reactivated', { userId: userId.substring(0, 8) + '***' });
  }
}

async function handleSubscriptionUpdated(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const subscription = stripeEvent.data.object as Stripe.Subscription;
  logger.info('Subscription updated', { subscriptionId: subscription.id });

  const subscriptionType = subscription.metadata?.subscriptionType || subscription.metadata?.type;

  if (subscriptionType === 'identity_verification') {
    await handleIdentityVerificationUpdate(client, subscription, logger);
    return;
  }

  const table = SUBSCRIPTION_TABLE_MAP[subscriptionType || ''];
  if (table) {
    await updateSubscriptionPeriod(client, table, subscription);
  }
}

// ── Subscription deleted sub-handlers ──

async function handleIdentityVerificationDeleted(
  client: PoolClient,
  subscription: Stripe.Subscription,
  logger: Logger,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId || !isValidUUID(userId)) return;

  await client.query(
    `UPDATE profiles
     SET is_verified = false,
         verification_subscription_id = NULL,
         verification_payment_status = 'canceled',
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );

  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'verification_expired', 'Verified Status Removed',
             'Your verification subscription has expired. Renew to keep your verified badge and access paid events.', '{}')`,
    [userId]
  );

  logger.info('Verification subscription canceled, badge removed', { userId: userId.substring(0, 8) + '***' });
}

async function handlePlatformSubscriptionDeleted(
  client: PoolClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  await client.query(
    `UPDATE platform_subscriptions
     SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  // Downgrade account type
  const userId = subscription.metadata?.userId;
  if (userId && isValidUUID(userId)) {
    await client.query(
      "UPDATE profiles SET account_type = 'personal', updated_at = NOW() WHERE id = $1",
      [userId]
    );
  }
}

async function handleChannelSubscriptionDeleted(
  client: PoolClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  await client.query(
    `UPDATE channel_subscriptions
     SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  // Notify creator
  const creatorId = subscription.metadata?.creatorId;
  if (creatorId) {
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'subscriber_canceled', 'Subscriber Left', 'A subscriber has canceled their channel subscription', '{}')`,
      [creatorId]
    );
  }
}

async function handleBusinessSubscriptionDeleted(
  client: PoolClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  await client.query(
    `UPDATE business_subscriptions
     SET status = 'canceled', cancel_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );

  const businessId = subscription.metadata?.businessId;
  if (businessId) {
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'business_sub_canceled', 'Member Left', 'A member has canceled their subscription', '{}')`,
      [businessId]
    );
  }
}

async function handleSubscriptionDeleted(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const subscription = stripeEvent.data.object as Stripe.Subscription;
  logger.info('Subscription canceled', { subscriptionId: subscription.id });

  const subscriptionType = subscription.metadata?.subscriptionType || subscription.metadata?.type;

  if (subscriptionType === 'identity_verification') {
    await handleIdentityVerificationDeleted(client, subscription, logger);
    return;
  }
  if (subscriptionType === 'platform') {
    await handlePlatformSubscriptionDeleted(client, subscription);
    return;
  }
  if (subscriptionType === 'channel') {
    await handleChannelSubscriptionDeleted(client, subscription);
    return;
  }
  if (subscriptionType === 'business') {
    await handleBusinessSubscriptionDeleted(client, subscription);
  }
}

// ========================================
// INVOICE EVENTS
// ========================================

async function handleInvoicePaid(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const invoice = stripeEvent.data.object as Stripe.Invoice;
  logger.info('Invoice paid', { invoiceId: invoice.id });

  // subscription_details moved to invoice.parent in newer Stripe types, but still present at runtime
  const paidSubDetails = (invoice as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details;

  // Record channel subscription payment for revenue tracking
  if (paidSubDetails?.metadata?.subscriptionType === 'channel') {
    const creatorId = paidSubDetails.metadata.creatorId;
    const fanId = paidSubDetails.metadata.fanId;
    // SECURITY: Derive fan count from DB, not from client-controlled metadata
    const fanCountResult = await client.query(
      'SELECT fan_count FROM profiles WHERE id = $1',
      [creatorId]
    );
    const fanCount = fanCountResult.rows[0]?.fan_count || 0;

    const platformFeePercent = calculatePlatformFeePercent(fanCount);
    const totalAmount = invoice.amount_paid;
    const platformFee = Math.round(totalAmount * (platformFeePercent / 100));
    const creatorAmount = totalAmount - platformFee;

    await client.query(
      `INSERT INTO channel_subscription_payments (
         stripe_invoice_id, creator_id, fan_id, amount_cents, platform_fee_cents, creator_amount_cents, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded')`,
      [invoice.id, creatorId, fanId, totalAmount, platformFee, creatorAmount]
    );
  }
}

// ── Invoice failed notification config ──

interface InvoiceFailedNotification {
  type: string;
  title: string;
  body: string;
  dataFn: (invoice: Stripe.Invoice, subMeta: Record<string, string> | undefined) => Record<string, unknown>;
}

const INVOICE_FAILED_NOTIFICATIONS: Record<string, InvoiceFailedNotification> = {
  identity_verification: {
    type: 'verification_payment_failed',
    title: 'Verification Payment Failed',
    body: 'Your verified account payment failed. Please update your payment method to keep your verified badge.',
    dataFn: (invoice) => ({ invoiceId: invoice.id }),
  },
  platform: {
    type: 'subscription_payment_failed',
    title: 'Pro Subscription Payment Failed',
    body: 'Your Pro subscription payment failed. Please update your payment method to keep your Pro features.',
    dataFn: (invoice) => ({ invoiceId: invoice.id }),
  },
  channel: {
    type: 'subscription_payment_failed',
    title: 'Channel Subscription Payment Failed',
    body: 'Your channel subscription payment failed. Please update your payment method.',
    dataFn: (invoice, subMeta) => ({ invoiceId: invoice.id, creatorId: subMeta?.creatorId }),
  },
  business: {
    type: 'subscription_payment_failed',
    title: 'Membership Payment Failed',
    body: 'Your membership payment failed. Please update your payment method.',
    dataFn: (invoice) => ({ invoiceId: invoice.id }),
  },
};

async function handleInvoicePaymentFailed(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const invoice = stripeEvent.data.object as Stripe.Invoice;
  logger.warn('Invoice payment failed', { invoiceId: invoice.id });

  const failedSubDetails = (invoice as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details;
  const subMeta = failedSubDetails?.metadata;
  const invoiceType = subMeta?.type || subMeta?.subscriptionType;
  const failedUserId = subMeta?.userId;

  if (!failedUserId || !isValidUUID(failedUserId)) return;

  const notifConfig = invoiceType ? INVOICE_FAILED_NOTIFICATIONS[invoiceType] : undefined;
  if (notifConfig) {
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [failedUserId, notifConfig.type, notifConfig.title, notifConfig.body, JSON.stringify(notifConfig.dataFn(invoice, subMeta))]
    );
  }

  // Platform-specific: mark subscription as past_due
  if (invoiceType === 'platform') {
    await client.query(
      `UPDATE platform_subscriptions SET status = 'past_due', updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [failedUserId]
    );
  }

  logger.warn('Invoice payment failed notification sent', {
    userId: failedUserId.substring(0, 8) + '***',
    invoiceId: invoice.id,
    subscriptionType: invoiceType,
  });
}

// ========================================
// CONNECT EVENTS
// ========================================

async function handleAccountUpdated(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const account = stripeEvent.data.object as Stripe.Account;
  logger.info('Connect account updated', { accountId: account.id });

  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;

  await client.query(
    `UPDATE profiles
     SET stripe_charges_enabled = $1,
         stripe_payouts_enabled = $2,
         updated_at = NOW()
     WHERE stripe_account_id = $3`,
    [chargesEnabled, payoutsEnabled, account.id]
  );
}

// ========================================
// IDENTITY EVENTS
// ========================================

async function handleIdentityVerified(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const session = stripeEvent.data.object as Stripe.Identity.VerificationSession;
  logger.info('Identity verified', { sessionId: session.id });

  await client.query(
    `UPDATE profiles
     SET is_verified = true,
         verified_at = NOW(),
         updated_at = NOW()
     WHERE identity_verification_session_id = $1`,
    [session.id]
  );
}

async function handleIdentityRequiresInput(
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const session = stripeEvent.data.object as Stripe.Identity.VerificationSession;
  logger.warn('Identity verification requires input', {
    sessionId: session.id,
    lastError: session.last_error,
  });
}

// ========================================
// REFUND EVENTS
// ========================================

async function handleChargeRefunded(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const charge = stripeEvent.data.object as Stripe.Charge;
  logger.info('Charge refunded', { chargeId: charge.id });

  await client.query(
    `UPDATE payments
     SET status = 'refunded',
         updated_at = NOW()
     WHERE stripe_charge_id = $1`,
    [charge.id]
  );
}

// ========================================
// DISPUTE EVENTS
// ========================================

async function handleChargeDisputeCreated(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const dispute = stripeEvent.data.object as Stripe.Dispute;
  logger.warn('Dispute created', {
    disputeId: dispute.id,
    chargeId: dispute.charge,
    amount: dispute.amount,
    reason: dispute.reason,
  });

  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  // Record dispute
  await client.query(
    `INSERT INTO disputes (
      stripe_dispute_id, stripe_charge_id, amount_cents, reason, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (stripe_dispute_id) DO UPDATE SET
      status = $5, updated_at = NOW()`,
    [dispute.id, chargeId, dispute.amount, dispute.reason, dispute.status]
  );

  // Update payment status
  await client.query(
    `UPDATE payments
     SET status = 'disputed',
         dispute_status = $2,
         updated_at = NOW()
     WHERE stripe_charge_id = $1`,
    [chargeId, dispute.status]
  );

  // Get payment details for notification
  const paymentResult = await client.query(
    'SELECT creator_id, buyer_id, amount_cents FROM payments WHERE stripe_charge_id = $1',
    [chargeId]
  );

  if (paymentResult.rows.length > 0) {
    const payment = paymentResult.rows[0];

    // Notify creator about the dispute
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'dispute_created', 'Payment Disputed', $2, $3)`,
      [
        payment.creator_id,
        `A payment of ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency || 'eur').toUpperCase()} has been disputed. Reason: ${(dispute.reason || 'unknown').replaceAll(/<[^>]*>/g, '').substring(0, 100)}`, // NOSONAR
        JSON.stringify({
          disputeId: dispute.id,
          chargeId,
          amount: dispute.amount,
          reason: dispute.reason,
        }),
      ]
    );

    // Notify admins via SNS
    if (process.env.SECURITY_ALERTS_TOPIC_ARN) {
      await snsClient.send(new PublishCommand({
        TopicArn: process.env.SECURITY_ALERTS_TOPIC_ARN,
        Subject: `DISPUTE: ${dispute.reason} - ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency || 'EUR').toUpperCase()}`,
        Message: JSON.stringify({
          type: 'payment_dispute',
          disputeId: dispute.id,
          amount: dispute.amount,
          reason: dispute.reason,
          paymentIntentId: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id,
          creatorId: payment.creator_id.substring(0, 8) + '***',
          timestamp: new Date().toISOString(),
        }),
      })).catch(snsErr => logger.error('Failed to send dispute admin alert', snsErr));
    }
  }
}

async function handleChargeDisputeUpdated(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const dispute = stripeEvent.data.object as Stripe.Dispute;
  logger.info('Dispute updated', {
    disputeId: dispute.id,
    status: dispute.status,
  });

  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  // Update dispute record
  await client.query(
    `UPDATE disputes
     SET status = $1, updated_at = NOW()
     WHERE stripe_dispute_id = $2`,
    [dispute.status, dispute.id]
  );

  // Update payment dispute status
  await client.query(
    `UPDATE payments
     SET dispute_status = $1, updated_at = NOW()
     WHERE stripe_charge_id = $2`,
    [dispute.status, chargeId]
  );
}

async function handleChargeDisputeClosed(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const dispute = stripeEvent.data.object as Stripe.Dispute;
  logger.info('Dispute closed', {
    disputeId: dispute.id,
    status: dispute.status,
  });

  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

  // Update dispute record
  await client.query(
    `UPDATE disputes
     SET status = $1, closed_at = NOW(), updated_at = NOW()
     WHERE stripe_dispute_id = $2`,
    [dispute.status, dispute.id]
  );

  // Update payment based on dispute outcome
  const newPaymentStatus = dispute.status === 'won' ? 'succeeded' : 'disputed_lost';
  await client.query(
    `UPDATE payments
     SET status = $1, dispute_status = $2, updated_at = NOW()
     WHERE stripe_charge_id = $3`,
    [newPaymentStatus, dispute.status, chargeId]
  );

  // Notify creator about outcome
  const paymentResult = await client.query(
    'SELECT creator_id FROM payments WHERE stripe_charge_id = $1',
    [chargeId]
  );

  if (paymentResult.rows.length > 0) {
    const won = dispute.status === 'won';
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'dispute_closed', $2, $3, $4)`,
      [
        paymentResult.rows[0].creator_id,
        won ? 'Dispute Won!' : 'Dispute Lost',
        won
          ? 'The dispute has been resolved in your favor. The funds have been returned.'
          : `The dispute was lost. ${(dispute.amount / 100).toFixed(2)} ${(dispute.currency || 'eur').toUpperCase()} has been deducted.`,
        JSON.stringify({ disputeId: dispute.id, status: dispute.status }),
      ]
    );
  }
}

// ========================================
// PAYOUT EVENTS
// ========================================

async function handlePayoutPaid(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const payout = stripeEvent.data.object as Stripe.Payout;
  logger.info('Payout paid', { payoutId: payout.id, amount: payout.amount });

  const accountId = (stripeEvent.account as string) || null;
  if (accountId) {
    const creatorResult = await client.query(
      'SELECT id FROM profiles WHERE stripe_account_id = $1',
      [accountId]
    );

    if (creatorResult.rows.length > 0) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout_received', 'Payout Received!', $2, $3)`,
        [
          creatorResult.rows[0].id,
          `${(payout.amount / 100).toFixed(2)} ${(payout.currency || 'eur').toUpperCase()} has been sent to your bank account`,
          JSON.stringify({ payoutId: payout.id, amount: payout.amount }),
        ]
      );
    }
  }
}

async function handlePayoutFailed(
  client: PoolClient,
  stripeEvent: Stripe.Event,
  logger: Logger,
): Promise<void> {
  const payout = stripeEvent.data.object as Stripe.Payout;
  logger.error('Payout failed', {
    payoutId: payout.id,
    failureCode: payout.failure_code,
    failureMessage: payout.failure_message,
  });

  const accountId = (stripeEvent.account as string) || null;
  if (accountId) {
    const creatorResult = await client.query(
      'SELECT id FROM profiles WHERE stripe_account_id = $1',
      [accountId]
    );

    if (creatorResult.rows.length > 0) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'payout_failed', 'Payout Failed', $2, $3)`,
        [
          creatorResult.rows[0].id,
          `Your payout of ${(payout.amount / 100).toFixed(2)} ${(payout.currency || 'eur').toUpperCase()} failed. Please check your bank details.`,
          JSON.stringify({
            payoutId: payout.id,
            failureCode: payout.failure_code,
            // SECURITY: Sanitize payout failure message before storing
            failureMessage: (payout.failure_message || '').replaceAll(/<[^>]*>/g, '').substring(0, 200), // NOSONAR
          }),
        ]
      );
    }
  }
}

// ========================================
// EVENT ROUTER MAP
// ========================================

type EventHandler = (
  client: PoolClient,
  stripeEvent: Stripe.Event,
  stripe: Stripe,
  logger: Logger,
) => Promise<void>;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  'payment_intent.succeeded': (client, evt, _stripe, logger) =>
    handlePaymentIntentSucceeded(client, evt, logger),
  'payment_intent.payment_failed': (client, evt, _stripe, logger) =>
    handlePaymentIntentFailed(client, evt, logger),
  'checkout.session.completed': (client, evt, stripe, logger) =>
    handleCheckoutSessionCompleted(client, evt, stripe, logger),
  'customer.subscription.updated': (client, evt, _stripe, logger) =>
    handleSubscriptionUpdated(client, evt, logger),
  'customer.subscription.deleted': (client, evt, _stripe, logger) =>
    handleSubscriptionDeleted(client, evt, logger),
  'invoice.paid': (client, evt, _stripe, logger) =>
    handleInvoicePaid(client, evt, logger),
  'invoice.payment_failed': (client, evt, _stripe, logger) =>
    handleInvoicePaymentFailed(client, evt, logger),
  'account.updated': (client, evt, _stripe, logger) =>
    handleAccountUpdated(client, evt, logger),
  'identity.verification_session.verified': (client, evt, _stripe, logger) =>
    handleIdentityVerified(client, evt, logger),
  'identity.verification_session.requires_input': (_client, evt, _stripe, logger) =>
    handleIdentityRequiresInput(evt, logger),
  'charge.refunded': (client, evt, _stripe, logger) =>
    handleChargeRefunded(client, evt, logger),
  'charge.dispute.created': (client, evt, _stripe, logger) =>
    handleChargeDisputeCreated(client, evt, logger),
  'charge.dispute.updated': (client, evt, _stripe, logger) =>
    handleChargeDisputeUpdated(client, evt, logger),
  'charge.dispute.closed': (client, evt, _stripe, logger) =>
    handleChargeDisputeClosed(client, evt, logger),
  'payout.paid': (client, evt, _stripe, logger) =>
    handlePayoutPaid(client, evt, logger),
  'payout.failed': (client, evt, _stripe, logger) =>
    handlePayoutFailed(client, evt, logger),
};

// ========================================
// MAIN HANDLER
// ========================================

function verifyWebhookSignature(
  stripe: Stripe,
  body: string,
  signature: string,
  secret: string,
  logger: Logger,
): Stripe.Event | null {
  try {
    return stripe.webhooks.constructEvent(body, signature, secret);
  } catch (verifyError: unknown) {
    logger.error('Webhook signature verification failed', verifyError);
    return null;
  }
}

async function insertDedupRecord(
  db: Pool,
  eventId: string,
  headers: Record<string, string>,
  logger: Logger,
): Promise<APIGatewayProxyResult | null> {
  try {
    await db.query(
      `INSERT INTO processed_webhook_events (event_id, created_at) VALUES ($1, NOW())`,
      [eventId]
    );
  } catch (dedupError: unknown) {
    const errCode = (dedupError as { code?: string }).code;
    if (errCode === '23505') { // unique_violation
      logger.info('Duplicate event (DB)', { eventId });
      processedEvents.set(eventId, Date.now());
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, skipped: 'duplicate' }) };
    }
    // CRITICAL: If the dedup table is missing, we MUST reject the webhook and let
    // Stripe retry once the table is created. Processing without dedup risks
    // duplicate payments, double account upgrades/downgrades, and data corruption.
    if (errCode === '42P01') {
      logger.error('CRITICAL: processed_webhook_events table not found — rejecting webhook. Create the table immediately.');
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Webhook handler failed' }) };
    }
    // For transient DB errors (connection issues, timeouts), allow in-memory dedup
    // as fallback. Cross-instance duplicates are possible but the handlers below
    // use idempotent operations (ON CONFLICT, status checks) to mitigate.
    logger.error('Webhook dedup insert failed (using in-memory fallback)', dedupError);
  }
  return null;
}

async function executeInTransaction(
  db: Pool,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
  } catch (txError: unknown) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  cleanupProcessedEvents();
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const stripe = await getStripeClient();
    const signature = event.headers['Stripe-Signature'] || event.headers['stripe-signature'];

    if (!signature) {
      log.warn('Missing Stripe signature');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing signature' }),
      };
    }

    if (!webhookSecret) {
      webhookSecret = await getStripeWebhookSecret();
    }

    const stripeEvent = verifyWebhookSignature(stripe, event.body || '', signature, webhookSecret, log);
    if (!stripeEvent) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid signature' }),
      };
    }

    // Replay protection: reject old or duplicate events
    const eventAge = Math.floor(Date.now() / 1000) - stripeEvent.created;
    if (eventAge > MAX_WEBHOOK_EVENT_AGE_SECONDS) {
      log.warn('Rejected stale webhook event', { eventId: stripeEvent.id, ageSeconds: eventAge });
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, skipped: 'stale' }) };
    }
    // In-memory dedup (fast path for same Lambda instance)
    if (processedEvents.has(stripeEvent.id)) {
      log.info('Duplicate event ignored', { eventId: stripeEvent.id });
      return { statusCode: 200, headers, body: JSON.stringify({ received: true, skipped: 'duplicate' }) };
    }

    // DB-backed dedup FIRST (source of truth, cross-instance protection)
    const db = await getPool();
    const dedupResponse = await insertDedupRecord(db, stripeEvent.id, headers, log);
    if (dedupResponse) return dedupResponse;

    // Mark in-memory after successful DB insert
    processedEvents.set(stripeEvent.id, Date.now());

    await executeInTransaction(db, async (client) => {
      // Route to the appropriate event handler
      const eventHandler = EVENT_HANDLERS[stripeEvent.type];
      if (eventHandler) {
        await eventHandler(client, stripeEvent, stripe, log);
      } else {
        log.info('Unhandled event type', { type: stripeEvent.type });
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (handlerError: unknown) {
    log.error('Webhook error', handlerError);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Webhook handler failed' }),
    };
  }
}
