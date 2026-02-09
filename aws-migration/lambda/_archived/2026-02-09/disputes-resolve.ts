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
import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { createRefund } from '../payments/stripe-refund';

const log = createLogger('admin/disputes-resolve');

interface ResolveBody {
  resolution: 'full_refund' | 'partial_refund' | 'no_refund';
  reason: string;
  refundAmount: number;
  processRefund: boolean;
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

  const disputeId = event.pathParameters?.id;
  if (!disputeId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Dispute ID required' }),
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
    const body: ResolveBody = JSON.parse(event.body || '{}');
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

    await client.query('BEGIN');

    // Get dispute details
    const disputeResult = await client.query(
      `SELECT 
        d.*,
        p.stripe_payment_intent_id,
        p.user_id as buyer_id,
        complainant.username as complainant_username,
        complainant.email as complainant_email,
        respondent.id as creator_id,
        respondent.username as respondent_username,
        respondent.email as respondent_email
      FROM session_disputes d
      JOIN payments p ON d.payment_id = p.id
      JOIN profiles complainant ON d.complainant_id = complainant.id
      JOIN profiles respondent ON d.respondent_id = respondent.id
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
    if (dispute.status === 'resolved') {
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

    // Update dispute status
    await client.query(
      `UPDATE session_disputes
       SET status = 'resolved',
           resolution = $1,
           resolution_reason = $2,
           resolved_amount_cents = $3,
           resolved_at = NOW(),
           resolved_by = $4
       WHERE id = $5`,
      [resolution, reason, refundAmount * 100, user.id, disputeId]
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
          refundAmount,
          processedBy: user.id,
        }),
        user.id,
      ]
    );

    // Process refund if applicable
    let refundResult = null;
    if (processRefund && resolution !== 'no_refund' && refundAmount > 0) {
      try {
        const stripeRefund = await createRefund({
          paymentIntentId: dispute.stripe_payment_intent_id,
          amount: Math.round(refundAmount * 100), // Convert to cents
          reason: resolution === 'full_refund' ? 'requested_by_customer' : 'partial_refund',
          metadata: {
            dispute_id: disputeId,
            admin_id: user.id,
            resolution_reason: reason,
          },
        });

        // Create refund record
        await client.query(
          `INSERT INTO refunds (
            stripe_refund_id, payment_id, dispute_id, amount_cents,
            currency, status, reason, initiated_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            stripeRefund.id,
            dispute.payment_id,
            disputeId,
            refundAmount * 100,
            dispute.currency,
            'pending',
            resolution,
            'admin',
          ]
        );

        refundResult = {
          id: stripeRefund.id,
          status: stripeRefund.status,
          amount: refundAmount,
        };

        log.info('Stripe refund processed', {
          refundId: stripeRefund.id,
          disputeId,
          amount: refundAmount,
        });
      } catch (refundError) {
        log.error('Stripe refund failed', refundError);
        // Don't fail the resolution, but log it
        await client.query(
          `INSERT INTO admin_alerts (type, severity, title, data, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            'refund_failed',
            'high',
            `Manual Refund Required: Dispute ${dispute.dispute_number}`,
            JSON.stringify({
              disputeId,
              amount: refundAmount,
              error: (refundError as Error).message,
            }),
          ]
        );
      }
    }

    // Notify complainant
    const refundMessage =
      resolution === 'full_refund'
        ? `Votre litige a été résolu en votre faveur. Un remboursement complet de ${refundAmount.toFixed(2)} ${dispute.currency.toUpperCase()} a été initié.`
        : resolution === 'partial_refund'
          ? `Votre litige a été résolu avec un remboursement partiel de ${refundAmount.toFixed(2)} ${dispute.currency.toUpperCase()}.`
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
          refundAmount,
        }),
      ]
    );

    // Notify respondent (creator)
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        dispute.creator_id,
        'dispute_resolved_creator',
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
      refundAmount,
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
          amount: refundAmount,
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
