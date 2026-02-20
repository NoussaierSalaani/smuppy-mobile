/**
 * Create Payment Intent Lambda Handler
 * Creates a Stripe PaymentIntent for session bookings and monthly packs
 *
 * Revenue Split for Sessions & Packs:
 * - Creator: 80%
 * - Smuppy: 20%
 */

import Stripe from 'stripe';
import { getStripePublishableKey } from '../../shared/secrets';
import { getStripeClient } from '../../shared/stripe-client';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { safeStripeCall } from '../../shared/stripe-resilience';
import { PLATFORM_FEE_PERCENT, APPLE_FEE_PERCENT, GOOGLE_FEE_PERCENT, MIN_PAYMENT_CENTS, MAX_PAYMENT_CENTS, PLATFORM_NAME } from '../utils/constants';
import type { APIGatewayProxyResult } from 'aws-lambda';
import type { Pool } from 'pg';
import type { Logger } from '../utils/logger';

// SECURITY: Whitelist of allowed currencies
const ALLOWED_CURRENCIES = ['eur', 'usd'];

// Purchase sources
type PurchaseSource = 'web' | 'ios' | 'android';

interface CreateIntentRequest {
  sessionId?: string;
  packId?: string; // For monthly packs
  creatorId: string;
  amount: number; // Amount in cents
  currency?: string;
  description?: string;
  type?: 'session' | 'pack'; // Type of payment
  source?: PurchaseSource; // Where the purchase is made
}

interface ValidatedPaymentData {
  creatorId: string;
  amount: number;
  currency: string;
  description?: string;
  sessionId?: string;
  packId?: string;
  type: 'session' | 'pack';
  source: PurchaseSource;
}

interface PaymentAmounts {
  grossAmount: number;
  netAmount: number;
  platformFee: number;
  creatorAmount: number;
  appStoreFee: number;
}

/**
 * Validate the payment request body and return parsed data or an error response.
 */
function validatePaymentRequest(
  body: CreateIntentRequest,
  headers: Record<string, string>,
): { data: ValidatedPaymentData } | { error: APIGatewayProxyResult } {
  const { creatorId, amount, currency = 'usd', description, sessionId, packId, type = 'session', source = 'web' } = body;

  // Validate required fields
  if (!creatorId || !amount) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'creatorId and amount are required' }),
      },
    };
  }

  // SECURITY: Validate currency against whitelist
  if (!ALLOWED_CURRENCIES.includes(currency.toLowerCase())) {
    return {
      error: {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: `Invalid currency. Allowed: ${ALLOWED_CURRENCIES.join(', ')}` }),
      },
    };
  }

  return {
    data: { creatorId, amount, currency, description, sessionId, packId, type, source },
  };
}

/**
 * SECURITY: Derive amount server-side from session or pack records.
 * Returns the verified amount in cents or an error response.
 */
async function verifyAmountFromDb(
  db: Pool,
  type: 'session' | 'pack',
  sessionId: string | undefined,
  packId: string | undefined,
  profileId: string,
  creatorId: string,
  headers: Record<string, string>,
): Promise<{ amount: number } | { error: APIGatewayProxyResult }> {
  if (type === 'session' && sessionId) {
    const sessionResult = await db.query(
      'SELECT price FROM private_sessions WHERE id = $1 AND fan_id = $2',
      [sessionId, profileId]
    );
    if (sessionResult.rows.length === 0) {
      return { error: { statusCode: 404, headers, body: JSON.stringify({ message: 'Session not found' }) } };
    }
    return { amount: Math.round(Number.parseFloat(sessionResult.rows[0].price) * 100) };
  }

  if (type === 'pack' && packId) {
    const packResult = await db.query(
      'SELECT price FROM session_packs WHERE id = $1 AND creator_id = $2',
      [packId, creatorId]
    );
    if (packResult.rows.length === 0) {
      return { error: { statusCode: 404, headers, body: JSON.stringify({ message: 'Pack not found' }) } };
    }
    return { amount: Math.round(Number.parseFloat(packResult.rows[0].price) * 100) };
  }

  return {
    error: {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'sessionId or packId is required to determine price' }),
    },
  };
}

/**
 * Calculate the effective amount after app store fees
 * @param amount Original amount in cents
 * @param source Purchase source (web, ios, android)
 * @returns Amount after app store fees
 */
function calculateNetAmount(amount: number, source: PurchaseSource): number {
  switch (source) {
    case 'ios':
      return Math.round(amount * (1 - APPLE_FEE_PERCENT / 100));
    case 'android':
      return Math.round(amount * (1 - GOOGLE_FEE_PERCENT / 100));
    case 'web':
    default:
      return amount; // No app store fees for web purchases
  }
}

/**
 * Calculate all payment amounts: net, platform fee, creator share.
 */
function calculatePaymentAmounts(verifiedAmount: number, source: PurchaseSource): PaymentAmounts {
  const netAmount = calculateNetAmount(verifiedAmount, source);
  const platformFee = Math.round(netAmount * (PLATFORM_FEE_PERCENT / 100));
  const creatorAmount = netAmount - platformFee;
  const appStoreFee = verifiedAmount - netAmount;

  return { grossAmount: verifiedAmount, netAmount, platformFee, creatorAmount, appStoreFee };
}

/**
 * Create or retrieve a Stripe Customer for the buyer.
 */
async function resolveOrCreateStripeCustomer(
  db: Pool,
  buyer: { id: string; email: string; full_name: string },
  log: Logger,
): Promise<string> {
  const customerResult = await db.query(
    'SELECT stripe_customer_id FROM profiles WHERE id = $1',
    [buyer.id]
  );

  if (customerResult.rows[0]?.stripe_customer_id) {
    return customerResult.rows[0].stripe_customer_id;
  }

  // Create new Stripe customer (wrapped in safeStripeCall for timeout + circuit breaker)
  const stripeForCustomer = await getStripeClient();
  const customer = await safeStripeCall(
    () => stripeForCustomer.customers.create({
      email: buyer.email,
      name: buyer.full_name,
      metadata: { smuppy_user_id: buyer.id },
    }),
    'customers.create',
    log
  );

  // Save customer ID to database
  await db.query(
    'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
    [customer.id, buyer.id]
  );

  return customer.id;
}

/**
 * Build the response for in-app purchases (iOS/Android).
 * No Stripe PaymentIntent is created; the actual payment is handled by Apple/Google.
 */
function buildInAppResponse(
  source: PurchaseSource,
  type: 'session' | 'pack',
  creatorId: string,
  amounts: PaymentAmounts,
  headers: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      source,
      requiresInAppPurchase: true,
      priceBreakdown: {
        grossAmount: amounts.grossAmount,
        appStoreFee: amounts.appStoreFee,
        netAmount: amounts.netAmount,
        platformFee: amounts.platformFee,
        creatorAmount: amounts.creatorAmount,
      },
      // Product ID for in-app purchase configuration
      productId: `smuppy_${type}_${creatorId.substring(0, 8)}`,
    }),
  };
}

/**
 * Create a Stripe PaymentIntent for web purchases, check for duplicates,
 * store the payment record, and return the response.
 */
async function createStripePaymentIntent(
  stripe: Stripe,
  db: Pool,
  log: Logger,
  buyer: { id: string },
  creator: { full_name: string; stripe_account_id?: string },
  data: ValidatedPaymentData,
  amounts: PaymentAmounts,
  customerId: string,
  defaultDescription: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const { creatorId, currency, description, sessionId, packId, type, source } = data;
  const { grossAmount: verifiedAmount, netAmount, platformFee, creatorAmount } = amounts;

  const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
    amount: verifiedAmount,
    currency,
    customer: customerId,
    description: description || defaultDescription,
    metadata: {
      buyer_id: buyer.id,
      creator_id: creatorId,
      session_id: sessionId || '',
      pack_id: packId || '',
      type: type,
      source: source,
      platform: PLATFORM_NAME,
      gross_amount: verifiedAmount.toString(),
      net_amount: netAmount.toString(),
      platform_fee: platformFee.toString(),
      creator_amount: creatorAmount.toString(),
      platform_fee_percent: PLATFORM_FEE_PERCENT.toString(),
      creator_share_percent: (100 - PLATFORM_FEE_PERCENT).toString(),
    },
    automatic_payment_methods: {
      enabled: true,
    },
  };

  // If creator has connected Stripe account, use Connect with destination charge
  if (creator.stripe_account_id) {
    paymentIntentParams.transfer_data = {
      destination: creator.stripe_account_id,
      amount: creatorAmount, // Creator receives 80% of net amount
    };
  }

  // SECURITY: Check for existing active payment before creating a new one
  // Use separate queries to avoid template literal in SQL (no dynamic column names)
  const existingPayment = sessionId
    ? await db.query(
          `SELECT stripe_payment_intent_id FROM payments
           WHERE buyer_id = $1 AND session_id = $2
           AND status IN ('pending', 'processing')
           AND created_at > NOW() - INTERVAL '1 hour'
           LIMIT 1`,
          [buyer.id, sessionId]
        )
    : await db.query(
          `SELECT stripe_payment_intent_id FROM payments
           WHERE buyer_id = $1 AND pack_id = $2
           AND status IN ('pending', 'processing')
           AND created_at > NOW() - INTERVAL '1 hour'
           LIMIT 1`,
          [buyer.id, packId]
        );
  if (existingPayment.rows.length > 0 && (sessionId || packId)) {
    return {
      statusCode: 409,
      headers,
      body: JSON.stringify({ message: 'A payment is already in progress for this item.' }),
    };
  }

  // SECURITY: Idempotency key prevents duplicate PaymentIntents from double-clicks
  // Key includes verified amount to prevent amount manipulation on retry
  const idempotencyKey = `pi_${buyer.id}_${type}_${verifiedAmount}_${sessionId || packId || 'direct'}`;
  const paymentIntent = await safeStripeCall(
    () => stripe.paymentIntents.create(paymentIntentParams, { idempotencyKey }),
    'paymentIntents.create',
    log
  );

  log.info('Payment intent created', {
    paymentIntentId: paymentIntent.id,
    buyerId: buyer.id.substring(0, 8) + '***',
    creatorId: creatorId.substring(0, 8) + '***',
    amount: verifiedAmount,
    type,
    source,
    netAmount,
    platformFee,
    creatorAmount,
  });

  // Store payment record in database
  await db.query(
    `INSERT INTO payments (
      stripe_payment_intent_id,
      buyer_id,
      creator_id,
      session_id,
      pack_id,
      type,
      source,
      gross_amount,
      net_amount,
      platform_fee,
      creator_amount,
      currency,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      paymentIntent.id,
      buyer.id,
      creatorId,
      sessionId || null,
      packId || null,
      type,
      source,
      verifiedAmount,
      netAmount,
      platformFee,
      creatorAmount,
      currency,
      'pending',
    ]
  );

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      source: 'web',
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
      priceBreakdown: {
        grossAmount: verifiedAmount,
        netAmount,
        platformFee,
        creatorAmount,
      },
      publishableKey: await getStripePublishableKey(),
    }),
  };
}

export const handler = withAuthHandler('payments-create-intent', async (event, { headers, log, cognitoSub, profileId, db }) => {
  const stripe = await getStripeClient();

  // Rate limit: 10 payment intents per minute
  const rateLimitResponse = await requireRateLimit({ prefix: 'payment-create', identifier: cognitoSub, windowSeconds: 60, maxRequests: 10, failOpen: false }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  // Parse and validate request body
  const body: CreateIntentRequest = event.body ? JSON.parse(event.body) : {};
  const validation = validatePaymentRequest(body, headers);
  if ('error' in validation) return validation.error;
  const data = validation.data;

  // SECURITY: Derive amount server-side from session or pack records
  const amountResult = await verifyAmountFromDb(db, data.type, data.sessionId, data.packId, profileId, data.creatorId, headers);
  if ('error' in amountResult) return amountResult.error;
  const verifiedAmount = amountResult.amount;

  // Validate verified amount (minimum $1.00 = 100 cents, maximum $50,000)
  if (!Number.isFinite(verifiedAmount) || verifiedAmount < MIN_PAYMENT_CENTS || verifiedAmount > MAX_PAYMENT_CENTS) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Invalid amount' }),
    };
  }

  // Get buyer's profile details (profileId already resolved by withAuthHandler)
  const buyerResult = await db.query(
    'SELECT id, email, full_name FROM profiles WHERE id = $1',
    [profileId]
  );
  const buyer = buyerResult.rows[0];

  // Get creator's profile and Stripe account (if connected)
  const creatorResult = await db.query(
    'SELECT id, full_name, stripe_account_id FROM profiles WHERE id = $1',
    [data.creatorId]
  );
  if (creatorResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Creator not found' }),
    };
  }
  const creator = creatorResult.rows[0];

  // Create or retrieve Stripe Customer for the buyer
  const customerId = await resolveOrCreateStripeCustomer(db, buyer, log);

  // Calculate amounts considering app store fees
  const amounts = calculatePaymentAmounts(verifiedAmount, data.source);

  // Build description based on type
  const defaultDescription = data.type === 'pack'
    ? `Monthly pack with ${creator.full_name}`
    : `Session with ${creator.full_name}`;

  // For in-app purchases, return calculated amounts for client validation
  // The actual payment verification happens via a separate endpoint
  if (data.source === 'ios' || data.source === 'android') {
    return buildInAppResponse(data.source, data.type, data.creatorId, amounts, headers);
  }

  // Create PaymentIntent for web purchases via Stripe
  // Wrap Stripe calls in try-catch to return 400 for Stripe errors instead of 500
  try {
    return await createStripePaymentIntent(stripe, db, log, buyer, creator, data, amounts, customerId, defaultDescription, headers);
  } catch (error: unknown) {
    // Handle Stripe-specific errors — don't leak internal details
    if (error instanceof Stripe.errors.StripeError) {
      log.error('Stripe error processing payment');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Payment processing failed. Please try again.',
        }),
      };
    }

    // Re-throw non-Stripe errors for withErrorHandler to catch
    throw error;
  }
});
