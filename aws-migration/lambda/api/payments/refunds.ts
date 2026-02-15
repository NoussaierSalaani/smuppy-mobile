/**
 * Stripe Refunds Lambda Handler
 * Handles manual refund operations:
 * - POST /payments/refunds - Create a refund
 * - GET /payments/refunds - List refunds
 * - GET /payments/refunds/{refundId} - Get refund details
 */

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool, SqlParam } from '../../shared/db';
import type { Pool } from 'pg';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { createHeaders } from '../utils/cors';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('payments/refunds');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

// Refund reason types
type RefundReason =
  | 'duplicate'
  | 'fraudulent'
  | 'requested_by_customer'
  | 'session_cancelled'
  | 'technical_issue'
  | 'creator_unavailable'
  | 'other';

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await getStripe();
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 3 refund creations per minute, 20 reads per minute
    const isWrite = event.httpMethod === 'POST';
    const rateCheck = await checkRateLimit({
      prefix: isWrite ? 'refund-create' : 'refund-read',
      identifier: user.id,
      maxRequests: isWrite ? 3 : 20,
      ...(isWrite && { failOpen: false }),
    });
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests, please try again later' }),
      };
    }

    const db = await getPool();
    const pathParts = event.path.split('/').filter(Boolean);
    const refundId = pathParts.length > 2 ? pathParts[2] : null;

    // GET /payments/refunds - List refunds
    if (event.httpMethod === 'GET' && !refundId) {
      return await listRefunds(db, user, event, headers);
    }

    // GET /payments/refunds/{refundId} - Get refund details
    if (event.httpMethod === 'GET' && refundId) {
      return await getRefund(db, user, refundId, headers);
    }

    // POST /payments/refunds - Create a refund
    if (event.httpMethod === 'POST') {
      return await createRefund(db, user, event, headers);
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  } catch (error: unknown) {
    log.error('Refunds error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

/**
 * List refunds for a user
 */
async function listRefunds(
  db: Pool,
  user: { id: string },
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
) {
  const { limit = '20', offset = '0', status } = event.queryStringParameters || {};

  // Check if user is admin
  const adminCheck = await db.query(
    'SELECT account_type FROM profiles WHERE id = $1',
    [user.id]
  );
  const isAdmin = adminCheck.rows[0]?.account_type === 'admin';

  let query = `
    SELECT
      r.*,
      p.stripe_payment_intent_id,
      buyer.username as buyer_username,
      buyer.full_name as buyer_name,
      creator.username as creator_username,
      creator.full_name as creator_name
    FROM refunds r
    JOIN payments p ON r.payment_id = p.id
    JOIN profiles buyer ON p.buyer_id = buyer.id
    JOIN profiles creator ON p.creator_id = creator.id
    WHERE 1=1
  `;
  const params: SqlParam[] = [];
  let paramIndex = 1;

  // Non-admins can only see their own refunds
  if (!isAdmin) {
    query += ` AND (p.buyer_id = $${paramIndex} OR p.creator_id = $${paramIndex})`;
    params.push(user.id);
    paramIndex++;
  }

  if (status) {
    query += ` AND r.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(Math.min(parseInt(limit), 50), parseInt(offset));

  const result = await db.query(query, params);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      refunds: result.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        paymentId: r.payment_id,
        stripeRefundId: r.stripe_refund_id,
        amount: (r.amount_cents as number) / 100,
        reason: r.reason,
        status: r.status,
        notes: r.notes,
        buyer: {
          username: r.buyer_username,
          name: r.buyer_name,
        },
        creator: {
          username: r.creator_username,
          name: r.creator_name,
        },
        createdAt: r.created_at,
        processedAt: r.processed_at,
      })),
      total: result.rowCount,
    }),
  };
}

/**
 * Get refund details
 */
async function getRefund(
  db: Pool,
  user: { id: string },
  refundId: string,
  headers: Record<string, string>
) {
  const stripe = await getStripe();
  const result = await db.query(
    `SELECT
      r.*,
      p.stripe_payment_intent_id,
      p.buyer_id,
      p.creator_id,
      buyer.username as buyer_username,
      buyer.full_name as buyer_name,
      creator.username as creator_username,
      creator.full_name as creator_name
    FROM refunds r
    JOIN payments p ON r.payment_id = p.id
    JOIN profiles buyer ON p.buyer_id = buyer.id
    JOIN profiles creator ON p.creator_id = creator.id
    WHERE r.id = $1`,
    [refundId]
  );

  if (result.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, message: 'Refund not found' }),
    };
  }

  const refund = result.rows[0];

  // Check authorization
  const adminCheck = await db.query(
    'SELECT account_type FROM profiles WHERE id = $1',
    [user.id]
  );
  const isAdmin = adminCheck.rows[0]?.account_type === 'admin';

  if (!isAdmin && refund.buyer_id !== user.id && refund.creator_id !== user.id) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, message: 'Forbidden' }),
    };
  }

  // Get Stripe refund details if available
  let stripeDetails = null;
  if (refund.stripe_refund_id) {
    try {
      stripeDetails = await stripe.refunds.retrieve(refund.stripe_refund_id);
    } catch (e: unknown) {
      log.warn('Failed to fetch Stripe refund details', { error: String(e) });
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      refund: {
        id: refund.id,
        paymentId: refund.payment_id,
        stripeRefundId: refund.stripe_refund_id,
        amount: refund.amount_cents / 100,
        reason: refund.reason,
        status: refund.status,
        notes: refund.notes,
        buyer: {
          id: refund.buyer_id,
          username: refund.buyer_username,
          name: refund.buyer_name,
        },
        creator: {
          id: refund.creator_id,
          username: refund.creator_username,
          name: refund.creator_name,
        },
        stripeDetails: stripeDetails ? {
          status: stripeDetails.status,
          amount: stripeDetails.amount / 100,
          currency: stripeDetails.currency,
          created: new Date(stripeDetails.created * 1000).toISOString(),
        } : null,
        createdAt: refund.created_at,
        processedAt: refund.processed_at,
      },
    }),
  };
}

/**
 * Create a refund
 */
async function createRefund(
  db: Pool,
  user: { id: string },
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
) {
  const stripe = await getStripe();
  const body = JSON.parse(event.body || '{}');
  const { paymentId, amount, reason, notes } = body as {
    paymentId: string;
    amount?: number; // Optional for partial refunds
    reason: RefundReason;
    notes?: string;
  };

  if (!paymentId || !reason) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'paymentId and reason are required',
      }),
    };
  }

  // Check authorization - only admin, buyer, or creator can request refund
  const adminCheck = await db.query(
    'SELECT account_type FROM profiles WHERE id = $1',
    [user.id]
  );
  const isAdmin = adminCheck.rows[0]?.account_type === 'admin';

  // Use a transaction with FOR UPDATE to prevent race conditions on concurrent refund requests
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get payment details with FOR UPDATE to lock the row during refund processing
    const paymentResult = await client.query(
      `SELECT
        p.id, p.buyer_id, p.creator_id, p.status, p.amount_cents,
        p.stripe_payment_intent_id, p.currency,
        creator.stripe_account_id as creator_stripe_account
      FROM payments p
      JOIN profiles creator ON p.creator_id = creator.id
      WHERE p.id = $1
      FOR UPDATE OF p`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Payment not found' }),
      };
    }

    const payment = paymentResult.rows[0];

    if (!isAdmin && payment.buyer_id !== user.id && payment.creator_id !== user.id) {
      await client.query('ROLLBACK');
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Forbidden' }),
      };
    }

    // Check if payment can be refunded
    if (payment.status !== 'succeeded') {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Only succeeded payments can be refunded',
        }),
      };
    }

    // Check if already refunded (inside transaction to prevent race condition)
    const existingRefund = await client.query(
      'SELECT id FROM refunds WHERE payment_id = $1 AND status IN ($2, $3)',
      [paymentId, 'pending', 'succeeded']
    );

    if (existingRefund.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'A refund already exists for this payment',
        }),
      };
    }

    // Calculate refund amount
    const refundAmountCents = amount
      ? Math.round(amount * 100)
      : payment.amount_cents;

    if (refundAmountCents > payment.amount_cents) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Refund amount cannot exceed payment amount',
        }),
      };
    }

    // Map reason to Stripe reason
    const stripeReason = mapToStripeReason(reason);

    try {
      // Create Stripe refund
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: refundAmountCents,
        reason: stripeReason,
        metadata: {
          paymentId,
          reason,
          requestedBy: user.id,
          platform: 'smuppy',
        },
        // If using Connect, reverse the transfer too
        ...(payment.creator_stripe_account && {
          reverse_transfer: true,
        }),
      });

      // Create refund record
      const refundResult = await client.query(
        `INSERT INTO refunds (
          payment_id, stripe_refund_id, amount_cents, reason, notes, status, requested_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id`,
        [
          paymentId,
          stripeRefund.id,
          refundAmountCents,
          reason,
          notes || null,
          stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
          user.id,
        ]
      );

      // Update payment status
      await client.query(
        `UPDATE payments
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [refundAmountCents === payment.amount_cents ? 'refunded' : 'partially_refunded', paymentId]
      );

      await client.query('COMMIT');

      // Create notification for affected user (outside transaction — non-critical)
      const notifyUserId = user.id === payment.buyer_id ? payment.creator_id : payment.buyer_id;
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'refund_processed', 'Refund Processed', $2, $3)`,
        [
          notifyUserId,
          `A refund of ${(refundAmountCents / 100).toFixed(2)} ${(payment.currency || 'EUR').toUpperCase()} has been processed`,
          JSON.stringify({ paymentId, refundId: refundResult.rows[0].id }),
        ]
      );

      log.info('Refund created', {
        refundId: refundResult.rows[0].id,
        stripeRefundId: stripeRefund.id,
        amount: refundAmountCents,
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          refund: {
            id: refundResult.rows[0].id,
            stripeRefundId: stripeRefund.id,
            amount: refundAmountCents / 100,
            status: stripeRefund.status,
            reason,
          },
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      log.error('Stripe refund failed', error);

      // Store failed refund attempt (outside transaction)
      await db.query(
        `INSERT INTO refunds (
          payment_id, amount_cents, reason, notes, status, requested_by, error_message, created_at
        ) VALUES ($1, $2, $3, $4, 'failed', $5, $6, NOW())`,
        [paymentId, refundAmountCents, reason, notes || null, user.id, 'Refund processing failed']
      );

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Failed to process refund',
        }),
      };
    }
  } finally {
    client.release();
  }
}

/**
 * Map internal reason to Stripe refund reason
 */
function mapToStripeReason(reason: RefundReason): 'duplicate' | 'fraudulent' | 'requested_by_customer' | undefined {
  switch (reason) {
    case 'duplicate':
      return 'duplicate';
    case 'fraudulent':
      return 'fraudulent';
    case 'requested_by_customer':
    case 'session_cancelled':
    case 'creator_unavailable':
    case 'technical_issue':
    case 'other':
    default:
      return 'requested_by_customer';
  }
}
