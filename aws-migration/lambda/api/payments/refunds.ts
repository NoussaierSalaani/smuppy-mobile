/**
 * Stripe Refunds Lambda Handler
 * Handles manual refund operations:
 * - POST /payments/refunds - Create a refund
 * - GET /payments/refunds - List refunds
 * - GET /payments/refunds/{refundId} - Get refund details
 */

import { APIGatewayProxyHandler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import type { Pool, PoolClient } from 'pg';
import { createLogger } from '../utils/logger';
import { getUserFromEvent, resolveProfileId } from '../utils/auth';
import { createHeaders } from '../utils/cors';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { PLATFORM_NAME } from '../utils/constants';
import { parseLimit } from '../utils/pagination';

const log = createLogger('payments/refunds');

// Refund reason types
type RefundReason =
  | 'duplicate'
  | 'fraudulent'
  | 'requested_by_customer'
  | 'session_cancelled'
  | 'technical_issue'
  | 'creator_unavailable'
  | 'other';

const VALID_REASONS: RefundReason[] = [
  'duplicate', 'fraudulent', 'requested_by_customer',
  'session_cancelled', 'technical_issue', 'creator_unavailable', 'other',
];

interface RefundUser {
  id: string;
}

interface RefundInput {
  paymentId: string;
  amount?: number;
  reason: RefundReason;
  notes?: string;
}

interface PaymentRow {
  id: string;
  buyer_id: string;
  creator_id: string;
  status: string;
  amount_cents: number;
  stripe_payment_intent_id: string;
  currency: string;
  creator_stripe_account: string | null;
}

interface RefundListQuery {
  query: string;
  params: SqlParam[];
}

// ── Handler ──────────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await getStripeClient();
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
    const rateLimitResponse = await requireRateLimit({
      prefix: isWrite ? 'refund-create' : 'refund-read',
      identifier: user.id,
      maxRequests: isWrite ? 3 : 20,
      ...(isWrite && { failOpen: false }),
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    // Resolve cognito_sub -> profile ID (SECURITY: user.id is cognito_sub, not profiles.id)
    const resolvedProfileId = await resolveProfileId(db, user.id);
    if (!resolvedProfileId) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const resolvedUser: RefundUser = { id: resolvedProfileId };

    const pathParts = event.path.split('/').filter(Boolean);
    const refundId = pathParts.length > 2 ? pathParts[2] : null;

    // GET /payments/refunds - List refunds
    if (event.httpMethod === 'GET' && !refundId) {
      return await listRefunds(db, resolvedUser, event, headers);
    }

    // GET /payments/refunds/{refundId} - Get refund details
    if (event.httpMethod === 'GET' && refundId) {
      if (!isValidUUID(refundId)) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid refund ID format' }) };
      }
      return await getRefund(db, resolvedUser, refundId, headers);
    }

    // POST /payments/refunds - Create a refund
    if (event.httpMethod === 'POST') {
      return await createRefund(db, resolvedUser, event, headers);
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

// ── Shared Helpers ───────────────────────────────────────────────────

/**
 * Check if a user has admin account type
 */
async function checkAdminStatus(db: Pool | PoolClient, userId: string): Promise<boolean> {
  const adminCheck = await db.query(
    'SELECT account_type FROM profiles WHERE id = $1',
    [userId]
  );
  return adminCheck.rows[0]?.account_type === 'admin';
}

// ── List Refunds ─────────────────────────────────────────────────────

/**
 * Build dynamic SQL query for refund listing with cursor pagination
 */
function buildRefundListQuery(
  isAdmin: boolean,
  userId: string,
  status: string | undefined,
  cursor: string | undefined,
  limit: string
): RefundListQuery {
  let query = `
    SELECT
      r.id, r.payment_id, r.stripe_refund_id, r.amount_cents, r.reason,
      r.status, r.notes, r.created_at, r.processed_at,
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
    params.push(userId);
    paramIndex++;
  }

  if (status) {
    query += ` AND r.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  // Cursor-based pagination on r.created_at
  if (cursor) {
    const parsedDate = new Date(cursor);
    if (!Number.isNaN(parsedDate.getTime())) {
      query += ` AND r.created_at < $${paramIndex}::timestamptz`;
      params.push(parsedDate.toISOString());
      paramIndex++;
    }
  }

  const parsedLimit = parseLimit(limit);
  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex}`;
  params.push(parsedLimit + 1);

  return { query, params };
}

/**
 * Map a refund DB row to the API response shape
 */
function formatRefundListItem(r: Record<string, unknown>) {
  return {
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
  };
}

/**
 * List refunds for a user
 */
async function listRefunds(
  db: Pool,
  user: RefundUser,
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const { limit = '20', cursor, status } = event.queryStringParameters || {};

  const isAdmin = await checkAdminStatus(db, user.id);
  const { query, params } = buildRefundListQuery(isAdmin, user.id, status, cursor, limit);
  const result = await db.query(query, params);

  const parsedLimit = parseLimit(limit);
  const hasMore = result.rows.length > parsedLimit;
  const rows = result.rows.slice(0, parsedLimit);
  const nextCursor = hasMore && rows.length > 0
    ? new Date(rows.at(-1)!.created_at as string).toISOString()
    : null;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      refunds: rows.map((r: Record<string, unknown>) => formatRefundListItem(r)),
      nextCursor,
      hasMore,
    }),
  };
}

// ── Get Refund ───────────────────────────────────────────────────────

/**
 * Fetch Stripe refund details, returning null on failure
 */
async function fetchStripeRefundDetails(stripeRefundId: string | null) {
  if (!stripeRefundId) return null;

  const stripe = await getStripeClient();
  try {
    const details = await stripe.refunds.retrieve(stripeRefundId);
    return {
      status: details.status,
      amount: details.amount / 100,
      currency: details.currency,
      created: new Date(details.created * 1000).toISOString(),
    };
  } catch (e: unknown) {
    log.warn('Failed to fetch Stripe refund details', { error: String(e) });
    return null;
  }
}

/**
 * Format a single refund detail for the API response
 */
function formatRefundDetail(
  refund: Record<string, unknown>,
  stripeDetails: { status: string | null; amount: number; currency: string; created: string } | null
) {
  return {
    id: refund.id,
    paymentId: refund.payment_id,
    stripeRefundId: refund.stripe_refund_id,
    amount: (refund.amount_cents as number) / 100,
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
    stripeDetails,
    createdAt: refund.created_at,
    processedAt: refund.processed_at,
  };
}

/**
 * Get refund details
 */
async function getRefund(
  db: Pool,
  user: RefundUser,
  refundId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const result = await db.query(
    `SELECT
      r.id, r.payment_id, r.stripe_refund_id, r.amount_cents, r.reason,
      r.status, r.notes, r.created_at, r.processed_at,
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
  const isAdmin = await checkAdminStatus(db, user.id);
  if (!isAdmin && refund.buyer_id !== user.id && refund.creator_id !== user.id) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ success: false, message: 'Forbidden' }),
    };
  }

  // Get Stripe refund details if available
  const stripeDetails = await fetchStripeRefundDetails(refund.stripe_refund_id as string | null);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      refund: formatRefundDetail(refund, stripeDetails),
    }),
  };
}

// ── Create Refund ────────────────────────────────────────────────────

/**
 * Validate and parse the refund creation request body.
 * Returns the parsed input or an error response.
 */
function validateRefundInput(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): { input: RefundInput } | { error: APIGatewayProxyResult } {
  const body = JSON.parse(event.body || '{}');
  const { paymentId, amount, reason, notes } = body as {
    paymentId: string;
    amount?: number;
    reason: RefundReason;
    notes?: string;
  };

  if (!paymentId || !reason) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'paymentId and reason are required',
        }),
      },
    };
  }

  if (!VALID_REASONS.includes(reason)) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid refund reason' }),
      },
    };
  }

  if (!isValidUUID(paymentId)) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid paymentId format' }),
      },
    };
  }

  return { input: { paymentId, amount, reason, notes } };
}

/**
 * Fetch and validate the payment row inside a transaction.
 * Locks the row with FOR UPDATE. Returns the payment or an error response.
 */
async function fetchAndValidatePayment(
  client: PoolClient,
  paymentId: string,
  userId: string,
  isAdmin: boolean,
  headers: Record<string, string>
): Promise<{ payment: PaymentRow } | { error: APIGatewayProxyResult }> {
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
    return {
      error: {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Payment not found' }),
      },
    };
  }

  const payment = paymentResult.rows[0] as PaymentRow;

  if (!isAdmin && payment.buyer_id !== userId && payment.creator_id !== userId) {
    return {
      error: {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Forbidden' }),
      },
    };
  }

  if (payment.status !== 'succeeded') {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Only succeeded payments can be refunded',
        }),
      },
    };
  }

  // Check if already refunded (inside transaction to prevent race condition)
  const existingRefund = await client.query(
    'SELECT id FROM refunds WHERE payment_id = $1 AND status IN ($2, $3)',
    [paymentId, 'pending', 'succeeded']
  );

  if (existingRefund.rows.length > 0) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'A refund already exists for this payment',
        }),
      },
    };
  }

  return { payment };
}

/**
 * Process the Stripe refund and record it in the database.
 * Commits the transaction on success.
 */
async function processStripeRefund(
  client: PoolClient,
  payment: PaymentRow,
  refundAmountCents: number,
  reason: RefundReason,
  notes: string | undefined,
  userId: string
): Promise<{ refundId: string; stripeRefundId: string; stripeStatus: string }> {
  const stripe = await getStripeClient();

  // SECURITY: Idempotency key prevents duplicate refunds from double-clicks/retries
  // Includes reason to prevent same-amount refunds with different reasons from colliding
  const refundIdempotencyKey = `refund_${payment.id}_${refundAmountCents}_${userId}_${reason}`;
  const stripeRefund = await stripe.refunds.create({
    payment_intent: payment.stripe_payment_intent_id,
    amount: refundAmountCents,
    reason: mapToStripeReason(reason),
    metadata: {
      paymentId: payment.id,
      reason,
      requestedBy: userId,
      platform: PLATFORM_NAME,
    },
    // If using Connect, reverse the transfer too
    ...(payment.creator_stripe_account && {
      reverse_transfer: true,
    }),
  }, { idempotencyKey: refundIdempotencyKey });

  // Create refund record
  const refundResult = await client.query(
    `INSERT INTO refunds (
      payment_id, stripe_refund_id, amount_cents, reason, notes, status, requested_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id`,
    [
      payment.id,
      stripeRefund.id,
      refundAmountCents,
      reason,
      notes || null,
      stripeRefund.status === 'succeeded' ? 'succeeded' : 'pending',
      userId,
    ]
  );

  // Update payment status
  await client.query(
    `UPDATE payments
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [refundAmountCents === payment.amount_cents ? 'refunded' : 'partially_refunded', payment.id]
  );

  await client.query('COMMIT');

  return {
    refundId: refundResult.rows[0].id as string,
    stripeRefundId: stripeRefund.id,
    stripeStatus: stripeRefund.status as string,
  };
}

/**
 * Record a failed refund attempt (outside the main transaction)
 */
async function recordFailedRefund(
  db: Pool,
  paymentId: string,
  refundAmountCents: number,
  reason: RefundReason,
  notes: string | undefined,
  userId: string
): Promise<void> {
  await db.query(
    `INSERT INTO refunds (
      payment_id, amount_cents, reason, notes, status, requested_by, error_message, created_at
    ) VALUES ($1, $2, $3, $4, 'failed', $5, $6, NOW())`,
    [paymentId, refundAmountCents, reason, notes || null, userId, 'Refund processing failed']
  );
}

/**
 * Send refund notification to the affected user (non-critical, outside transaction)
 */
async function sendRefundNotification(
  db: Pool,
  payment: PaymentRow,
  refundId: string,
  refundAmountCents: number,
  requesterId: string
): Promise<void> {
  const notifyUserId = requesterId === payment.buyer_id ? payment.creator_id : payment.buyer_id;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, 'refund_processed', 'Refund Processed', $2, $3)`,
    [
      notifyUserId,
      `A refund of ${(refundAmountCents / 100).toFixed(2)} ${(payment.currency || 'EUR').toUpperCase()} has been processed`,
      JSON.stringify({ paymentId: payment.id, refundId }),
    ]
  );
}

/**
 * Create a refund
 */
async function createRefund(
  db: Pool,
  user: RefundUser,
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const validated = validateRefundInput(event, headers);
  if ('error' in validated) return validated.error;

  const { paymentId, amount, reason, notes } = validated.input;
  const isAdmin = await checkAdminStatus(db, user.id);

  // Use a transaction with FOR UPDATE to prevent race conditions on concurrent refund requests
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const paymentValidation = await fetchAndValidatePayment(client, paymentId, user.id, isAdmin, headers);
    if ('error' in paymentValidation) {
      await client.query('ROLLBACK');
      return paymentValidation.error;
    }

    const { payment } = paymentValidation;

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

    try {
      const result = await processStripeRefund(client, payment, refundAmountCents, reason, notes, user.id);

      // Create notification for affected user (outside transaction -- non-critical)
      await sendRefundNotification(db, payment, result.refundId, refundAmountCents, user.id);

      log.info('Refund created', {
        refundId: result.refundId,
        stripeRefundId: result.stripeRefundId,
        amount: refundAmountCents,
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          refund: {
            id: result.refundId,
            stripeRefundId: result.stripeRefundId,
            amount: refundAmountCents / 100,
            status: result.stripeStatus,
            reason,
          },
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      log.error('Stripe refund failed', error);

      // Store failed refund attempt (outside transaction)
      await recordFailedRefund(db, paymentId, refundAmountCents, reason, notes, user.id);

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

// ── Stripe Reason Mapping ────────────────────────────────────────────

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
