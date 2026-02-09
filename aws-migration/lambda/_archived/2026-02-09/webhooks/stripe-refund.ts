/**
 * Stripe Refund Webhook Handler
 * POST /webhooks/stripe/refund
 *
 * Handles Stripe refund events:
 * - refund.created: Log refund and notify user
 * - refund.updated: Update refund status
 * - refund.failed: Alert admin for manual intervention
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { createHeaders } from '../../api/utils/cors';
import { verifyStripeWebhook } from '../../api/utils/stripe';

const log = createLogger('webhooks/stripe-refund');

interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason: string | null;
  payment_intent: string;
  metadata: {
    dispute_id?: string;
    payment_id?: string;
    initiated_by?: string;
  };
  failure_reason?: string;
  created: number;
}

interface StripeEvent {
  id: string;
  object: 'event';
  type: string;
  data: {
    object: StripeRefund;
  };
  created: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  const db = await getPool();
  let client: PoolClient | null = null;

  try {
    // Verify webhook signature
    const signature = event.headers['Stripe-Signature'] || event.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_REFUND;

    if (!signature || !webhookSecret) {
      log.error('Missing signature or webhook secret');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid request' }),
      };
    }

    let stripeEvent: StripeEvent;
    try {
      stripeEvent = verifyStripeWebhook(event.body || '', signature, webhookSecret) as StripeEvent;
    } catch (err) {
      log.error('Invalid Stripe signature', err);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid signature' }),
      };
    }

    log.info('Stripe refund webhook received', {
      eventType: stripeEvent.type,
      refundId: stripeEvent.data.object.id,
    });

    client = await db.connect();
    await client.query('BEGIN');

    const refund = stripeEvent.data.object;
    const eventType = stripeEvent.type;

    switch (eventType) {
      case 'refund.created':
        await handleRefundCreated(client, refund);
        break;

      case 'refund.updated':
        await handleRefundUpdated(client, refund);
        break;

      case 'charge.refund.updated':
        await handleRefundUpdated(client, refund);
        break;

      default:
        log.info('Unhandled event type', { type: eventType });
    }

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    log.error('Stripe refund webhook error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal error' }),
    };
  } finally {
    if (client) client.release();
  }
};

/**
 * Handle refund.created event
 */
async function handleRefundCreated(client: PoolClient, refund: StripeRefund): Promise<void> {
  // Find related payment and dispute
  const paymentResult = await client.query(
    'SELECT id, user_id, metadata FROM payments WHERE stripe_payment_intent_id = $1',
    [refund.payment_intent]
  );

  if (paymentResult.rows.length === 0) {
    log.warn('Payment not found for refund', {
      refundId: refund.id,
      paymentIntent: refund.payment_intent,
    });
    return;
  }

  const payment = paymentResult.rows[0];
  const disputeId = refund.metadata?.dispute_id;

  // Update or create refund record
  await client.query(
    `INSERT INTO refunds (
      stripe_refund_id, payment_id, amount_cents, currency, status,
      reason, dispute_id, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
    ON CONFLICT (stripe_refund_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      refund.id,
      payment.id,
      refund.amount,
      refund.currency.toUpperCase(),
      refund.status,
      refund.reason || 'requested_by_customer',
      disputeId || null,
      JSON.stringify(refund.metadata),
      refund.created,
    ]
  );

  // If linked to dispute, update dispute status
  if (disputeId) {
    await client.query(
      `UPDATE session_disputes
       SET status = 'resolved', resolution = 'full_refund', resolved_at = NOW()
       WHERE id = $1 AND status != 'resolved'`,
      [disputeId]
    );

    // Add timeline event
    await client.query(
      `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [
        disputeId,
        'refund_initiated',
        JSON.stringify({
          refundId: refund.id,
          amount: refund.amount,
          status: refund.status,
        }),
      ]
    );
  }

  // Notify user
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      payment.user_id,
      'refund_initiated',
      'Remboursement en cours',
      `Un remboursement de ${(refund.amount / 100).toFixed(2)} ${refund.currency.toUpperCase()} a été initié.`,
      JSON.stringify({
        refundId: refund.id,
        paymentId: payment.id,
        amount: refund.amount,
        disputeId: disputeId,
      }),
    ]
  );

  log.info('Refund created processed', {
    refundId: refund.id,
    paymentId: payment.id,
    disputeId,
  });
}

/**
 * Handle refund.updated event
 */
async function handleRefundUpdated(client: PoolClient, refund: StripeRefund): Promise<void> {
  // Update refund status
  const updateResult = await client.query(
    `UPDATE refunds
     SET status = $1, failure_reason = $2, updated_at = NOW()
     WHERE stripe_refund_id = $3
     RETURNING id, payment_id, dispute_id, user_id`,
    [refund.status, refund.failure_reason || null, refund.id]
  );

  if (updateResult.rows.length === 0) {
    log.warn('Refund record not found for update', { refundId: refund.id });
    return;
  }

  const refundRecord = updateResult.rows[0];
  const disputeId = refundRecord.dispute_id;

  if (refund.status === 'succeeded') {
    // Refund completed successfully
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        refundRecord.user_id,
        'refund_completed',
        'Remboursement effectué',
        `Votre remboursement de ${(refund.amount / 100).toFixed(2)} ${refund.currency.toUpperCase()} a été traité avec succès.`,
        JSON.stringify({
          refundId: refund.id,
          amount: refund.amount,
          disputeId: disputeId,
        }),
      ]
    );

    // Update dispute if linked
    if (disputeId) {
      await client.query(
        `UPDATE session_disputes
         SET resolution = 'full_refund', resolved_at = NOW()
         WHERE id = $1`,
        [disputeId]
      );

      await client.query(
        `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          disputeId,
          'refund_completed',
          JSON.stringify({ refundId: refund.id, amount: refund.amount }),
        ]
      );
    }

    log.info('Refund completed', { refundId: refund.id, disputeId });
  } else if (refund.status === 'failed') {
    // Refund failed - needs admin attention
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        refundRecord.user_id,
        'refund_failed',
        'Problème de remboursement',
        'Un problème est survenu lors du traitement de votre remboursement. Notre équipe vous contactera.',
        JSON.stringify({
          refundId: refund.id,
          failureReason: refund.failure_reason,
          disputeId: disputeId,
        }),
      ]
    );

    // Create admin alert
    await client.query(
      `INSERT INTO admin_alerts (type, severity, title, data, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        'refund_failed',
        'high',
        `Refund Failed: ${refund.id}`,
        JSON.stringify({
          refundId: refund.id,
          paymentId: refundRecord.payment_id,
          failureReason: refund.failure_reason,
          disputeId: disputeId,
        }),
      ]
    );

    log.error('Refund failed', {
      refundId: refund.id,
      reason: refund.failure_reason,
      disputeId,
    });
  }
}
