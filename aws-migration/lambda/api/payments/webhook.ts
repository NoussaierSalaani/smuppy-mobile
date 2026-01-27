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
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('payments/webhook');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

// UUID validation helper for metadata fields
const isValidUUID = (value: string | undefined): boolean => {
  if (!value) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};

// Revenue share tiers for channel subscriptions
function calculatePlatformFeePercent(fanCount: number): number {
  if (fanCount >= 1000000) return 20;
  if (fanCount >= 100000) return 25;
  if (fanCount >= 10000) return 30;
  if (fanCount >= 1000) return 35;
  return 40;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    const signature = event.headers['Stripe-Signature'] || event.headers['stripe-signature'];

    if (!signature) {
      log.warn('Missing Stripe signature');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing signature' }),
      };
    }

    // Verify webhook signature
    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body || '',
        signature,
        webhookSecret
      );
    } catch (err) {
      log.error('Webhook signature verification failed', err);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid signature' }),
      };
    }

    const db = await getPool();

    // Handle different event types
    switch (stripeEvent.type) {
      // ========================================
      // PAYMENT INTENT EVENTS (Sessions, Packs, Identity Verification)
      // ========================================
      case 'payment_intent.succeeded': {
        const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
        log.info('Payment succeeded', { paymentIntentId: paymentIntent.id });

        const paymentType = paymentIntent.metadata?.type;

        // Handle identity verification payment
        if (paymentType === 'identity_verification') {
          const userId = paymentIntent.metadata?.userId;
          if (!isValidUUID(userId)) {
            log.warn('Invalid userId in identity verification metadata', { userId });
            break;
          }
          await db.query(
            `UPDATE profiles
             SET verification_payment_status = 'paid',
                 verification_payment_date = NOW(),
                 updated_at = NOW()
             WHERE id = $1`,
            [userId]
          );
          log.info('Identity verification payment recorded', { userId });
          break;
        }

        // Handle session/pack payments
        await db.query(
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
          await db.query(
            `UPDATE private_sessions
             SET payment_status = 'paid',
                 status = 'confirmed',
                 updated_at = NOW()
             WHERE id = $1`,
            [sessionId]
          );
        }

        // If there's a pack, update its status
        const packId = paymentIntent.metadata?.pack_id;
        if (packId && isValidUUID(packId)) {
          await db.query(
            `UPDATE monthly_packs
             SET payment_status = 'paid',
                 status = 'active',
                 updated_at = NOW()
             WHERE id = $1`,
            [packId]
          );
        }

        // Create notification for creator
        const creatorId = paymentIntent.metadata?.creator_id;
        const buyerId = paymentIntent.metadata?.buyer_id;
        if (creatorId && buyerId && isValidUUID(creatorId) && isValidUUID(buyerId)) {
          const buyerResult = await db.query(
            'SELECT full_name, username FROM profiles WHERE id = $1',
            [buyerId]
          );
          const buyerName = buyerResult.rows[0]?.full_name || buyerResult.rows[0]?.username || 'Someone';

          const notifType = paymentType === 'pack' ? 'pack_purchased' : 'session_booked';
          const notifTitle = paymentType === 'pack' ? 'New Pack Purchased' : 'New Session Booked';
          const notifBody = paymentType === 'pack'
            ? `${buyerName} purchased a monthly pack`
            : `${buyerName} booked a session with you`;

          await db.query(
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
                creatorAmount: parseInt(paymentIntent.metadata?.creator_amount || '0'),
              }),
            ]
          );
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
        log.warn('Payment failed', {
          paymentIntentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        });

        await db.query(
          `UPDATE payments
           SET status = 'failed',
               error_message = $2,
               updated_at = NOW()
           WHERE stripe_payment_intent_id = $1`,
          [paymentIntent.id, paymentIntent.last_payment_error?.message || 'Payment failed']
        );
        break;
      }

      // ========================================
      // CHECKOUT SESSION EVENTS (Subscriptions)
      // ========================================
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        log.info('Checkout session completed', { sessionId: session.id });

        const subscriptionType = session.metadata?.subscriptionType;

        if (subscriptionType === 'platform') {
          // Platform subscription (Pro Creator or Pro Business)
          const userId = session.metadata?.userId;
          const planType = session.metadata?.planType;

          if (!isValidUUID(userId)) {
            log.warn('Invalid userId in platform subscription metadata', { userId });
            break;
          }

          await db.query(
            `INSERT INTO platform_subscriptions (
               user_id, stripe_subscription_id, plan_type, status, created_at
             ) VALUES ($1, $2, $3, 'active', NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET stripe_subscription_id = $2, plan_type = $3, status = 'active', updated_at = NOW()`,
            [userId, session.subscription, planType]
          );

          // Update account type
          const accountType = planType === 'pro_creator' ? 'pro_creator' : 'pro_local';
          await db.query(
            'UPDATE profiles SET account_type = $1, updated_at = NOW() WHERE id = $2',
            [accountType, userId]
          );

          log.info('Platform subscription activated', { userId, planType });
        } else if (subscriptionType === 'channel') {
          // Channel subscription (Fan subscribing to Creator)
          const fanId = session.metadata?.fanId;
          const creatorId = session.metadata?.creatorId;

          if (!isValidUUID(fanId) || !isValidUUID(creatorId)) {
            log.warn('Invalid IDs in channel subscription metadata', { fanId, creatorId });
            break;
          }

          // Get current period from subscription
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

          await db.query(
            `INSERT INTO channel_subscriptions (
               fan_id, creator_id, stripe_subscription_id, price_cents, status,
               current_period_start, current_period_end, created_at
             ) VALUES ($1, $2, $3, $4, 'active', to_timestamp($5), to_timestamp($6), NOW())`,
            [
              fanId,
              creatorId,
              subscription.id,
              subscription.items.data[0]?.price?.unit_amount || 0,
              subscription.current_period_start,
              subscription.current_period_end,
            ]
          );

          // Create notification for creator
          const fanResult = await db.query(
            'SELECT full_name, username FROM profiles WHERE id = $1',
            [fanId]
          );
          const fanName = fanResult.rows[0]?.full_name || fanResult.rows[0]?.username || 'Someone';

          await db.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'new_subscriber', 'New Channel Subscriber!', $2, $3)`,
            [
              creatorId,
              `${fanName} subscribed to your channel`,
              JSON.stringify({ fanId }),
            ]
          );

          log.info('Channel subscription created', { fanId, creatorId });
        }
        break;
      }

      // ========================================
      // SUBSCRIPTION LIFECYCLE EVENTS
      // ========================================
      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        log.info('Subscription updated', { subscriptionId: subscription.id });

        const subscriptionType = subscription.metadata?.subscriptionType;

        if (subscriptionType === 'platform') {
          await db.query(
            `UPDATE platform_subscriptions
             SET status = $1,
                 current_period_start = to_timestamp($2),
                 current_period_end = to_timestamp($3),
                 cancel_at = ${subscription.cancel_at ? 'to_timestamp($4)' : 'NULL'},
                 updated_at = NOW()
             WHERE stripe_subscription_id = $5`,
            [
              subscription.cancel_at_period_end ? 'canceling' : subscription.status,
              subscription.current_period_start,
              subscription.current_period_end,
              subscription.cancel_at,
              subscription.id,
            ].filter(Boolean)
          );
        } else if (subscriptionType === 'channel') {
          await db.query(
            `UPDATE channel_subscriptions
             SET status = $1,
                 current_period_start = to_timestamp($2),
                 current_period_end = to_timestamp($3),
                 cancel_at = ${subscription.cancel_at ? 'to_timestamp($4)' : 'NULL'},
                 updated_at = NOW()
             WHERE stripe_subscription_id = $5`,
            [
              subscription.cancel_at_period_end ? 'canceling' : subscription.status,
              subscription.current_period_start,
              subscription.current_period_end,
              subscription.cancel_at,
              subscription.id,
            ].filter(Boolean)
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        log.info('Subscription canceled', { subscriptionId: subscription.id });

        const subscriptionType = subscription.metadata?.subscriptionType;

        if (subscriptionType === 'platform') {
          await db.query(
            `UPDATE platform_subscriptions
             SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [subscription.id]
          );

          // Downgrade account type
          const userId = subscription.metadata?.userId;
          if (userId) {
            await db.query(
              "UPDATE profiles SET account_type = 'xplorer', updated_at = NOW() WHERE id = $1",
              [userId]
            );
          }
        } else if (subscriptionType === 'channel') {
          await db.query(
            `UPDATE channel_subscriptions
             SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [subscription.id]
          );

          // Notify creator
          const creatorId = subscription.metadata?.creatorId;
          if (creatorId) {
            await db.query(
              `INSERT INTO notifications (user_id, type, title, body, data)
               VALUES ($1, 'subscriber_canceled', 'Subscriber Left', 'A subscriber has canceled their channel subscription', '{}')`,
              [creatorId]
            );
          }
        }
        break;
      }

      // ========================================
      // INVOICE EVENTS (Recurring payments)
      // ========================================
      case 'invoice.paid': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        log.info('Invoice paid', { invoiceId: invoice.id });

        // Record channel subscription payment for revenue tracking
        if (invoice.subscription_details?.metadata?.subscriptionType === 'channel') {
          const creatorId = invoice.subscription_details.metadata.creatorId;
          const fanId = invoice.subscription_details.metadata.fanId;
          const fanCount = parseInt(invoice.subscription_details.metadata.creatorFanCount || '0');

          const platformFeePercent = calculatePlatformFeePercent(fanCount);
          const totalAmount = invoice.amount_paid;
          const platformFee = Math.round(totalAmount * (platformFeePercent / 100));
          const creatorAmount = totalAmount - platformFee;

          await db.query(
            `INSERT INTO channel_subscription_payments (
               stripe_invoice_id, creator_id, fan_id, amount_cents, platform_fee_cents, creator_amount_cents, status
             ) VALUES ($1, $2, $3, $4, $5, $6, 'succeeded')`,
            [invoice.id, creatorId, fanId, totalAmount, platformFee, creatorAmount]
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        log.warn('Invoice payment failed', { invoiceId: invoice.id });

        // Could notify user about failed payment
        break;
      }

      // ========================================
      // CONNECT EVENTS (Creator onboarding)
      // ========================================
      case 'account.updated': {
        const account = stripeEvent.data.object as Stripe.Account;
        log.info('Connect account updated', { accountId: account.id });

        // Update creator's stripe status
        const chargesEnabled = account.charges_enabled;
        const payoutsEnabled = account.payouts_enabled;

        await db.query(
          `UPDATE profiles
           SET stripe_charges_enabled = $1,
               stripe_payouts_enabled = $2,
               updated_at = NOW()
           WHERE stripe_account_id = $3`,
          [chargesEnabled, payoutsEnabled, account.id]
        );
        break;
      }

      // ========================================
      // IDENTITY EVENTS (Verification)
      // ========================================
      case 'identity.verification_session.verified': {
        const session = stripeEvent.data.object as Stripe.Identity.VerificationSession;
        log.info('Identity verified', { sessionId: session.id });

        await db.query(
          `UPDATE profiles
           SET is_verified = true,
               verified_at = NOW(),
               updated_at = NOW()
           WHERE identity_verification_session_id = $1`,
          [session.id]
        );
        break;
      }

      case 'identity.verification_session.requires_input': {
        const session = stripeEvent.data.object as Stripe.Identity.VerificationSession;
        log.warn('Identity verification requires input', {
          sessionId: session.id,
          lastError: session.last_error,
        });
        break;
      }

      // ========================================
      // REFUND EVENTS
      // ========================================
      case 'charge.refunded': {
        const charge = stripeEvent.data.object as Stripe.Charge;
        log.info('Charge refunded', { chargeId: charge.id });

        await db.query(
          `UPDATE payments
           SET status = 'refunded',
               updated_at = NOW()
           WHERE stripe_charge_id = $1`,
          [charge.id]
        );
        break;
      }

      // ========================================
      // DISPUTE EVENTS (Chargebacks)
      // ========================================
      case 'charge.dispute.created': {
        const dispute = stripeEvent.data.object as Stripe.Dispute;
        log.warn('Dispute created', {
          disputeId: dispute.id,
          chargeId: dispute.charge,
          amount: dispute.amount,
          reason: dispute.reason,
        });

        // Get payment from charge
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

        // Record dispute
        await db.query(
          `INSERT INTO disputes (
            stripe_dispute_id, stripe_charge_id, amount_cents, reason, status, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (stripe_dispute_id) DO UPDATE SET
            status = $5, updated_at = NOW()`,
          [dispute.id, chargeId, dispute.amount, dispute.reason, dispute.status]
        );

        // Update payment status
        await db.query(
          `UPDATE payments
           SET status = 'disputed',
               dispute_status = $2,
               updated_at = NOW()
           WHERE stripe_charge_id = $1`,
          [chargeId, dispute.status]
        );

        // Get payment details for notification
        const paymentResult = await db.query(
          'SELECT creator_id, buyer_id, amount_cents FROM payments WHERE stripe_charge_id = $1',
          [chargeId]
        );

        if (paymentResult.rows.length > 0) {
          const payment = paymentResult.rows[0];

          // Notify creator about the dispute
          await db.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'dispute_created', 'Payment Disputed', $2, $3)`,
            [
              payment.creator_id,
              `A payment of €${(dispute.amount / 100).toFixed(2)} has been disputed. Reason: ${dispute.reason}`,
              JSON.stringify({
                disputeId: dispute.id,
                chargeId,
                amount: dispute.amount,
                reason: dispute.reason,
              }),
            ]
          );

          // Also notify admins (TODO: implement admin notification system)
          log.warn('ADMIN ALERT: Dispute created', {
            disputeId: dispute.id,
            amount: dispute.amount,
            creatorId: payment.creator_id,
          });
        }
        break;
      }

      case 'charge.dispute.updated': {
        const dispute = stripeEvent.data.object as Stripe.Dispute;
        log.info('Dispute updated', {
          disputeId: dispute.id,
          status: dispute.status,
        });

        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

        // Update dispute record
        await db.query(
          `UPDATE disputes
           SET status = $1, updated_at = NOW()
           WHERE stripe_dispute_id = $2`,
          [dispute.status, dispute.id]
        );

        // Update payment dispute status
        await db.query(
          `UPDATE payments
           SET dispute_status = $1, updated_at = NOW()
           WHERE stripe_charge_id = $2`,
          [dispute.status, chargeId]
        );
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = stripeEvent.data.object as Stripe.Dispute;
        log.info('Dispute closed', {
          disputeId: dispute.id,
          status: dispute.status,
        });

        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

        // Update dispute record
        await db.query(
          `UPDATE disputes
           SET status = $1, closed_at = NOW(), updated_at = NOW()
           WHERE stripe_dispute_id = $2`,
          [dispute.status, dispute.id]
        );

        // Update payment based on dispute outcome
        const newPaymentStatus = dispute.status === 'won' ? 'succeeded' : 'disputed_lost';
        await db.query(
          `UPDATE payments
           SET status = $1, dispute_status = $2, updated_at = NOW()
           WHERE stripe_charge_id = $3`,
          [newPaymentStatus, dispute.status, chargeId]
        );

        // Notify creator about outcome
        const paymentResult = await db.query(
          'SELECT creator_id FROM payments WHERE stripe_charge_id = $1',
          [chargeId]
        );

        if (paymentResult.rows.length > 0) {
          const won = dispute.status === 'won';
          await db.query(
            `INSERT INTO notifications (user_id, type, title, body, data)
             VALUES ($1, 'dispute_closed', $2, $3, $4)`,
            [
              paymentResult.rows[0].creator_id,
              won ? 'Dispute Won!' : 'Dispute Lost',
              won
                ? 'The dispute has been resolved in your favor. The funds have been returned.'
                : `The dispute was lost. €${(dispute.amount / 100).toFixed(2)} has been deducted.`,
              JSON.stringify({ disputeId: dispute.id, status: dispute.status }),
            ]
          );
        }
        break;
      }

      // ========================================
      // PAYOUT EVENTS (Creator notifications)
      // ========================================
      case 'payout.paid': {
        const payout = stripeEvent.data.object as Stripe.Payout;
        log.info('Payout paid', { payoutId: payout.id, amount: payout.amount });

        // Find creator by Stripe account
        const accountId = (stripeEvent.account as string) || null;
        if (accountId) {
          const creatorResult = await db.query(
            'SELECT id FROM profiles WHERE stripe_account_id = $1',
            [accountId]
          );

          if (creatorResult.rows.length > 0) {
            await db.query(
              `INSERT INTO notifications (user_id, type, title, body, data)
               VALUES ($1, 'payout_received', 'Payout Received!', $2, $3)`,
              [
                creatorResult.rows[0].id,
                `€${(payout.amount / 100).toFixed(2)} has been sent to your bank account`,
                JSON.stringify({ payoutId: payout.id, amount: payout.amount }),
              ]
            );
          }
        }
        break;
      }

      case 'payout.failed': {
        const payout = stripeEvent.data.object as Stripe.Payout;
        log.error('Payout failed', {
          payoutId: payout.id,
          failureCode: payout.failure_code,
          failureMessage: payout.failure_message,
        });

        const accountId = (stripeEvent.account as string) || null;
        if (accountId) {
          const creatorResult = await db.query(
            'SELECT id FROM profiles WHERE stripe_account_id = $1',
            [accountId]
          );

          if (creatorResult.rows.length > 0) {
            await db.query(
              `INSERT INTO notifications (user_id, type, title, body, data)
               VALUES ($1, 'payout_failed', 'Payout Failed', $2, $3)`,
              [
                creatorResult.rows[0].id,
                `Your payout of €${(payout.amount / 100).toFixed(2)} failed. Please check your bank details.`,
                JSON.stringify({
                  payoutId: payout.id,
                  failureCode: payout.failure_code,
                  failureMessage: payout.failure_message,
                }),
              ]
            );
          }
        }
        break;
      }

      default:
        log.info('Unhandled event type', { type: stripeEvent.type });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    log.error('Webhook error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Webhook handler failed' }),
    };
  }
}
