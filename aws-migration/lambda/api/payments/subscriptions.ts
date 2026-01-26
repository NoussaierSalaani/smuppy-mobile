/**
 * Stripe Subscriptions Lambda
 * Handles monthly subscriptions to creators
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { Pool } from 'pg';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,DELETE',
  'Content-Type': 'application/json',
};

interface SubscriptionBody {
  action: 'create' | 'cancel' | 'list' | 'get-prices';
  creatorId?: string;
  priceId?: string;
  subscriptionId?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body: SubscriptionBody = JSON.parse(event.body || '{}');

    switch (body.action) {
      case 'create':
        return await createSubscription(userId, body.creatorId!, body.priceId!);
      case 'cancel':
        return await cancelSubscription(userId, body.subscriptionId!);
      case 'list':
        return await listSubscriptions(userId);
      case 'get-prices':
        return await getCreatorPrices(body.creatorId!);
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Subscription error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function createSubscription(
  subscriberId: string,
  creatorId: string,
  priceId: string
): Promise<APIGatewayProxyResult> {
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
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Subscriber not found' }),
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
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Creator has not set up payments' }),
      };
    }

    const connectedAccountId = creatorResult.rows[0].stripe_account_id;

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

    // Record in database
    await client.query(
      `INSERT INTO subscriptions (
        id, subscriber_id, creator_id, stripe_subscription_id,
        stripe_price_id, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        `sub_${Date.now()}`,
        subscriberId,
        creatorId,
        subscription.id,
        priceId,
        subscription.status,
      ]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
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
  const client = await pool.connect();
  try {
    // Verify ownership
    const result = await client.query(
      'SELECT stripe_subscription_id FROM subscriptions WHERE id = $1 AND subscriber_id = $2',
      [subscriptionId, userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Subscription not found' }),
      };
    }

    const stripeSubId = result.rows[0].stripe_subscription_id;

    // Cancel at period end (user keeps access until end of billing period)
    const subscription = await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });

    await client.query(
      'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
      ['canceling', subscriptionId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
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
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT s.*, p.username, p.full_name, p.avatar_url
       FROM subscriptions s
       JOIN profiles p ON s.creator_id = p.id
       WHERE s.subscriber_id = $1 AND s.status IN ('active', 'canceling')
       ORDER BY s.created_at DESC`,
      [userId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        subscriptions: result.rows,
      }),
    };
  } finally {
    client.release();
  }
}

async function getCreatorPrices(creatorId: string): Promise<APIGatewayProxyResult> {
  const client = await pool.connect();
  try {
    // Get creator's subscription tiers
    const result = await client.query(
      `SELECT * FROM subscription_tiers
       WHERE creator_id = $1 AND is_active = true
       ORDER BY price_cents ASC`,
      [creatorId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        tiers: result.rows,
      }),
    };
  } finally {
    client.release();
  }
}
