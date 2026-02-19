/**
 * Admin Resolve Dispute Lambda Handler
 * POST /admin/disputes/{id}/resolve
 *
 * Allows admin to resolve a dispute:
 * - Make final decision (full/partial/no refund)
 * - Process Stripe refund if applicable
 * - Update dispute status
 * - Notify both parties
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { requireRateLimit } from '../../api/utils/rate-limit';
import { getStripeClient } from '../../shared/stripe-client';

const log = createLogger('admin/disputes-resolve');

interface ResolveBody {
  resolution: 'full_refund' | 'partial_refund' | 'no_refund' | 'rescheduled';
  reason: string;
  refundAmount: number;
  processRefund: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

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

  const disputeId = event.pathParameters?.id;
  if (!disputeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(disputeId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid dispute ID required' }),
    };
  }

  const db = await getPool();
  let client: PoolClient | null = null;

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 10 resolves per minute
    const rateLimitResponse = await requireRateLimit({
      prefix: 'admin-disputes-resolve',
      identifier: user.id,
      maxRequests: 10,
      windowSeconds: 60,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    client = await db.connect();

    // Check admin role
    const adminCheck = await client.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [user.id]
    );

    if (adminCheck.rows[0]?.account_type !== 'admin') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Admin access required' }),
      };
    }

    // Parse body
    let body: ResolveBody;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }
    const { resolution, reason, refundAmount, processRefund } = body;

    if (!resolution || !reason) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Resolution and reason are required',
        }),
      };
    }

    const ALLOWED_RESOLUTIONS = ['full_refund', 'partial_refund', 'no_refund', 'rescheduled'];
    if (!ALLOWED_RESOLUTIONS.includes(resolution)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid resolution type' }) };
    }

    if (processRefund && (typeof refundAmount !== 'number' || !Number.isFinite(refundAmount) || refundAmount < 0)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid refund amount' }) };
    }

    const stripe = await getStripeClient();

    await client.query('BEGIN');

    // Get dispute details
    const disputeResult = await client.query(
      `SELECT
        d.id,
        d.dispute_number,
        d.status,
        d.payment_id,
        d.complainant_id,
        d.respondent_id,
        d.amount_cents,
        d.currency,
        p.stripe_payment_intent_id,
        p.creator_stripe_account
      FROM session_disputes d
      JOIN payments p ON d.payment_id = p.id
      WHERE d.id = $1`,
      [disputeId]
    );

    if (disputeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Dispute not found' }),
      };
    }

    const dispute = disputeResult.rows[0];

    // Check if already resolved
    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Dispute already resolved',
        }),
      };
    }

    const refundAmountCents = Math.round((refundAmount || 0) * 100);

    // Update dispute status
    await client.query(
      `UPDATE session_disputes
       SET status = 'resolved',
           resolution = $1,
           resolution_reason = $2,
           refund_amount_cents = $3,
           resolved_at = NOW(),
           resolved_by = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [resolution, reason, refundAmountCents, user.id, disputeId]
    );

    // Add timeline event
    await client.query(
      `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        disputeId,
        'resolved',
        JSON.stringify({
          resolution,
          reason,
          refundAmountCents,
          processedBy: user.id,
        }),
        user.id,
      ]
    );

    // Process refund if applicable
    let refundResult = null;
    if (processRefund && resolution !== 'no_refund' && refundAmountCents > 0) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: dispute.stripe_payment_intent_id,
          amount: refundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            dispute_id: disputeId,
            admin_id: user.id,
            resolution_reason: reason,
            platform: 'smuppy',
          },
          ...(dispute.creator_stripe_account && {
            reverse_transfer: true,
          }),
        });

        // Add refund_initiated timeline event
        await client.query(
          `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
           VALUES ($1, 'refund_initiated', $2, $3, NOW())`,
          [
            disputeId,
            JSON.stringify({
              stripeRefundId: stripeRefund.id,
              amountCents: refundAmountCents,
              status: stripeRefund.status,
            }),
            user.id,
          ]
        );

        // Create refund record (matching refunds.ts column pattern)
        await client.query(
          `INSERT INTO refunds (
            payment_id, stripe_refund_id, amount_cents, reason, notes, status, requested_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            dispute.payment_id,
            stripeRefund.id,
            refundAmountCents,
            'requested_by_customer',
            `Dispute #${dispute.dispute_number} - ${resolution}: ${reason}`,
            stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
            user.id,
          ]
        );

        // Link refund to dispute
        await client.query(
          `UPDATE session_disputes SET refund_id = (
            SELECT id FROM refunds WHERE stripe_refund_id = $1 LIMIT 1
          ) WHERE id = $2`,
          [stripeRefund.id, disputeId]
        );

        refundResult = {
          id: stripeRefund.id,
          status: stripeRefund.status,
          amount: refundAmountCents / 100,
        };

        log.info('Stripe refund processed', {
          refundId: stripeRefund.id,
          disputeId,
          amountCents: refundAmountCents,
        });
      } catch (refundError) {
        log.error('Stripe refund failed', refundError);

        // Log refund failure in timeline (instead of non-existent admin_alerts table)
        await client.query(
          `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
           VALUES ($1, 'refund_failed', $2, $3, NOW())`,
          [
            disputeId,
            JSON.stringify({
              amountCents: refundAmountCents,
              error: 'Refund processing failed — manual refund required',
            }),
            user.id,
          ]
        );

        // Store failed refund attempt (matching refunds.ts pattern)
        await client.query(
          `INSERT INTO refunds (
            payment_id, amount_cents, reason, notes, status, requested_by, error_message, created_at
          ) VALUES ($1, $2, $3, $4, 'failed', $5, $6, NOW())`,
          [
            dispute.payment_id,
            refundAmountCents,
            'requested_by_customer',
            `Dispute #${dispute.dispute_number} - ${resolution}: ${reason}`,
            user.id,
            'Refund processing failed',
          ]
        );
      }
    }

    // Notify complainant
    const currency = (dispute.currency || 'eur').toUpperCase();
    const amountFormatted = (refundAmountCents / 100).toFixed(2);

    const refundMessage =
      resolution === 'full_refund'
        ? `Votre litige a été résolu en votre faveur. Un remboursement complet de ${amountFormatted} ${currency} a été initié.`
        : resolution === 'partial_refund'
          ? `Votre litige a été résolu avec un remboursement partiel de ${amountFormatted} ${currency}.`
          : resolution === 'rescheduled'
            ? 'Votre litige a été résolu. Une nouvelle session va être programmée.'
            : 'Votre litige a été examiné et aucun remboursement n\'a été accordé.';

    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        dispute.complainant_id,
        'dispute_resolved',
        'Litige résolu',
        refundMessage,
        JSON.stringify({
          disputeId,
          disputeNumber: dispute.dispute_number,
          resolution,
          refundAmount: refundAmountCents / 100,
        }),
      ]
    );

    // Notify respondent
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        dispute.respondent_id,
        'dispute_resolved',
        'Litige résolu',
        `Le litige #${dispute.dispute_number} concernant votre session a été résolu par notre équipe.`,
        JSON.stringify({
          disputeId,
          disputeNumber: dispute.dispute_number,
          resolution,
        }),
      ]
    );

    await client.query('COMMIT');

    log.info('Dispute resolved', {
      disputeId,
      resolution,
      refundAmountCents,
      processedBy: user.id,
      refundId: refundResult?.id,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Dispute resolved successfully',
        resolution: {
          type: resolution,
          amount: refundAmountCents / 100,
          reason,
        },
        refund: refundResult,
      }),
    };
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    log.error('Resolve dispute error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  } finally {
    if (client) client.release();
  }
};
