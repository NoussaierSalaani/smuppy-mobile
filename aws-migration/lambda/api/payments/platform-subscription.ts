/**
 * Platform Subscription Lambda
 * Handles Pro Creator ($99/month) and Pro Business ($49/month) subscriptions
 * 100% revenue goes to Smuppy
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool } from '../../shared/db';
import { checkRateLimit } from '../utils/rate-limit';
import { createLogger } from '../utils/logger';
import { createHeaders } from '../utils/cors';

const log = createLogger('payments-platform-subscription');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

import { getSecureHeaders } from '../utils/cors';

// Security headers for inner functions that don't receive the event
const fallbackCorsHeaders = getSecureHeaders();

// Platform subscription prices (in cents)
const PLATFORM_PRICES = {
  pro_creator: 9900, // $99/month
  pro_business: 4900, // $49/month (Pro Local/Business)
};

interface SubscriptionBody {
  action: 'subscribe' | 'cancel' | 'get-status' | 'get-portal-link';
  planType?: 'pro_creator' | 'pro_business';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    await getStripe();
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 5 requests per minute per user
    const rateCheck = await checkRateLimit({ prefix: 'platform-sub', identifier: userId, maxRequests: 5, failOpen: false });
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({ success: false, message: 'Too many requests, please try again later' }),
      };
    }

    const body: SubscriptionBody = JSON.parse(event.body || '{}');

    // Resolve cognito_sub → profile ID
    const pool = await getPool();
    const profileLookup = await pool.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers: fallbackCorsHeaders, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    switch (body.action) {
      case 'subscribe':
        if (!body.planType || !['pro_creator', 'pro_business'].includes(body.planType)) {
          return { statusCode: 400, headers: fallbackCorsHeaders, body: JSON.stringify({ success: false, message: 'Invalid plan type' }) };
        }
        return await createPlatformSubscription(profileId, body.planType);
      case 'cancel':
        return await cancelPlatformSubscription(profileId);
      case 'get-status':
        return await getSubscriptionStatus(profileId);
      case 'get-portal-link':
        return await getCustomerPortalLink(profileId);
      default:
        return {
          statusCode: 400,
          headers: fallbackCorsHeaders,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
  } catch (error) {
    log.error('Platform subscription error', error);
    return {
      statusCode: 500,
      headers: fallbackCorsHeaders,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

async function createPlatformSubscription(
  userId: string,
  planType: 'pro_creator' | 'pro_business'
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Get user info
    const userResult = await client.query(
      'SELECT stripe_customer_id, email, full_name, account_type FROM profiles WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const { stripe_customer_id, email, full_name, account_type } = userResult.rows[0];

    // Check if already subscribed
    if (account_type === 'pro_creator' || account_type === 'pro_business') {
      return {
        statusCode: 400,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({ success: false, message: 'Already subscribed to a Pro plan' }),
      };
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

    // Get or create the price for this plan
    const priceId = await getOrCreatePlatformPrice(planType);

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `smuppy://subscription-success?plan=${planType}`,
      cancel_url: 'smuppy://subscription-cancel',
      metadata: {
        userId,
        planType,
        subscriptionType: 'platform',
      },
      subscription_data: {
        metadata: {
          userId,
          planType,
          subscriptionType: 'platform',
        },
      },
    });

    return {
      statusCode: 200,
      headers: fallbackCorsHeaders,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
    };
  } finally {
    client.release();
  }
}

async function getOrCreatePlatformPrice(planType: 'pro_creator' | 'pro_business'): Promise<string> {
  const stripe = await getStripe();
  const productName = planType === 'pro_creator' ? 'Smuppy Pro Creator' : 'Smuppy Pro Business';
  const amount = PLATFORM_PRICES[planType];

  // Search for existing product
  const products = await stripe.products.search({
    query: `name:'${productName}' AND active:'true'`,
  });

  let productId: string;

  if (products.data.length > 0) {
    productId = products.data[0].id;
  } else {
    // Create product
    const product = await stripe.products.create({
      name: productName,
      description: planType === 'pro_creator'
        ? 'Smuppy Pro Creator monthly subscription - $99/month'
        : 'Smuppy Pro Business monthly subscription - $49/month',
      metadata: { planType },
    });
    productId = product.id;
  }

  // Search for existing price
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: 'recurring',
  });

  if (prices.data.length > 0) {
    return prices.data[0].id;
  }

  // Create price
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { planType },
  });

  return price.id;
}

async function cancelPlatformSubscription(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT stripe_subscription_id FROM platform_subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trialing')`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({ success: false, message: 'No active subscription found' }),
      };
    }

    const stripeSubId = result.rows[0].stripe_subscription_id;

    // Cancel at period end
    const subscription = await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });

    await client.query(
      `UPDATE platform_subscriptions
       SET status = 'canceling', cancel_at = to_timestamp($1), updated_at = NOW()
       WHERE stripe_subscription_id = $2`,
      [subscription.cancel_at, stripeSubId]
    );

    return {
      statusCode: 200,
      headers: fallbackCorsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Subscription will be canceled at end of billing period',
        cancelAt: subscription.cancel_at,
      }),
    };
  } finally {
    client.release();
  }
}

async function getSubscriptionStatus(userId: string): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, plan_type, status, current_period_start, current_period_end, cancel_at
       FROM platform_subscriptions
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 200,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({
          success: true,
          hasSubscription: false,
          status: 'none',
        }),
      };
    }

    const sub = result.rows[0];

    return {
      statusCode: 200,
      headers: fallbackCorsHeaders,
      body: JSON.stringify({
        success: true,
        hasSubscription: true,
        subscription: {
          id: sub.id,
          planType: sub.plan_type,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAt: sub.cancel_at,
        },
      }),
    };
  } finally {
    client.release();
  }
}

async function getCustomerPortalLink(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_customer_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_customer_id) {
      return {
        statusCode: 400,
        headers: fallbackCorsHeaders,
        body: JSON.stringify({ success: false, message: 'No Stripe customer found' }),
      };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: result.rows[0].stripe_customer_id,
      return_url: 'smuppy://settings',
    });

    return {
      statusCode: 200,
      headers: fallbackCorsHeaders,
      body: JSON.stringify({
        success: true,
        url: session.url,
      }),
    };
  } finally {
    client.release();
  }
}
