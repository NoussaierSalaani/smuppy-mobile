/**
 * Business Checkout Lambda Handler
 * Creates Stripe Checkout Sessions for business services (drop_in, pass, subscription)
 * Unified payment flow: one endpoint, WebBrowser checkout, 15% commission
 */

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool } from '../../shared/db';
import type { Pool } from 'pg';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { createHeaders } from '../utils/cors';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { safeStripeCall, stripeUserMessage } from '../../shared/stripe-resilience';

const log = createLogger('payments/business-checkout');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

const WEB_DOMAIN = process.env.WEB_DOMAIN || 'https://smuppy.com';

// 15% platform commission on all business transactions
const PLATFORM_FEE_PERCENT = 0.15;

interface BusinessCheckoutRequest {
  businessId: string;
  serviceId: string;
  date?: string;   // for drop_in bookings
  slotId?: string;  // for drop_in bookings (optional)
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

  try {
    const user = await getUserFromEvent(event);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 5 requests per minute per user
    const rateCheck = await checkRateLimit({ prefix: 'biz-checkout', identifier: user.id, maxRequests: 5, failOpen: false });
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests, please try again later' }),
      };
    }

    const db = await getPool();
    return await createBusinessCheckout(db, user, event, headers);
  } catch (error) {
    log.error('Business checkout error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

async function createBusinessCheckout(
  db: Pool,
  user: { id: string },
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
) {
  const stripe = await getStripe();
  const body = JSON.parse(event.body || '{}') as BusinessCheckoutRequest;
  const { businessId, serviceId, date, slotId } = body;

  // Validate required fields
  if (!businessId || !isValidUUID(businessId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid businessId is required' }),
    };
  }

  if (!serviceId || !isValidUUID(serviceId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Valid serviceId is required' }),
    };
  }

  if (slotId && !isValidUUID(slotId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Invalid slotId format' }),
    };
  }

  // Validate date format if provided
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Date must be in YYYY-MM-DD format' }),
    };
  }

  // Get user profile
  const userResult = await db.query(
    'SELECT id, email, full_name, username, stripe_customer_id FROM profiles WHERE id = $1',
    [user.id]
  );

  if (userResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, message: 'User not found' }),
    };
  }

  const userProfile = userResult.rows[0];

  // Get service details + business stripe account
  const serviceResult = await db.query(
    `SELECT bs.id, bs.name, bs.description, bs.category, bs.price_cents,
            bs.duration_minutes, bs.is_subscription, bs.subscription_period,
            bs.trial_days, bs.is_active, bs.max_capacity,
            p.id as business_profile_id, p.full_name as business_name,
            p.stripe_account_id
     FROM business_services bs
     JOIN profiles p ON bs.business_id = p.id
     WHERE bs.id = $1 AND bs.business_id = $2`,
    [serviceId, businessId]
  );

  if (serviceResult.rows.length === 0) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, message: 'Service not found' }),
    };
  }

  const service = serviceResult.rows[0];

  if (!service.is_active) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'This service is not currently available' }),
    };
  }

  if (!service.stripe_account_id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, message: 'Business has not set up payments yet' }),
    };
  }

  // Determine service type based on category
  const serviceType = getServiceType(service.category, service.is_subscription);

  // Get or create Stripe customer
  let customerId = userProfile.stripe_customer_id;
  if (!customerId) {
    const customer = await safeStripeCall(
      () => stripe.customers.create({
        email: userProfile.email,
        name: userProfile.full_name || userProfile.username,
        metadata: { userId: user.id, platform: 'smuppy' },
      }),
      'customers.create', log
    );
    customerId = customer.id;

    await db.query(
      'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [customerId, user.id]
    );
  }

  const priceInCents = service.price_cents;
  const platformFee = Math.round(priceInCents * PLATFORM_FEE_PERCENT);

  const baseSuccessUrl = `${WEB_DOMAIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const baseCancelUrl = `${WEB_DOMAIN}/checkout/cancel`;

  let sessionConfig: Stripe.Checkout.SessionCreateParams;

  if (serviceType === 'subscription') {
    // Recurring subscription — need a Stripe Price
    const period = service.subscription_period || 'monthly';
    const interval = period === 'weekly' ? 'week' : period === 'yearly' ? 'year' : 'month';

    const product = await safeStripeCall(
      () => stripe.products.create({
        name: service.name,
        description: service.description || `${service.business_name} - ${period} subscription`,
        metadata: { businessId, serviceId, type: 'business_subscription' },
      }),
      'products.create', log
    );

    const price = await safeStripeCall(
      () => stripe.prices.create({
        product: product.id,
        unit_amount: priceInCents,
        currency: 'eur',
        recurring: { interval },
      }),
      'prices.create', log
    );

    sessionConfig = {
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.id, quantity: 1 }],
      subscription_data: {
        application_fee_percent: PLATFORM_FEE_PERCENT * 100,
        transfer_data: {
          destination: service.stripe_account_id,
        },
        trial_period_days: service.trial_days || undefined,
        metadata: {
          subscriptionType: 'business',
          businessId,
          serviceId,
          userId: user.id,
          period,
        },
      },
      metadata: {
        productType: 'business_subscription',
        businessId,
        serviceId,
        userId: user.id,
        type: serviceType,
        period,
      },
      success_url: `${baseSuccessUrl}&type=business_subscription&businessId=${businessId}`,
      cancel_url: `${baseCancelUrl}?type=business_subscription&businessId=${businessId}`,
    };
  } else {
    // One-time payment (drop_in or pass)
    const description = serviceType === 'pass'
      ? `${service.name} — Multi-entry pass`
      : `${service.name} — ${service.duration_minutes || ''} min`;

    sessionConfig = {
      mode: 'payment',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: service.name,
            description,
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: service.stripe_account_id,
        },
        metadata: {
          type: serviceType,
          businessId,
          serviceId,
          buyerId: user.id,
          source: 'web',
          ...(date && { date }),
          ...(slotId && { slotId }),
        },
      },
      metadata: {
        productType: `business_${serviceType}`,
        businessId,
        serviceId,
        userId: user.id,
        type: serviceType,
        ...(date && { date }),
        ...(slotId && { slotId }),
      },
      success_url: `${baseSuccessUrl}&type=business_${serviceType}&businessId=${businessId}`,
      cancel_url: `${baseCancelUrl}?type=business_${serviceType}&businessId=${businessId}`,
    };
  }

  // Common config
  sessionConfig.allow_promotion_codes = true;
  sessionConfig.billing_address_collection = 'auto';
  sessionConfig.expires_at = Math.floor(Date.now() / 1000) + (30 * 60); // 30 minutes

  const checkoutSession = await safeStripeCall(
    () => stripe.checkout.sessions.create(sessionConfig),
    'checkout.sessions.create', log
  );

  log.info('Created business checkout session', {
    sessionId: checkoutSession.id,
    serviceType,
    businessId: businessId.substring(0, 8) + '***',
    userId: user.id.substring(0, 8) + '***',
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
 * Map service category to simplified type
 */
function getServiceType(category: string, isSubscription: boolean): 'drop_in' | 'pass' | 'subscription' {
  if (isSubscription || category === 'membership') return 'subscription';
  if (category === 'pack') return 'pass';
  return 'drop_in';
}
