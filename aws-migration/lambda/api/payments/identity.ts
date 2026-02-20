/**
 * Stripe Identity Lambda
 * Handles identity verification for creators
 *
 * Pricing:
 * - Verification subscription: $14.90/month (recurring, 100% to Smuppy minus Stripe fees)
 * - Stripe Identity charges ~$1.50 per verification (first time only)
 * - If subscription lapses, is_verified is set to false via webhook
 */
import { APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripePublishableKey } from '../../shared/secrets';
import { getStripeClient } from '../../shared/stripe-client';
import { getPool } from '../../shared/db';
import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { VERIFICATION_FEE_CENTS } from '../utils/constants';

// Stripe Price ID — resolved lazily by getOrCreateVerificationPrice()
let cachedVerificationPriceId: string | null = null;

/**
 * Get or create the Stripe Price for identity verification.
 * Creates the Product + Price on first call, then caches the ID.
 */
async function getVerificationPriceId(): Promise<string> {
  if (cachedVerificationPriceId) return cachedVerificationPriceId;

  // Check env var first
  if (process.env.STRIPE_VERIFICATION_PRICE_ID) {
    cachedVerificationPriceId = process.env.STRIPE_VERIFICATION_PRICE_ID;
    return cachedVerificationPriceId;
  }

  const stripe = await getStripeClient();

  // Search for existing product
  const products = await stripe.products.search({
    query: 'metadata["type"]:"smuppy_identity_verification"',
    limit: 1,
  });

  let productId: string;
  if (products.data.length > 0 && products.data[0].active) {
    productId = products.data[0].id;
    // Find active price for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      type: 'recurring',
      limit: 1,
    });
    if (prices.data.length > 0) {
      cachedVerificationPriceId = prices.data[0].id;
      return cachedVerificationPriceId;
    }
  } else {
    // Create product
    const product = await stripe.products.create({
      name: 'Smuppy Verified Account',
      description: 'Monthly identity verification subscription for Smuppy creators',
      metadata: { type: 'smuppy_identity_verification', platform: 'smuppy' },
    });
    productId = product.id;
  }

  // Create recurring price
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: VERIFICATION_FEE_CENTS,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { type: 'smuppy_identity_verification' },
  });

  cachedVerificationPriceId = price.id;
  return cachedVerificationPriceId;
}

// CORS headers now dynamically created via createHeaders(event)

interface IdentityBody {
  action: 'create-session' | 'get-status' | 'get-report' | 'get-config' | 'create-subscription' | 'confirm-subscription' | 'cancel-subscription'
    // Legacy one-time (kept for backward compat)
    | 'create-payment-intent' | 'confirm-payment';
  returnUrl?: string;
  paymentIntentId?: string;
}

export const handler = withAuthHandler('payments-identity', async (event, { headers, log, cognitoSub, profileId }) => {
    const stripe = await getStripeClient();

    // Rate limit: 10 identity actions per minute
    const rateLimitResponse = await requireRateLimit({ prefix: 'payment-identity', identifier: cognitoSub, windowSeconds: 60, maxRequests: 10 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const body: IdentityBody = JSON.parse(event.body || '{}');

    // Validate returnUrl if provided — must be smuppy:// deep link or https://smuppy.com
    if (body.returnUrl && !/^(smuppy:\/\/|https:\/\/(www\.)?smuppy\.com\/)/.test(body.returnUrl)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid return URL' }) };
    }

    switch (body.action) {
      case 'create-subscription':
        return await createVerificationSubscription(stripe, profileId, headers);
      case 'confirm-subscription':
        if (!body.returnUrl) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'returnUrl is required' }) };
        }
        return await confirmSubscriptionAndStartVerification(stripe, profileId, body.returnUrl, headers);
      case 'cancel-subscription':
        return await cancelVerificationSubscription(stripe, profileId, headers);
      case 'get-config':
        return await getVerificationConfig(stripe, headers);
      // Legacy one-time payment (backward compat)
      case 'create-payment-intent':
        return await createVerificationPaymentIntent(profileId, headers);
      case 'confirm-payment':
        if (!body.paymentIntentId || !body.returnUrl) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'paymentIntentId and returnUrl are required' }) };
        }
        return await confirmPaymentAndStartVerification(profileId, body.paymentIntentId, body.returnUrl, headers);
      case 'create-session':
        if (!body.returnUrl) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'returnUrl is required' }) };
        }
        return await createVerificationSession(profileId, body.returnUrl, headers);
      case 'get-status':
        return await getVerificationStatus(profileId, headers);
      case 'get-report':
        return await getVerificationReport(profileId, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
});

// ============================================
// SUBSCRIPTION-BASED VERIFICATION
// ============================================

/**
 * Create a monthly subscription for verification ($14.90/month).
 * Returns the clientSecret for the first invoice's PaymentIntent
 * so the frontend can present PaymentSheet.
 */
async function createVerificationSubscription(stripe: Stripe, userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, email, full_name, stripe_customer_id, is_verified,
              verification_subscription_id
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'User not found' }) };
    }

    const { email, full_name, stripe_customer_id, is_verified, verification_subscription_id } = result.rows[0];

    if (is_verified) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriptionActive: true }) };
    }

    // Check existing subscription
    if (verification_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(verification_subscription_id);
        if (sub.status === 'active' || sub.status === 'trialing') {
          return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriptionActive: true }) };
        }
        // incomplete — return the pending invoice client secret
        if (sub.status === 'incomplete' && sub.latest_invoice) {
          const invoice = await stripe.invoices.retrieve(sub.latest_invoice as string, { expand: ['payment_intent'] });
          // payment_intent was moved to InvoicePayment in clover API, but expand still populates it at runtime
          const pi = (invoice as unknown as { payment_intent: Stripe.PaymentIntent | null }).payment_intent;
          if (pi?.client_secret) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, clientSecret: pi.client_secret }),
            };
          }
        }
      } catch {
        // Subscription invalid, create new one
      }
    }

    // Ensure Stripe customer exists
    let customerId = stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: full_name,
        metadata: { userId, platform: 'smuppy' },
      });
      customerId = customer.id;
      await client.query('UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
    }

    // Create subscription (payment_behavior: 'default_incomplete' so we get clientSecret)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: await getVerificationPriceId() }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId, platform: 'smuppy', type: 'identity_verification' },
    });

    // Save subscription ID
    await client.query(
      `UPDATE profiles
       SET verification_subscription_id = $1,
           verification_payment_status = 'pending',
           updated_at = NOW()
       WHERE id = $2`,
      [subscription.id, userId]
    );

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    // payment_intent was moved to InvoicePayment in clover API, but expand still populates it at runtime
    const pi = (invoice as unknown as { payment_intent: Stripe.PaymentIntent }).payment_intent;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        subscriptionId: subscription.id,
        clientSecret: pi.client_secret,
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Confirm that the subscription is active and start the identity verification session.
 */
async function confirmSubscriptionAndStartVerification(
  stripe: Stripe,
  userId: string,
  returnUrl: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT verification_subscription_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'User not found' }) };
    }

    const { verification_subscription_id } = result.rows[0];
    if (!verification_subscription_id) {
      return { statusCode: 402, headers, body: JSON.stringify({ success: false, message: 'No subscription found' }) };
    }

    const sub = await stripe.subscriptions.retrieve(verification_subscription_id);
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return {
        statusCode: 402,
        headers,
        body: JSON.stringify({ success: false, message: 'Subscription not active', status: sub.status }),
      };
    }

    // Subscription is active — update payment status and start identity verification
    await client.query(
      `UPDATE profiles SET verification_payment_status = 'paid', verification_payment_date = NOW() WHERE id = $1`,
      [userId]
    );

    return await createVerificationSession(userId, returnUrl, headers);
  } finally {
    client.release();
  }
}

/**
 * Cancel the verification subscription.
 * Verification badge will be removed at period end via webhook.
 */
async function cancelVerificationSubscription(stripe: Stripe, userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT verification_subscription_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.verification_subscription_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'No active subscription' }) };
    }

    // Cancel at period end so user keeps verified status until billing period expires
    const sub = await stripe.subscriptions.update(result.rows[0].verification_subscription_id, {
      cancel_at_period_end: true,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        cancelAt: sub.cancel_at,
        currentPeriodEnd: (sub as unknown as { current_period_end: number }).current_period_end,
        message: 'Subscription will cancel at end of billing period',
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Return the current verification pricing/config so clients don't hardcode amounts.
 */
async function getVerificationConfig(stripe: Stripe, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const priceId = await getVerificationPriceId();
  const price = await stripe.prices.retrieve(priceId);

  const amount = price.unit_amount ?? VERIFICATION_FEE_CENTS;
  const currency = price.currency ?? 'usd';
  const interval = price.recurring?.interval ?? 'month';

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      priceId,
      amount,
      currency,
      interval,
    }),
  };
}

// ============================================
// LEGACY ONE-TIME PAYMENT (backward compat)
// ============================================

/**
 * Create a payment intent for the verification fee ($14.90)
 * This must be completed before starting verification
 */
async function createVerificationPaymentIntent(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Get user info
    const result = await client.query(
      'SELECT id, email, full_name, stripe_customer_id, is_verified, verification_payment_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const { email, full_name, stripe_customer_id, is_verified, verification_payment_id } = result.rows[0];

    // Check if already verified
    if (is_verified) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'User is already verified' }),
      };
    }

    // Check if payment already completed
    if (verification_payment_id) {
      // Check payment status
      const paymentIntent = await stripe.paymentIntents.retrieve(verification_payment_id);
      if (paymentIntent.status === 'succeeded') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            paymentCompleted: true,
            message: 'Payment already completed, proceed to verification',
          }),
        };
      }

      // If payment pending, return existing intent
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'requires_confirmation') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            paymentIntent: {
              id: paymentIntent.id,
              clientSecret: paymentIntent.client_secret,
              amount: paymentIntent.amount,
            },
            priceFormatted: '$14.90',
          }),
        };
      }
    }

    // Create or get Stripe customer
    let customerId = stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: full_name,
        metadata: { userId, platform: 'smuppy' },
      });
      customerId = customer.id;
      await client.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      );
    }

    // Create payment intent for verification fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: VERIFICATION_FEE_CENTS,
      currency: 'usd',
      customer: customerId,
      description: 'Smuppy Identity Verification Fee',
      metadata: {
        userId,
        type: 'identity_verification',
        platform: 'smuppy',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Save payment intent ID
    await client.query(
      'UPDATE profiles SET verification_payment_id = $1, updated_at = NOW() WHERE id = $2',
      [paymentIntent.id, userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
        },
        priceFormatted: '$14.90',
        publishableKey: await getStripePublishableKey(),
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Confirm payment was successful and create verification session
 */
async function confirmPaymentAndStartVerification(
  userId: string,
  paymentIntentId: string,
  returnUrl: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Payment not completed',
          paymentStatus: paymentIntent.status,
        }),
      };
    }

    // Verify this payment belongs to this user
    if (paymentIntent.metadata.userId !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Payment does not belong to this user' }),
      };
    }

    // Update payment status in DB
    await client.query(
      'UPDATE profiles SET verification_payment_status = $1, verification_payment_date = NOW() WHERE id = $2',
      ['paid', userId]
    );

    // Now create the verification session
    return await createVerificationSession(userId, returnUrl, headers);
  } finally {
    client.release();
  }
}

async function createVerificationSession(
  userId: string,
  returnUrl: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Get user info
    const result = await client.query(
      `SELECT email, identity_verification_session_id, verification_payment_status
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const { email, identity_verification_session_id, verification_payment_status } = result.rows[0];

    // Check if verification fee was paid
    if (verification_payment_status !== 'paid') {
      return {
        statusCode: 402,
        headers,
        body: JSON.stringify({
          error: 'Verification fee not paid',
          message: 'Please pay the $14.90 verification fee first',
          action: 'create-payment-intent',
        }),
      };
    }

    // Check if there's an existing pending session
    if (identity_verification_session_id) {
      try {
        const existingSession = await stripe.identity.verificationSessions.retrieve(
          identity_verification_session_id
        );

        if (existingSession.status === 'requires_input') {
          // Session still valid, return existing URL
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              sessionId: existingSession.id,
              url: existingSession.url,
              status: existingSession.status,
            }),
          };
        }
      } catch {
        // Session expired or invalid, create new one
      }
    }

    // Create new verification session
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      provided_details: {
        email,
      },
      options: {
        document: {
          require_id_number: true,
          require_live_capture: true,
          require_matching_selfie: true,
          allowed_types: ['driving_license', 'passport', 'id_card'],
        },
      },
      metadata: {
        userId,
        platform: 'smuppy',
        purpose: 'creator_verification',
      },
      return_url: returnUrl,
    });

    // Save session ID
    await client.query(
      'UPDATE profiles SET identity_verification_session_id = $1, updated_at = NOW() WHERE id = $2',
      [verificationSession.id, userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sessionId: verificationSession.id,
        url: verificationSession.url,
        status: verificationSession.status,
      }),
    };
  } finally {
    client.release();
  }
}

async function getVerificationStatus(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT identity_verification_session_id, is_verified FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const { identity_verification_session_id, is_verified } = result.rows[0];

    if (!identity_verification_session_id) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          hasSession: false,
          isVerified: is_verified || false,
          status: 'not_started',
        }),
      };
    }

    const session = await stripe.identity.verificationSessions.retrieve(
      identity_verification_session_id
    );

    // Update verified status in DB if verification succeeded
    if (session.status === 'verified' && !is_verified) {
      await client.query(
        'UPDATE profiles SET is_verified = true, verified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [userId]
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        hasSession: true,
        sessionId: session.id,
        status: session.status,
        isVerified: session.status === 'verified',
        lastError: session.last_error,
      }),
    };
  } finally {
    client.release();
  }
}

async function getVerificationReport(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT identity_verification_session_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.identity_verification_session_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'No verification session found' }),
      };
    }

    const session = await stripe.identity.verificationSessions.retrieve(
      result.rows[0].identity_verification_session_id,
      { expand: ['verified_outputs'] }
    );

    if (session.status !== 'verified') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Verification not completed' }),
      };
    }

    // Return limited info for privacy
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        verified: true,
        verifiedAt: session.created,
        // Only return non-sensitive verified data
        documentType: session.verified_outputs?.id_number_type,
      }),
    };
  } finally {
    client.release();
  }
}
