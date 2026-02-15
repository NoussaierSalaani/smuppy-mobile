/**
 * Stripe Subscriptions Lambda
 * Handles monthly subscriptions to creators
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';
import { createHeaders, getSecureHeaders } from '../utils/cors';

// Security headers for inner functions that don't receive the event
const secureHeaders = getSecureHeaders();
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('payments-subscriptions');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

interface SubscriptionBody {
  action: 'create' | 'cancel' | 'list' | 'get-prices';
  creatorId?: string;
  priceId?: string;
  subscriptionId?: string;
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

    // Rate limit: 10 subscription operations per minute
    const { allowed } = await checkRateLimit({
      prefix: 'subscriptions',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
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
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    switch (body.action) {
      case 'create': {
        if (!body.creatorId || !body.priceId || !isValidUUID(body.creatorId)) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'creatorId and priceId are required' }) };
        }
        return await createSubscription(profileId, body.creatorId, body.priceId);
      }
      case 'cancel':
        if (!body.subscriptionId) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'subscriptionId is required' }) };
        }
        return await cancelSubscription(profileId, body.subscriptionId);
      case 'list':
        return await listSubscriptions(profileId);
      case 'get-prices':
        if (!body.creatorId || !isValidUUID(body.creatorId)) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid creatorId is required' }) };
        }
        return await getCreatorPrices(body.creatorId);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
  } catch (error: unknown) {
    log.error('Subscription error', error);
    return {
      statusCode: 500,
      headers: secureHeaders,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

async function createSubscription(
  subscriberId: string,
  creatorId: string,
  priceId: string
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Get subscriber's Stripe customer ID
    const subscriberResult = await client.query(
      'SELECT stripe_customer_id, email FROM profiles WHERE id = $1',
      [subscriberId]
    );

    if (subscriberResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: secureHeaders,
        body: JSON.stringify({ success: false, message: 'Subscriber not found' }),
      };
    }

    let stripeCustomerId = subscriberResult.rows[0].stripe_customer_id;
    const email = subscriberResult.rows[0].email;

    // Create Stripe customer if not exists
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId: subscriberId },
      });
      stripeCustomerId = customer.id;
      await client.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomerId, subscriberId]
      );
    }

    // Get creator's Stripe Connect account
    const creatorResult = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [creatorId]
    );

    if (!creatorResult.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers: secureHeaders,
        body: JSON.stringify({ success: false, message: 'Creator has not set up payments' }),
      };
    }

    const connectedAccountId = creatorResult.rows[0].stripe_account_id;

    // SECURITY: Verify priceId belongs to the creator's connected account
    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price || !price.active) {
        return { statusCode: 400, headers: secureHeaders, body: JSON.stringify({ success: false, message: 'Invalid or inactive price' }) };
      }
    } catch {
      return { statusCode: 400, headers: secureHeaders, body: JSON.stringify({ success: false, message: 'Invalid price ID' }) };
    }

    // Create subscription with revenue share (platform takes 15% of subscriptions)
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      application_fee_percent: 15, // Smuppy takes 15%
      transfer_data: {
        destination: connectedAccountId,
      },
      metadata: {
        subscriberId,
        creatorId,
        type: 'creator_subscription',
      },
    });

    // Record in database (use channel_subscriptions table - same as webhook)
    const priceAmount = subscription.items.data[0]?.price?.unit_amount || 0;
    await client.query(
      `INSERT INTO channel_subscriptions (
        fan_id, creator_id, stripe_subscription_id, price_cents, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        subscriberId,
        creatorId,
        subscription.id,
        priceAmount,
        subscription.status,
      ]
    );

    return {
      statusCode: 200,
      headers: secureHeaders,
      body: JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: (subscription as unknown as { current_period_end: number }).current_period_end,
        },
      }),
    };
  } finally {
    client.release();
  }
}

async function cancelSubscription(
  userId: string,
  subscriptionId: string
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify ownership
    const result = await client.query(
      'SELECT stripe_subscription_id FROM channel_subscriptions WHERE id = $1 AND fan_id = $2',
      [subscriptionId, userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: secureHeaders,
        body: JSON.stringify({ success: false, message: 'Subscription not found' }),
      };
    }

    const stripeSubId = result.rows[0].stripe_subscription_id;

    // Cancel at period end (user keeps access until end of billing period)
    const subscription = await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });

    await client.query(
      'UPDATE channel_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
      ['canceling', subscriptionId]
    );

    return {
      statusCode: 200,
      headers: secureHeaders,
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

async function listSubscriptions(userId: string): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT s.id, s.fan_id as subscriber_id, s.creator_id, s.stripe_subscription_id,
              s.price_cents as stripe_price_id, s.status, s.created_at,
              p.username, p.full_name, p.avatar_url
       FROM channel_subscriptions s
       JOIN profiles p ON s.creator_id = p.id
       WHERE s.fan_id = $1 AND s.status IN ('active', 'canceling')
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [userId]
    );

    return {
      statusCode: 200,
      headers: secureHeaders,
      body: JSON.stringify({
        success: true,
        subscriptions: result.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          subscriberId: row.subscriber_id,
          creatorId: row.creator_id,
          status: row.status,
          createdAt: row.created_at,
          creator: {
            username: row.username,
            fullName: row.full_name,
            avatarUrl: row.avatar_url,
          },
        })),
      }),
    };
  } finally {
    client.release();
  }
}

async function getCreatorPrices(creatorId: string): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Get creator's subscription tiers
    const result = await client.query(
      `SELECT id, creator_id, name, description, price_cents, currency, stripe_price_id, is_active, created_at
       FROM subscription_tiers
       WHERE creator_id = $1 AND is_active = true
       ORDER BY price_cents ASC`,
      [creatorId]
    );

    return {
      statusCode: 200,
      headers: secureHeaders,
      body: JSON.stringify({
        success: true,
        tiers: result.rows,
      }),
    };
  } finally {
    client.release();
  }
}
