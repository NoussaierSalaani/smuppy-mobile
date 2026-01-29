/**
 * Create Payment Intent Lambda Handler
 * Creates a Stripe PaymentIntent for session bookings and monthly packs
 *
 * Revenue Split for Sessions & Packs:
 * - Creator: 80%
 * - Smuppy: 20%
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('payments/create-intent');

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

// Revenue split constants
const PLATFORM_FEE_PERCENT = 20; // Smuppy takes 20%, Creator gets 80%
const APPLE_FEE_PERCENT = 30; // Apple's in-app purchase fee
const GOOGLE_FEE_PERCENT = 30; // Google's in-app purchase fee (15% for < $1M, but we use 30% to be safe)

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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    // Get authenticated user
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Parse request body
    const body: CreateIntentRequest = event.body ? JSON.parse(event.body) : {};
    const { creatorId, amount, currency = 'usd', description, sessionId, packId, type = 'session', source = 'web' } = body;

    // Validate required fields
    if (!creatorId || !amount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'creatorId and amount are required' }),
      };
    }

    // Validate amount (minimum $1.00 = 100 cents)
    if (amount < 100) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Minimum amount is $1.00' }),
      };
    }

    const db = await getPool();

    // Get buyer's profile
    const buyerResult = await db.query(
      'SELECT id, email, full_name FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (buyerResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const buyer = buyerResult.rows[0];

    // Get creator's profile and Stripe account (if connected)
    const creatorResult = await db.query(
      'SELECT id, full_name, stripe_account_id FROM profiles WHERE id = $1',
      [creatorId]
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
    let customerId: string;

    const customerResult = await db.query(
      'SELECT stripe_customer_id FROM profiles WHERE id = $1',
      [buyer.id]
    );

    if (customerResult.rows[0]?.stripe_customer_id) {
      customerId = customerResult.rows[0].stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: buyer.email,
        name: buyer.full_name,
        metadata: {
          smuppy_user_id: buyer.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await db.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, buyer.id]
      );
    }

    // Calculate amounts considering app store fees
    // For in-app purchases, Apple/Google takes 30% first
    // Then Smuppy takes 20% of the remaining amount, Creator gets 80%
    const netAmount = calculateNetAmount(amount, source as PurchaseSource);
    const platformFee = Math.round(netAmount * (PLATFORM_FEE_PERCENT / 100));
    const creatorAmount = netAmount - platformFee;

    // For web: Using Stripe directly. Amount goes to Smuppy, with transfer to creator's Connect account
    // For in-app: Only create a record, actual payment handled by Apple/Google

    // Build description based on type
    const defaultDescription = type === 'pack'
      ? `Monthly pack with ${creator.full_name}`
      : `Session with ${creator.full_name}`;

    // For in-app purchases, we don't create a Stripe PaymentIntent
    // Instead, validate with Apple/Google and record the transaction
    if (source === 'ios' || source === 'android') {
      // For in-app purchases, just return the calculated amounts for client validation
      // The actual payment verification will happen via a separate endpoint
      // that verifies the receipt from Apple/Google
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          source,
          requiresInAppPurchase: true,
          priceBreakdown: {
            grossAmount: amount,
            appStoreFee: amount - netAmount,
            netAmount,
            platformFee,
            creatorAmount,
          },
          // Product ID for in-app purchase configuration
          productId: `smuppy_${type}_${creatorId.substring(0, 8)}`,
        }),
      };
    }

    // Create PaymentIntent for web purchases via Stripe
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount,
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
        platform: 'smuppy',
        gross_amount: amount.toString(),
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

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    log.info('Payment intent created', {
      paymentIntentId: paymentIntent.id,
      buyerId: buyer.id,
      creatorId,
      amount,
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
        amount,
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
          grossAmount: amount,
          netAmount,
          platformFee,
          creatorAmount,
        },
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      }),
    };
  } catch (error) {
    log.error('Error creating payment intent', error);

    // Handle Stripe-specific errors — don't leak internal details
    if (error instanceof Stripe.errors.StripeError) {
      log.error('Stripe error', { code: error.code, message: error.message });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Payment processing failed. Please try again.',
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
