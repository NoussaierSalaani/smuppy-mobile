/**
 * Stripe Payment Methods Lambda Handler
 * Manages saved payment methods for users:
 * - GET /payments/methods - List saved payment methods
 * - POST /payments/methods - Add a new payment method
 * - DELETE /payments/methods/{methodId} - Remove a payment method
 * - PUT /payments/methods/{methodId}/default - Set as default
 * - POST /payments/methods/setup-intent - Create setup intent for adding cards
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
import { PLATFORM_NAME } from '../utils/constants';

const log = createLogger('payments/payment-methods');

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

    // Rate limit: 20 requests per minute per user
    const rateLimitResponse = await requireRateLimit({ prefix: 'payment-methods', identifier: user.sub, maxRequests: 20, failOpen: false }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const db = await getPool();
    const pathParts = event.path.split('/').filter(Boolean);
    const methodId = pathParts.length > 2 ? pathParts[2] : null;
    const action = pathParts.length > 3 ? pathParts[3] : null;

    // POST /payments/methods/setup-intent - Create setup intent
    if (event.httpMethod === 'POST' && methodId === 'setup-intent') {
      return await createSetupIntent(db, user, headers);
    }

    // GET /payments/methods - List payment methods
    if (event.httpMethod === 'GET' && !methodId) {
      return await listPaymentMethods(db, user, headers);
    }

    // POST /payments/methods - Attach a payment method
    if (event.httpMethod === 'POST' && !methodId) {
      return await attachPaymentMethod(db, user, event, headers);
    }

    // DELETE /payments/methods/{methodId} - Detach a payment method
    if (event.httpMethod === 'DELETE' && methodId) {
      return await detachPaymentMethod(db, user, methodId, headers);
    }

    // PUT /payments/methods/{methodId}/default - Set as default
    if (event.httpMethod === 'PUT' && methodId && action === 'default') {
      return await setDefaultPaymentMethod(db, user, methodId, headers);
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  } catch (error) {
    log.error('Payment methods error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

/**
 * Get or create Stripe customer for user
 */
async function getOrCreateStripeCustomer(db: Pool, cognitoSub: string): Promise<string> {
  const stripe = await getStripeClient();
  // SECURITY: Query by cognito_sub (getUserFromEvent returns cognito_sub, not profiles.id)
  const result = await db.query(
    'SELECT id, stripe_customer_id, email, full_name, username FROM profiles WHERE cognito_sub = $1',
    [cognitoSub]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const profile = result.rows[0];

  if (profile.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: profile.email,
    name: profile.full_name || profile.username,
    metadata: {
      userId: profile.id,
      platform: PLATFORM_NAME,
    },
  });

  // Save customer ID
  await db.query(
    'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, profile.id]
  );

  log.info('Created Stripe customer', { userId: String(profile.id).substring(0, 8) + '***', customerId: customer.id });

  return customer.id;
}

/**
 * Create a SetupIntent for adding payment methods
 */
async function createSetupIntent(db: Pool, user: { sub: string }, headers: Record<string, string>) {
  const stripe = await getStripeClient();
  const customerId = await getOrCreateStripeCustomer(db, user.sub);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    metadata: {
      userId: user.sub,
      platform: PLATFORM_NAME,
    },
  });

  log.info('Created setup intent', { userId: user.sub.substring(0, 8) + '***', setupIntentId: setupIntent.id });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      setupIntent: {
        clientSecret: setupIntent.client_secret,
        id: setupIntent.id,
      },
    }),
  };
}

/**
 * List all payment methods for a user
 */
async function listPaymentMethods(db: Pool, user: { sub: string }, headers: Record<string, string>) {
  const stripe = await getStripeClient();
  const customerId = await getOrCreateStripeCustomer(db, user.sub);

  // Get payment methods from Stripe
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  // Get default payment method
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const defaultMethodId = customer.invoice_settings?.default_payment_method;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      paymentMethods: paymentMethods.data.map((pm) => ({
        id: pm.id,
        type: pm.type,
        isDefault: pm.id === defaultMethodId,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
          funding: pm.card.funding,
          country: pm.card.country,
        } : null,
        billingDetails: {
          name: pm.billing_details.name,
          email: pm.billing_details.email,
        },
        created: new Date(pm.created * 1000).toISOString(),
      })),
      defaultPaymentMethodId: defaultMethodId,
    }),
  };
}

/**
 * Attach a payment method to a customer
 */
async function attachPaymentMethod(
  db: Pool,
  user: { sub: string },
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
) {
  const stripe = await getStripeClient();
  const body = JSON.parse(event.body || '{}');
  const { paymentMethodId, setAsDefault } = body as {
    paymentMethodId: string;
    setAsDefault?: boolean;
  };

  if (!paymentMethodId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'paymentMethodId is required',
      }),
    };
  }

  const customerId = await getOrCreateStripeCustomer(db, user.sub);

  // Attach payment method to customer
  const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });

  // Set as default if requested
  if (setAsDefault) {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  log.info('Attached payment method', {
    userId: user.sub.substring(0, 8) + '***',
    paymentMethodId,
    setAsDefault,
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      paymentMethod: {
        id: paymentMethod.id,
        type: paymentMethod.type,
        isDefault: !!setAsDefault,
        card: paymentMethod.card ? {
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          expMonth: paymentMethod.card.exp_month,
          expYear: paymentMethod.card.exp_year,
        } : null,
      },
    }),
  };
}

/**
 * Detach a payment method from a customer
 */
async function detachPaymentMethod(
  db: Pool,
  user: { sub: string },
  paymentMethodId: string,
  headers: Record<string, string>
) {
  const stripe = await getStripeClient();
  const customerId = await getOrCreateStripeCustomer(db, user.sub);

  // Verify the payment method belongs to this customer
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

  if (paymentMethod.customer !== customerId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Payment method does not belong to this user',
      }),
    };
  }

  // Detach the payment method
  await stripe.paymentMethods.detach(paymentMethodId);

  log.info('Detached payment method', { userId: user.sub.substring(0, 8) + '***', paymentMethodId });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'Payment method removed',
    }),
  };
}

/**
 * Set a payment method as default
 */
async function setDefaultPaymentMethod(
  db: Pool,
  user: { sub: string },
  paymentMethodId: string,
  headers: Record<string, string>
) {
  const stripe = await getStripeClient();
  const customerId = await getOrCreateStripeCustomer(db, user.sub);

  // Verify the payment method belongs to this customer
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

  if (paymentMethod.customer !== customerId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Payment method does not belong to this user',
      }),
    };
  }

  // Set as default
  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  log.info('Set default payment method', { userId: user.sub.substring(0, 8) + '***', paymentMethodId });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'Default payment method updated',
    }),
  };
}
