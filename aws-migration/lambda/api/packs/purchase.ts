/**
 * Purchase Pack Handler
 * POST /packs/purchase - Purchase a session pack
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';
import { createLogger } from '../utils/logger';
import Stripe from 'stripe';
import { getStripeClient } from '../../shared/stripe-client';

const log = createLogger('packs-purchase');

// Platform fee percentage (Smuppy takes 20%, Creator gets 80%)
const PLATFORM_FEE_PERCENT = 20;

interface PurchaseBody {
  packId: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  const headers = createHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: headers,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const rateLimitResponse = await requireRateLimit({ prefix: 'packs-purchase', identifier: userId, windowSeconds: 60, maxRequests: 10 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const stripe = await getStripeClient();
    const body: PurchaseBody = JSON.parse(event.body || '{}');
    const { packId } = body;

    if (!packId || !isValidUUID(packId)) {
      return {
        statusCode: 400,
        headers: headers,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      };
    }

    const pool = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(pool, userId);
    if (!profileId) {
      return {
        statusCode: 404,
        headers: headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }

    // SECURITY: Derive creatorId from pack (never trust client-provided creatorId)
    const packResult = await pool.query(
      `SELECT sp.*, p.id as creator_id, p.stripe_account_id as creator_stripe_id, p.full_name as creator_name
       FROM session_packs sp
       JOIN profiles p ON sp.creator_id = p.id
       WHERE sp.id = $1 AND sp.is_active = true`,
      [packId]
    );

    if (packResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: headers,
        body: JSON.stringify({ success: false, message: 'Pack not found' }),
      };
    }

    const pack = packResult.rows[0];

    // Get user's Stripe customer ID
    const userResult = await pool.query(
      `SELECT stripe_customer_id, email FROM profiles WHERE id = $1`,
      [profileId]
    );

    let customerId = userResult.rows[0]?.stripe_customer_id;

    // Create customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userResult.rows[0]?.email,
        metadata: { userId: profileId },
      });
      customerId = customer.id;

      await pool.query(
        `UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, profileId]
      );
    }

    // Calculate amounts (80% to creator, 20% platform fee)
    const totalAmount = Math.round(Number.parseFloat(pack.price) * 100); // cents
    const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));

    // Create payment intent with transfer to creator
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: totalAmount,
      currency: 'eur',
      customer: customerId,
      metadata: {
        type: 'session_pack',
        packId,
        creatorId: pack.creator_id,
        userId: profileId,
        packName: pack.name,
      },
      description: `Pack: ${pack.name} - ${pack.sessions_included} sessions`,
    };

    // Add transfer to creator if they have Stripe connected
    if (pack.creator_stripe_id) {
      paymentIntentParams.transfer_data = {
        destination: pack.creator_stripe_id,
        amount: totalAmount - platformFee,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Store pending purchase
    await pool.query(
      `INSERT INTO pending_pack_purchases (user_id, pack_id, creator_id, payment_intent_id, amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [profileId, packId, pack.creator_id, paymentIntent.id, pack.price]
    );

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: totalAmount,
        },
        pack: {
          id: pack.id,
          name: pack.name,
          sessionsIncluded: pack.sessions_included,
          sessionDuration: pack.session_duration,
          validityDays: pack.validity_days,
          price: Number.parseFloat(pack.price),
        },
      }),
    };
  } catch (error) {
    log.error('Purchase pack error', error);
    return {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({ success: false, message: 'Failed to process purchase' }),
    };
  }
};
