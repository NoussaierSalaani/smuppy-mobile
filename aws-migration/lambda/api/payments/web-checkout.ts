/**
 * Web Checkout Lambda Handler
 * Creates Stripe Checkout Sessions for web-based payments
 * This avoids the 30% App Store / Play Store fees
 *
 * Flow:
 * 1. App calls this endpoint to create a checkout session
 * 2. User is redirected to Stripe-hosted checkout page
 * 3. After payment, user is redirected back to app via deep link
 * 4. Webhook confirms payment and updates database
 */

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import Stripe from 'stripe';
import { getPool } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import type { Pool } from 'pg';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { createHeaders } from '../utils/cors';
import { requireRateLimit } from '../utils/rate-limit';
import { safeStripeCall } from '../../shared/stripe-resilience';

const log = createLogger('payments/web-checkout');

const WEB_DOMAIN = process.env.WEB_DOMAIN || 'https://smuppy.com';

// Default currency for all checkout sessions
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'eur';

// Product types that can be purchased
type ProductType = 'session' | 'pack' | 'channel_subscription' | 'platform_subscription' | 'tip';

interface CheckoutRequest {
  productType: ProductType;
  productId?: string;
  creatorId?: string;
  amount?: number; // For tips or custom amounts
  planType?: 'pro_creator' | 'pro_business'; // For platform subscriptions
  metadata?: Record<string, string>;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 10 checkout creations per minute, 30 status checks per minute
    const rateLimitPrefix = event.httpMethod === 'POST' ? 'web-checkout' : 'web-checkout-status';
    const maxReqs = event.httpMethod === 'POST' ? 10 : 30;
    const isCheckoutCreation = event.httpMethod === 'POST';
    const rateLimitResponse = await requireRateLimit({ prefix: rateLimitPrefix, identifier: user.sub, maxRequests: maxReqs, ...(isCheckoutCreation && { failOpen: false }) }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();

    // POST /payments/web-checkout - Create checkout session
    if (event.httpMethod === 'POST') {
      return await createCheckoutSession(db, user, event, headers);
    }

    // GET /payments/web-checkout/status/{sessionId} - Check payment status
    if (event.httpMethod === 'GET') {
      const pathParts = event.path.split('/').filter(Boolean);
      const sessionId = pathParts.at(-1)!;
      return await checkSessionStatus(sessionId, user.sub, headers);
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  } catch (error) {
    log.error('Web checkout error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

/**
 * Create a Stripe Checkout Session for web payment
 */
async function createCheckoutSession(
  db: Pool,
  user: { sub: string },
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
) {
  const stripe = await getStripeClient();
  const body = JSON.parse(event.body || '{}') as CheckoutRequest;
  const { productType, productId, creatorId, amount, planType } = body;

  if (!productType) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'productType is required' }),
    };
  }

  // SECURITY: Query by cognito_sub (user.sub is cognito_sub, not profiles.id)
  const userResult = await db.query(
    'SELECT id, email, full_name, username, stripe_customer_id FROM profiles WHERE cognito_sub = $1',
    [user.sub]
  );

  if (userResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, message: 'User not found' }),
    };
  }

  const userProfile = userResult.rows[0];

  // Get or create Stripe customer
  let customerId = userProfile.stripe_customer_id;
  if (!customerId) {
    const customer = await safeStripeCall(
      () => stripe.customers.create({
        email: userProfile.email,
        name: userProfile.full_name || userProfile.username,
        metadata: { userId: user.sub, platform: 'smuppy' },
      }),
      'customers.create', log
    );
    customerId = customer.id;

    await db.query(
      'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [customerId, userProfile.id]
    );
  }

  // Build checkout session based on product type
  let sessionConfig: Stripe.Checkout.SessionCreateParams;

  // Deep link URLs for returning to the app
  const baseSuccessUrl = `${WEB_DOMAIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const baseCancelUrl = `${WEB_DOMAIN}/checkout/cancel`;

  switch (productType) {
    case 'session': {
      if (!productId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'productId (sessionId) is required' }),
        };
      }

      // Get session details
      const sessionResult = await db.query(
        `SELECT ps.*, p.full_name as creator_name, p.stripe_account_id
         FROM private_sessions ps
         JOIN profiles p ON ps.creator_id = p.id
         WHERE ps.id = $1`,
        [productId]
      );

      if (sessionResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Session not found' }),
        };
      }

      const session = sessionResult.rows[0];
      const priceInCents = session.price_cents || Math.round(session.price * 100);

      // 80% to creator, 20% to platform
      const platformFee = Math.round(priceInCents * 0.20);

      sessionConfig = {
        mode: 'payment',
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: DEFAULT_CURRENCY,
            product_data: {
              name: `Session 1:1 avec ${session.creator_name}`,
              description: `${session.duration_minutes || session.duration} minutes`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: session.stripe_account_id,
          },
          metadata: {
            type: 'session',
            sessionId: productId,
            buyerId: user.sub,
            creatorId: session.creator_id,
            source: 'web',
          },
        },
        metadata: {
          productType: 'session',
          sessionId: productId,
          userId: user.sub,
        },
        success_url: `${baseSuccessUrl}&type=session&id=${productId}`,
        cancel_url: `${baseCancelUrl}?type=session&id=${productId}`,
      };
      break;
    }

    case 'pack': {
      if (!productId || !creatorId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'productId (packId) and creatorId are required' }),
        };
      }

      // Get pack details
      const packResult = await db.query(
        `SELECT sp.*, p.full_name as creator_name, p.stripe_account_id
         FROM session_packs sp
         JOIN profiles p ON sp.creator_id = p.id
         WHERE sp.id = $1`,
        [productId]
      );

      if (packResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Pack not found' }),
        };
      }

      const pack = packResult.rows[0];
      const priceInCents = pack.price_cents || Math.round(pack.price * 100);
      const platformFee = Math.round(priceInCents * 0.20);

      sessionConfig = {
        mode: 'payment',
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: DEFAULT_CURRENCY,
            product_data: {
              name: pack.name,
              description: `${pack.sessions_included} sessions avec ${pack.creator_name}`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: pack.stripe_account_id,
          },
          metadata: {
            type: 'pack',
            packId: productId,
            buyerId: user.sub,
            creatorId: pack.creator_id,
            source: 'web',
          },
        },
        metadata: {
          productType: 'pack',
          packId: productId,
          userId: user.sub,
        },
        success_url: `${baseSuccessUrl}&type=pack&id=${productId}`,
        cancel_url: `${baseCancelUrl}?type=pack&id=${productId}`,
      };
      break;
    }

    case 'channel_subscription': {
      if (!creatorId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'creatorId is required' }),
        };
      }

      // Get creator details (use cached fan_count column instead of COUNT subquery)
      const creatorResult = await db.query(
        `SELECT id, full_name, username, stripe_account_id, channel_price_cents, fan_count
         FROM profiles WHERE id = $1`,
        [creatorId]
      );

      if (creatorResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Creator not found' }),
        };
      }

      const creator = creatorResult.rows[0];
      const priceInCents = creator.channel_price_cents || 499; // Default $4.99

      // Calculate platform fee based on creator tier
      const fanCount = Number.parseInt(creator.fan_count) || 0;
      let platformFeePercent = 40; // Default Bronze tier
      if (fanCount >= 1000000) platformFeePercent = 20;
      else if (fanCount >= 100000) platformFeePercent = 25;
      else if (fanCount >= 10000) platformFeePercent = 30;
      else if (fanCount >= 1000) platformFeePercent = 35;

      // Get or create Stripe Price for this creator's subscription
      let stripePriceId: string;
      const existingPrice = await db.query(
        'SELECT stripe_price_id FROM creator_stripe_prices WHERE creator_id = $1 AND price_cents = $2 AND is_active = true',
        [creatorId, priceInCents]
      );

      if (existingPrice.rows.length > 0) {
        stripePriceId = existingPrice.rows[0].stripe_price_id;
      } else {
        // Create Stripe Product and Price
        const product = await safeStripeCall(
          () => stripe.products.create({
            name: `${creator.full_name || creator.username}'s Channel`,
            metadata: { creatorId, type: 'channel_subscription' },
          }),
          'products.create', log
        );

        const price = await safeStripeCall(
          () => stripe.prices.create({
            product: product.id,
            unit_amount: priceInCents,
            currency: DEFAULT_CURRENCY,
            recurring: { interval: 'month' },
          }),
          'prices.create', log
        );

        stripePriceId = price.id;

        await db.query(
          `INSERT INTO creator_stripe_prices (creator_id, stripe_product_id, stripe_price_id, price_cents, is_active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (creator_id, price_cents) DO UPDATE SET
             stripe_price_id = $3, is_active = true, updated_at = NOW()`,
          [creatorId, product.id, stripePriceId, priceInCents]
        );
      }

      sessionConfig = {
        mode: 'subscription',
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: stripePriceId,
          quantity: 1,
        }],
        subscription_data: {
          application_fee_percent: platformFeePercent,
          transfer_data: {
            destination: creator.stripe_account_id,
          },
          metadata: {
            subscriptionType: 'channel',
            creatorId,
            fanId: user.sub,
            creatorFanCount: fanCount.toString(),
          },
        },
        metadata: {
          productType: 'channel_subscription',
          creatorId,
          userId: user.sub,
        },
        success_url: `${baseSuccessUrl}&type=channel&creator=${creatorId}`,
        cancel_url: `${baseCancelUrl}?type=channel&creator=${creatorId}`,
      };
      break;
    }

    case 'platform_subscription': {
      if (!planType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'planType is required' }),
        };
      }

      // Platform subscription prices (100% to Smuppy)
      const prices = {
        pro_creator: { amount: 9900, name: 'Pro Creator', features: 'Monetization, Analytics, Priority Support' },
        pro_business: { amount: 4900, name: 'Pro Business', features: 'Business Profile, Local Discovery, Promotions' },
      };

      const plan = prices[planType];
      if (!plan) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid planType' }),
        };
      }

      // Get or create Stripe Price for platform subscription
      const priceId = process.env[`STRIPE_PRICE_${planType.toUpperCase()}`];

      if (!priceId) {
        // Create price dynamically if not configured
        const product = await safeStripeCall(
          () => stripe.products.create({
            name: `Smuppy ${plan.name}`,
            description: plan.features,
            metadata: { planType, type: 'platform_subscription' },
          }),
          'products.create', log
        );

        const price = await safeStripeCall(
          () => stripe.prices.create({
            product: product.id,
            unit_amount: plan.amount,
            currency: DEFAULT_CURRENCY,
            recurring: { interval: 'month' },
          }),
          'prices.create', log
        );

        sessionConfig = {
          mode: 'subscription',
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: price.id, quantity: 1 }],
          subscription_data: {
            metadata: {
              subscriptionType: 'platform',
              planType,
              userId: user.sub,
            },
          },
          metadata: {
            productType: 'platform_subscription',
            planType,
            userId: user.sub,
          },
          success_url: `${baseSuccessUrl}&type=platform&plan=${planType}`,
          cancel_url: `${baseCancelUrl}?type=platform&plan=${planType}`,
        };
      } else {
        sessionConfig = {
          mode: 'subscription',
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: priceId, quantity: 1 }],
          subscription_data: {
            metadata: {
              subscriptionType: 'platform',
              planType,
              userId: user.sub,
            },
          },
          metadata: {
            productType: 'platform_subscription',
            planType,
            userId: user.sub,
          },
          success_url: `${baseSuccessUrl}&type=platform&plan=${planType}`,
          cancel_url: `${baseCancelUrl}?type=platform&plan=${planType}`,
        };
      }
      break;
    }

    case 'tip': {
      if (!creatorId || !amount) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'creatorId and amount are required' }),
        };
      }

      // SECURITY: Validate tip amount (match tips/send.ts constraints)
      const tipAmountCents = Math.round(amount * 100);
      if (tipAmountCents < 100 || tipAmountCents > 50000) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid tip amount. Min 1.00, max 500.00' }) };
      }

      // Get creator details
      const creatorResult = await db.query(
        'SELECT id, full_name, username, stripe_account_id FROM profiles WHERE id = $1',
        [creatorId]
      );

      if (creatorResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, message: 'Creator not found' }),
        };
      }

      const creator = creatorResult.rows[0];
      const platformFee = Math.round(tipAmountCents * 0.15); // 15% on tips

      sessionConfig = {
        mode: 'payment',
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: DEFAULT_CURRENCY,
            product_data: {
              name: `Tip pour ${creator.full_name || creator.username}`,
              description: 'Merci pour votre soutien!',
            },
            unit_amount: tipAmountCents,
          },
          quantity: 1,
        }],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: creator.stripe_account_id,
          },
          metadata: {
            type: 'tip',
            creatorId,
            senderId: user.sub,
            source: 'web',
          },
        },
        metadata: {
          productType: 'tip',
          creatorId,
          userId: user.sub,
          amount: tipAmountCents.toString(),
        },
        success_url: `${baseSuccessUrl}&type=tip&creator=${creatorId}`,
        cancel_url: `${baseCancelUrl}?type=tip&creator=${creatorId}`,
      };
      break;
    }

    default:
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid productType' }),
      };
  }

  // Add common configuration
  sessionConfig.allow_promotion_codes = true;
  sessionConfig.billing_address_collection = 'auto';
  sessionConfig.expires_at = Math.floor(Date.now() / 1000) + (30 * 60); // 30 minutes

  // Create the checkout session
  const checkoutSession = await safeStripeCall(
    () => stripe.checkout.sessions.create(sessionConfig),
    'checkout.sessions.create', log
  );

  log.info('Created checkout session', {
    sessionId: checkoutSession.id,
    productType,
    userId: user.sub,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      expiresAt: checkoutSession.expires_at,
    }),
  };
}

/**
 * Check the status of a checkout session
 */
async function checkSessionStatus(sessionId: string, userSub: string, headers: Record<string, string>) {
  const stripe = await getStripeClient();
  try {
    const session = await safeStripeCall(
      () => stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent', 'subscription'],
      }),
      'checkout.sessions.retrieve', log
    );

    // SECURITY: Verify the requesting user owns this checkout session
    if (session.metadata?.userId && session.metadata.userId !== userSub) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Access denied' }),
      };
    }

    const sanitizedMetadata = session.metadata ? { productType: session.metadata.productType } : {};

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        status: session.status,
        paymentStatus: session.payment_status,
        metadata: sanitizedMetadata,
        amountTotal: session.amount_total,
        currency: session.currency,
      }),
    };
  } catch {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Session not found',
      }),
    };
  }
}
