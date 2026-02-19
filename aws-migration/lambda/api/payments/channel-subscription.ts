/**
 * Creator Channel Subscription Lambda
 * Handles fan subscriptions to creator streaming channels
 * Revenue share is tiered based on creator's fan count
 *
 * Revenue Share Tiers:
 * - 1-999 fans: Creator 60%, Smuppy 40%
 * - 1K-9,999 fans: Creator 65%, Smuppy 35%
 * - 10K-99,999 fans: Creator 70%, Smuppy 30%
 * - 100K-999,999 fans: Creator 75%, Smuppy 25%
 * - 1M+ fans: Creator 80%, Smuppy 20%
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import { checkRateLimit } from '../utils/rate-limit';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { safeStripeCall } from '../../shared/stripe-resilience';

const log = createLogger('payments-channel-subscription');

// CORS headers now dynamically created via createHeaders(event)

/**
 * Calculate Smuppy's fee percentage based on creator's fan count
 * Returns the platform fee as a percentage (e.g., 40 for 40%)
 */
function calculatePlatformFeePercent(fanCount: number): number {
  if (fanCount >= 1000000) {
    return 20; // Creator gets 80%, Smuppy 20%
  } else if (fanCount >= 100000) {
    return 25; // Creator gets 75%, Smuppy 25%
  } else if (fanCount >= 10000) {
    return 30; // Creator gets 70%, Smuppy 30%
  } else if (fanCount >= 1000) {
    return 35; // Creator gets 65%, Smuppy 35%
  } else {
    return 40; // Creator gets 60%, Smuppy 40%
  }
}

/**
 * Get the tier name for display purposes
 */
function getTierName(fanCount: number): string {
  if (fanCount >= 1000000) return 'Diamond';
  if (fanCount >= 100000) return 'Platinum';
  if (fanCount >= 10000) return 'Gold';
  if (fanCount >= 1000) return 'Silver';
  return 'Bronze';
}

interface ChannelSubBody {
  action: 'subscribe' | 'cancel' | 'list-subscriptions' | 'get-channel-info' | 'set-price' | 'get-subscribers';
  creatorId?: string;
  pricePerMonth?: number; // In cents
  subscriptionId?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    await getStripeClient();
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 5 requests per minute per user
    const rateCheck = await checkRateLimit({ prefix: 'channel-sub', identifier: userId, maxRequests: 5, failOpen: false });
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many requests, please try again later' }),
      };
    }

    const body: ChannelSubBody = JSON.parse(event.body || '{}');

    // Resolve cognito_sub → profile ID (userId from JWT is cognito_sub, NOT profile.id)
    const pool = await getPool();
    const profileLookup = await pool.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileLookup.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }
    const profileId = profileLookup.rows[0].id as string;

    // SECURITY: Validate UUID format on creatorId and subscriptionId before use
    if (body.creatorId && !isValidUUID(body.creatorId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid creatorId format' }) };
    }
    if (body.subscriptionId && !isValidUUID(body.subscriptionId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscriptionId format' }) };
    }

    switch (body.action) {
      case 'subscribe':
        if (!body.creatorId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'creatorId is required' }) };
        return await subscribeToChannel(profileId, body.creatorId, headers);
      case 'cancel':
        if (!body.subscriptionId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'subscriptionId is required' }) };
        return await cancelChannelSubscription(profileId, body.subscriptionId, headers);
      case 'list-subscriptions':
        return await listMySubscriptions(profileId, headers);
      case 'get-channel-info':
        if (!body.creatorId) return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'creatorId is required' }) };
        return await getChannelInfo(body.creatorId, headers);
      case 'set-price':
        return await setChannelPrice(profileId, body.pricePerMonth!, headers);
      case 'get-subscribers':
        return await getMySubscribers(profileId, headers);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
  } catch (error: unknown) {
    log.error('Channel subscription error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

async function subscribeToChannel(
  fanUserId: string,
  creatorId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Check if already subscribed
    const existingSub = await client.query(
      `SELECT id FROM channel_subscriptions
       WHERE fan_id = $1 AND creator_id = $2 AND status = 'active'`,
      [fanUserId, creatorId]
    );

    if (existingSub.rows.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Already subscribed to this channel' }),
      };
    }

    // Get creator info (use cached fan_count column instead of COUNT subquery)
    const creatorResult = await client.query(
      `SELECT p.id, p.stripe_account_id, p.channel_price_cents, p.username, p.full_name, p.fan_count
       FROM profiles p
       WHERE p.id = $1 AND p.account_type = 'pro_creator'`,
      [creatorId]
    );

    if (creatorResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator not found or not a Pro account' }),
      };
    }

    const creator = creatorResult.rows[0];

    if (!creator.stripe_account_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator has not set up payments yet' }),
      };
    }

    if (!creator.channel_price_cents || creator.channel_price_cents <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator has not set a channel subscription price' }),
      };
    }

    // Get fan (subscriber) info
    const fanResult = await client.query(
      'SELECT stripe_customer_id, email, full_name, cognito_sub FROM profiles WHERE id = $1',
      [fanUserId]
    );

    if (fanResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const fan = fanResult.rows[0];

    // If email missing in profiles, fetch from Cognito and sync
    if (!fan.email && fan.cognito_sub) {
      try {
        const cognitoClient = new CognitoIdentityProviderClient({});
        const sanitizedSub = fan.cognito_sub.replaceAll(/["\\]/g, '');
        const cognitoResult = await cognitoClient.send(new ListUsersCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Filter: `sub = "${sanitizedSub}"`,
          Limit: 1,
        }));
        fan.email = cognitoResult.Users?.[0]?.Attributes?.find(a => a.Name === 'email')?.Value || null;
        if (fan.email) {
          await client.query('UPDATE profiles SET email = $1 WHERE id = $2', [fan.email, fanUserId]);
        }
      } catch (cognitoErr) {
        log.warn('Failed to fetch email from Cognito, continuing with null email', { error: String(cognitoErr) });
      }
    }

    // Create or get Stripe customer
    let customerId = fan.stripe_customer_id;
    if (!customerId) {
      const customer = await safeStripeCall(
        () => stripe.customers.create({
          email: fan.email,
          name: fan.full_name,
          metadata: { userId: fanUserId, platform: 'smuppy' },
        }),
        'customers.create',
        log
      );
      customerId = customer.id;
      await client.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, fanUserId]
      );
    }

    // Calculate platform fee based on creator's fan count
    const fanCount = Number.parseInt(creator.fan_count) || 0;
    const platformFeePercent = calculatePlatformFeePercent(fanCount);

    // Get or create the price for this creator's channel
    const priceId = await getOrCreateChannelPrice(
      creatorId,
      creator.username || creator.full_name,
      creator.channel_price_cents
    );

    // Create checkout session with Connect
    const session = await safeStripeCall(
      () => stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `smuppy://channel-subscription-success?creator=${creatorId}`,
        cancel_url: 'smuppy://channel-subscription-cancel',
        subscription_data: {
          application_fee_percent: platformFeePercent,
          transfer_data: {
            destination: creator.stripe_account_id,
          },
          metadata: {
            fanId: fanUserId,
            creatorId,
            subscriptionType: 'channel',
            platformFeePercent: platformFeePercent.toString(),
            creatorFanCount: fanCount.toString(),
            tier: getTierName(fanCount),
          },
        },
        metadata: {
          fanId: fanUserId,
          creatorId,
          subscriptionType: 'channel',
        },
      }),
      'checkout.sessions.create',
      log
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        pricePerMonth: creator.channel_price_cents,
        platformFeePercent,
        creatorSharePercent: 100 - platformFeePercent,
        tier: getTierName(fanCount),
      }),
    };
  } finally {
    client.release();
  }
}

async function getOrCreateChannelPrice(
  creatorId: string,
  creatorName: string,
  priceCents: number
): Promise<string> {
  const stripe = await getStripeClient();
  const productName = `${creatorName}'s Channel`;

  // Search for existing product for this creator
  // SECURITY: Sanitize creatorId to prevent Stripe search query injection
  const sanitizedCreatorId = creatorId.replaceAll(/['\\]/g, '');
  const products = await safeStripeCall(
    () => stripe.products.search({
      query: `metadata['creatorId']:'${sanitizedCreatorId}' AND active:'true'`,
    }),
    'products.search',
    log
  );

  let productId: string;

  if (products.data.length > 0) {
    productId = products.data[0].id;
  } else {
    // Create product
    const product = await safeStripeCall(
      () => stripe.products.create({
        name: productName,
        description: `Monthly subscription to ${creatorName}'s streaming channel on Smuppy`,
        metadata: { creatorId, type: 'channel_subscription' },
      }),
      'products.create',
      log
    );
    productId = product.id;
  }

  // Search for existing price with this amount
  const prices = await safeStripeCall(
    () => stripe.prices.list({
      product: productId,
      active: true,
      type: 'recurring',
    }),
    'prices.list',
    log
  );

  const existingPrice = prices.data.find(p => p.unit_amount === priceCents);
  if (existingPrice) {
    return existingPrice.id;
  }

  // Deactivate old prices if amount changed (parallel for performance)
  if (prices.data.length > 0) {
    await Promise.all(
      prices.data.map(oldPrice =>
        safeStripeCall(() => stripe.prices.update(oldPrice.id, { active: false }), 'prices.update', log)
      )
    );
  }

  // Create new price
  const price = await safeStripeCall(
    () => stripe.prices.create({
      product: productId,
      unit_amount: priceCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { creatorId },
    }),
    'prices.create',
    log
  );

  return price.id;
}

async function cancelChannelSubscription(
  userId: string,
  subscriptionId: string,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripeClient();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify ownership
    const result = await client.query(
      `SELECT stripe_subscription_id FROM channel_subscriptions
       WHERE id = $1 AND fan_id = $2 AND status = 'active'`,
      [subscriptionId, userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Subscription not found' }),
      };
    }

    const stripeSubId = result.rows[0].stripe_subscription_id;

    // Cancel at period end
    const subscription = await safeStripeCall(
      () => stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: true,
      }),
      'subscriptions.update',
      log
    );

    await client.query(
      `UPDATE channel_subscriptions
       SET status = 'canceling', cancel_at = to_timestamp($1), updated_at = NOW()
       WHERE id = $2`,
      [subscription.cancel_at, subscriptionId]
    );

    return {
      statusCode: 200,
      headers,
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

async function listMySubscriptions(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cs.id, cs.creator_id, cs.status, cs.price_cents,
              cs.current_period_start, cs.current_period_end, cs.cancel_at,
              p.username, p.full_name, p.avatar_url, p.is_verified
       FROM channel_subscriptions cs
       JOIN profiles p ON cs.creator_id = p.id
       WHERE cs.fan_id = $1 AND cs.status IN ('active', 'canceling')
       ORDER BY cs.created_at DESC
       LIMIT 50`,
      [userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        subscriptions: result.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          creatorId: row.creator_id,
          creator: {
            username: row.username,
            fullName: row.full_name,
            avatarUrl: row.avatar_url,
            isVerified: row.is_verified,
          },
          status: row.status,
          pricePerMonth: row.price_cents,
          currentPeriodStart: row.current_period_start,
          currentPeriodEnd: row.current_period_end,
          cancelAt: row.cancel_at,
        })),
      }),
    };
  } finally {
    client.release();
  }
}

async function getChannelInfo(creatorId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT p.id, p.username, p.full_name, p.avatar_url, p.is_verified,
              p.channel_price_cents, p.channel_description, p.fan_count,
              (SELECT COUNT(*) FROM channel_subscriptions WHERE creator_id = p.id AND status = 'active') as subscriber_count
       FROM profiles p
       WHERE p.id = $1`,
      [creatorId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator not found' }),
      };
    }

    const creator = result.rows[0];
    const fanCount = Number.parseInt(creator.fan_count) || 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        channel: {
          creatorId: creator.id,
          username: creator.username,
          fullName: creator.full_name,
          avatarUrl: creator.avatar_url,
          isVerified: creator.is_verified,
          pricePerMonth: creator.channel_price_cents,
          description: creator.channel_description,
          fanCount,
          subscriberCount: Number.parseInt(creator.subscriber_count) || 0,
          tier: getTierName(fanCount),
        },
      }),
    };
  } finally {
    client.release();
  }
}

async function setChannelPrice(
  userId: string,
  pricePerMonth: number,
  headers: Record<string, string>
): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Verify user is a pro account
    const result = await client.query(
      `SELECT account_type FROM profiles WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    if (result.rows[0].account_type !== 'pro_creator') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Only Pro Creators can set channel prices' }),
      };
    }

    // Minimum price $1, maximum $999
    if (pricePerMonth < 100 || pricePerMonth > 99900) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Price must be between $1 and $999 per month' }),
      };
    }

    await client.query(
      'UPDATE profiles SET channel_price_cents = $1, updated_at = NOW() WHERE id = $2',
      [pricePerMonth, userId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        pricePerMonth,
      }),
    };
  } finally {
    client.release();
  }
}

async function getMySubscribers(userId: string, headers: Record<string, string>): Promise<APIGatewayProxyResult> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT cs.id, cs.fan_id, cs.status, cs.price_cents, cs.created_at,
              p.username, p.full_name, p.avatar_url
       FROM channel_subscriptions cs
       JOIN profiles p ON cs.fan_id = p.id
       WHERE cs.creator_id = $1 AND cs.status IN ('active', 'canceling')
       ORDER BY cs.created_at DESC
       LIMIT 50`,
      [userId]
    );

    // Get total earnings
    const earningsResult = await client.query(
      `SELECT
         COALESCE(SUM(amount_cents), 0) as total_gross,
         COALESCE(SUM(creator_amount_cents), 0) as total_net
       FROM channel_subscription_payments
       WHERE creator_id = $1 AND status = 'succeeded'`,
      [userId]
    );

    const earnings = earningsResult.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        subscriberCount: result.rows.length,
        subscribers: result.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          fanId: row.fan_id,
          fan: {
            username: row.username,
            fullName: row.full_name,
            avatarUrl: row.avatar_url,
          },
          status: row.status,
          pricePerMonth: row.price_cents,
          subscribedAt: row.created_at,
        })),
        earnings: {
          totalGross: Number.parseInt(earnings.total_gross) || 0,
          totalNet: Number.parseInt(earnings.total_net) || 0,
        },
      }),
    };
  } finally {
    client.release();
  }
}
