/**
 * Send Tip Lambda Handler
 * Handles tip payments from fans to creators
 *
 * Contexts:
 * - profile: Tip on creator profile
 * - live: Tip during live stream
 * - peak: Tip on a Peak (challenges)
 * - battle: Tip during live battle
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface SendTipRequest {
  receiverId: string;
  amount: number; // in cents
  currency?: string;
  contextType: 'profile' | 'live' | 'peak' | 'battle';
  contextId?: string;
  message?: string;
  isAnonymous?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    // Get authenticated user
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const body: SendTipRequest = JSON.parse(event.body || '{}');
    const {
      receiverId,
      amount,
      currency = 'EUR',
      contextType,
      contextId,
      message,
      isAnonymous = false,
    } = body;

    // Validation
    if (!receiverId || !amount || amount < 100) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Invalid tip amount. Minimum is 1.00',
        }),
      });
    }

    if (!['profile', 'live', 'peak', 'battle'].includes(contextType)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Invalid context type',
        }),
      });
    }

    // Can't tip yourself
    if (receiverId === userId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'You cannot tip yourself',
        }),
      });
    }

    // Get sender info
    const senderResult = await client.query(
      `SELECT id, username, display_name, stripe_customer_id
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (senderResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Sender not found' }),
      });
    }

    const sender = senderResult.rows[0];

    // Get receiver info (must be a verified creator)
    const receiverResult = await client.query(
      `SELECT p.id, p.username, p.display_name, p.stripe_account_id,
              p.account_type, p.is_verified
       FROM profiles p
       WHERE p.id = $1`,
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Creator not found' }),
      });
    }

    const receiver = receiverResult.rows[0];

    // Check if receiver can accept tips
    if (receiver.account_type !== 'creator' && receiver.account_type !== 'business') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'This user cannot receive tips',
        }),
      });
    }

    // For Peak tips, verify the creator owns the peak and tips are enabled
    if (contextType === 'peak' && contextId) {
      const peakCheck = await client.query(
        `SELECT pc.tips_enabled, p.user_id
         FROM peak_challenges pc
         JOIN peaks p ON pc.peak_id = p.id
         WHERE pc.peak_id = $1`,
        [contextId]
      );

      if (peakCheck.rows.length === 0 || !peakCheck.rows[0].tips_enabled) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: 'Tips are not enabled for this Peak',
          }),
        });
      }
    }

    // Calculate fees (80% creator, 20% platform)
    const amountInCents = amount;
    const amountDecimal = amount / 100;
    const platformFee = Math.round(amount * 0.20) / 100; // 20%
    const creatorAmount = amountDecimal - platformFee;

    // Get or create Stripe customer
    let customerId = sender.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { smuppy_user_id: userId },
      });
      customerId = customer.id;

      await client.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      );
    }

    // Create tip record
    const tipResult = await client.query(
      `INSERT INTO tips (
        sender_id, receiver_id, amount, currency, amount_in_cents,
        platform_fee, creator_amount, context_type, context_id,
        message, is_anonymous, payment_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING id`,
      [
        userId,
        receiverId,
        amountDecimal,
        currency.toUpperCase(),
        amountInCents,
        platformFee,
        creatorAmount,
        contextType,
        contextId || null,
        message || null,
        isAnonymous,
      ]
    );

    const tipId = tipResult.rows[0].id;

    // Create PaymentIntent
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: currency.toLowerCase(),
      customer: customerId,
      metadata: {
        type: 'tip',
        tip_id: tipId,
        sender_id: userId,
        receiver_id: receiverId,
        context_type: contextType,
        context_id: contextId || '',
      },
      description: `Tip to @${receiver.username}`,
    };

    // If creator has Stripe Connect, set up transfer
    if (receiver.stripe_account_id) {
      const creatorAmountCents = Math.round(creatorAmount * 100);
      paymentIntentParams.transfer_data = {
        destination: receiver.stripe_account_id,
        amount: creatorAmountCents,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Update tip with payment intent
    await client.query(
      `UPDATE tips SET stripe_payment_intent_id = $1 WHERE id = $2`,
      [paymentIntent.id, tipId]
    );

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        tipId,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: amountDecimal,
        currency: currency.toUpperCase(),
        platformFee,
        creatorAmount,
        receiver: {
          id: receiver.id,
          username: receiver.username,
          displayName: receiver.display_name,
        },
      }),
    });
  } catch (error: any) {
    console.error('Send tip error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Failed to process tip',
      }),
    });
  } finally {
    client.release();
  }
};
