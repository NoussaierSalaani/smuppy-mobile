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

import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../../lambda/shared/db';
import type { PoolClient } from 'pg';
import { createLogger } from '../../api/utils/logger';
import { getUserFromEvent } from '../../api/utils/auth';
import { createHeaders } from '../../api/utils/cors';
import { requireRateLimit } from '../../api/utils/rate-limit';
import { getStripeClient } from '../../shared/stripe-client';
import { PLATFORM_NAME } from '../../api/utils/constants';

const log = createLogger('admin/disputes-resolve');

const ALLOWED_RESOLUTIONS = ['full_refund', 'partial_refund', 'no_refund', 'rescheduled'] as const;
type Resolution = typeof ALLOWED_RESOLUTIONS[number];

interface ResolveBody {
  resolution: Resolution;
  reason: string;
  refundAmount: number;
  processRefund: boolean;
}

interface DisputeRow {
  id: string;
  dispute_number: string;
  status: string;
  payment_id: string;
  complainant_id: string;
  respondent_id: string;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string;
  creator_stripe_account: string | null;
}

interface RefundResult {
  id: string;
  status: string | null;
  amount: number;
}

// ── Validation ──────────────────────────────────────────────────────

function validateDisputeId(
  disputeId: string | undefined,
  headers: Record<string, string>,
): APIGatewayProxyResult | null {
  if (!disputeId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(disputeId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid dispute ID required' }),
    };
  }
  return null;
}

function parseAndValidateBody(
  rawBody: string | null,
  headers: Record<string, string>,
): { body: ResolveBody } | { error: APIGatewayProxyResult } {
  let body: ResolveBody;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return { error: { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) } };
  }

  const { resolution, reason, refundAmount, processRefund } = body;

  if (!resolution || !reason) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Resolution and reason are required' }),
      },
    };
  }

  if (!(ALLOWED_RESOLUTIONS as readonly string[]).includes(resolution)) {
    return { error: { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid resolution type' }) } };
  }

  if (processRefund && (typeof refundAmount !== 'number' || !Number.isFinite(refundAmount) || refundAmount < 0)) {
    return { error: { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid refund amount' }) } };
  }

  return { body };
}

// ── Stripe Refund Processing ────────────────────────────────────────

async function processStripeRefund(
  client: PoolClient,
  dispute: DisputeRow,
  disputeId: string,
  refundAmountCents: number,
  resolution: Resolution,
  reason: string,
  adminId: string,
): Promise<RefundResult | null> {
  const stripe = await getStripeClient();
  const refundNotes = `Dispute #${dispute.dispute_number} - ${resolution}: ${reason}`;

  try {
    const stripeRefund = await stripe.refunds.create({
      payment_intent: dispute.stripe_payment_intent_id,
      amount: refundAmountCents,
      reason: 'requested_by_customer',
      metadata: {
        dispute_id: disputeId,
        admin_id: adminId,
        resolution_reason: reason,
        platform: PLATFORM_NAME,
      },
      ...(dispute.creator_stripe_account && { reverse_transfer: true }),
    });

    await recordSuccessfulRefund(client, disputeId, dispute.payment_id, stripeRefund, refundAmountCents, refundNotes, adminId);

    log.info('Stripe refund processed', {
      refundId: stripeRefund.id,
      disputeId,
      amountCents: refundAmountCents,
    });

    return {
      id: stripeRefund.id,
      status: stripeRefund.status,
      amount: refundAmountCents / 100,
    };
  } catch (error_) {
    log.error('Stripe refund failed', error_);
    await recordFailedRefund(client, disputeId, dispute.payment_id, refundAmountCents, refundNotes, adminId);
    return null;
  }
}

async function recordSuccessfulRefund(
  client: PoolClient,
  disputeId: string,
  paymentId: string,
  stripeRefund: { id: string; status: string | null },
  amountCents: number,
  notes: string,
  adminId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
     VALUES ($1, 'refund_initiated', $2, $3, NOW())`,
    [
      disputeId,
      JSON.stringify({ stripeRefundId: stripeRefund.id, amountCents, status: stripeRefund.status }),
      adminId,
    ]
  );

  await client.query(
    `INSERT INTO refunds (
      payment_id, stripe_refund_id, amount_cents, reason, notes, status, requested_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      paymentId,
      stripeRefund.id,
      amountCents,
      'requested_by_customer',
      notes,
      stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
      adminId,
    ]
  );

  await client.query(
    `UPDATE session_disputes SET refund_id = (
      SELECT id FROM refunds WHERE stripe_refund_id = $1 LIMIT 1
    ) WHERE id = $2`,
    [stripeRefund.id, disputeId]
  );
}

async function recordFailedRefund(
  client: PoolClient,
  disputeId: string,
  paymentId: string,
  amountCents: number,
  notes: string,
  adminId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
     VALUES ($1, 'refund_failed', $2, $3, NOW())`,
    [
      disputeId,
      JSON.stringify({ amountCents, error: 'Refund processing failed — manual refund required' }),
      adminId,
    ]
  );

  await client.query(
    `INSERT INTO refunds (
      payment_id, amount_cents, reason, notes, status, requested_by, error_message, created_at
    ) VALUES ($1, $2, $3, $4, 'failed', $5, $6, NOW())`,
    [paymentId, amountCents, 'requested_by_customer', notes, adminId, 'Refund processing failed']
  );
}

// ── Notification Builders ───────────────────────────────────────────

function buildComplainantMessage(resolution: Resolution, amountFormatted: string, currency: string): string {
  switch (resolution) {
    case 'full_refund':
      return `Votre litige a été résolu en votre faveur. Un remboursement complet de ${amountFormatted} ${currency} a été initié.`;
    case 'partial_refund':
      return `Votre litige a été résolu avec un remboursement partiel de ${amountFormatted} ${currency}.`;
    case 'rescheduled':
      return 'Votre litige a été résolu. Une nouvelle session va être programmée.';
    case 'no_refund':
      return 'Votre litige a été examiné et aucun remboursement n\'a été accordé.';
  }
}

async function notifyBothParties(
  client: PoolClient,
  dispute: DisputeRow,
  disputeId: string,
  resolution: Resolution,
  refundAmountCents: number,
): Promise<void> {
  const currency = (dispute.currency || 'eur').toUpperCase();
  const amountFormatted = (refundAmountCents / 100).toFixed(2);
  const complainantMessage = buildComplainantMessage(resolution, amountFormatted, currency);

  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, data, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      dispute.complainant_id,
      'dispute_resolved',
      'Litige résolu',
      complainantMessage,
      JSON.stringify({
        disputeId,
        disputeNumber: dispute.dispute_number,
        resolution,
        refundAmount: refundAmountCents / 100,
      }),
    ]
  );

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
}

// ── Main Handler ────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method not allowed' }) };
  }

  const disputeId = event.pathParameters?.id;
  const idError = validateDisputeId(disputeId, headers);
  if (idError) return idError;

  const db = await getPool();
  let client: PoolClient | null = null;

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const rateLimitResponse = await requireRateLimit({
      prefix: 'admin-disputes-resolve',
      identifier: user.id,
      maxRequests: 10,
      windowSeconds: 60,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    client = await db.connect();

    const adminCheck = await client.query('SELECT account_type FROM profiles WHERE id = $1', [user.id]);
    if (adminCheck.rows[0]?.account_type !== 'admin') {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'Admin access required' }) };
    }

    const parsed = parseAndValidateBody(event.body, headers);
    if ('error' in parsed) return parsed.error;

    const { resolution, reason, refundAmount, processRefund } = parsed.body;

    await client.query('BEGIN');

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
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Dispute not found' }) };
    }

    const dispute: DisputeRow = disputeResult.rows[0];

    if (dispute.status === 'resolved' || dispute.status === 'closed') {
      await client.query('ROLLBACK');
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Dispute already resolved' }) };
    }

    const refundAmountCents = Math.round((refundAmount || 0) * 100);

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
      [resolution, reason, refundAmountCents, user.id, disputeId!]
    );

    await client.query(
      `INSERT INTO dispute_timeline (dispute_id, event_type, event_data, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        disputeId,
        'resolved',
        JSON.stringify({ resolution, reason, refundAmountCents, processedBy: user.id }),
        user.id,
      ]
    );

    let refundResult: RefundResult | null = null;
    const shouldRefund = processRefund && resolution !== 'no_refund' && refundAmountCents > 0;
    if (shouldRefund) {
      refundResult = await processStripeRefund(
        client, dispute, disputeId!, refundAmountCents, resolution, reason, user.id,
      );
    }

    await notifyBothParties(client, dispute, disputeId!, resolution, refundAmountCents);

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
        resolution: { type: resolution, amount: refundAmountCents / 100, reason },
        refund: refundResult,
      }),
    };
  } catch (error_) {
    if (client) await client.query('ROLLBACK');
    log.error('Resolve dispute error', error_);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  } finally {
    if (client) client.release();
  }
};
