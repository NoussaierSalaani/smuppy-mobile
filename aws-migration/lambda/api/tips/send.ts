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

import Stripe from 'stripe';
import { withAuthHandler } from '../utils/with-auth-handler';
import { isValidUUID, sanitizeInput } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateText } from '../utils/text-moderation';
import { getStripeClient } from '../../shared/stripe-client';
import { safeStripeCall } from '../../shared/stripe-resilience';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN, MAX_TIP_AMOUNT_CENTS, PLATFORM_FEE_PERCENT, MIN_PAYMENT_CENTS } from '../utils/constants';

interface SendTipRequest {
  receiverId: string;
  amount: number; // in cents
  currency?: string;
  contextType: 'profile' | 'live' | 'peak' | 'battle';
  contextId?: string;
  message?: string;
  isAnonymous?: boolean;
}

// SECURITY: Whitelist of allowed currencies
const ALLOWED_CURRENCIES = ['eur', 'usd'];

export const handler = withAuthHandler('tips-send', async (event, { headers, log, cognitoSub, profileId, db }) => {
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const stripe = await getStripeClient();

    // Account status check (suspended/banned users cannot send tips)
    const accountCheck = await requireActiveAccount(cognitoSub, {});
    if (isAccountError(accountCheck)) {
      return { statusCode: accountCheck.statusCode, headers, body: accountCheck.body };
    }

    // Rate limit check (distributed via DynamoDB — works across Lambda instances)
    const rateLimitResponse = await requireRateLimit({
      prefix: 'tips-send',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    let body: SendTipRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }
    const {
      receiverId,
      amount,
      currency = 'EUR',
      contextType,
      contextId,
      message,
      isAnonymous = false,
    } = body;

    // SECURITY: Validate currency against whitelist
    if (!ALLOWED_CURRENCIES.includes(currency.toLowerCase())) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: `Invalid currency. Allowed: ${ALLOWED_CURRENCIES.join(', ')}` }),
      };
    }

    // Validation — ensure amount is a finite positive number
    if (!receiverId || typeof amount !== 'number' || !Number.isFinite(amount) || amount < MIN_PAYMENT_CENTS || amount > MAX_TIP_AMOUNT_CENTS) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: `Invalid tip amount. Min 1.00, max ${MAX_TIP_AMOUNT_CENTS / 100}.00`,
        }),
      };
    }

    if (!isValidUUID(receiverId) || (contextId && !isValidUUID(contextId))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      };
    }

    if (!['profile', 'live', 'peak', 'battle'].includes(contextType)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid context type',
        }),
      };
    }

    // Sanitize and moderate the optional message (keyword filter + Comprehend toxicity)
    const sanitizedMessage = message ? sanitizeInput(message, 500) : null;
    if (sanitizedMessage) {
      const modResult = await moderateText(sanitizedMessage, headers, log, 'tip message');
      if (modResult.blocked) return { statusCode: 400, headers, body: modResult.blockResponse!.body };
    }

    // Can't tip yourself
    if (receiverId === profileId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'You cannot tip yourself',
        }),
      };
    }

    // Get sender + receiver info in parallel (independent queries on same transaction)
    const [senderResult, receiverResult] = await Promise.all([
      client.query(
        `SELECT id, username, display_name, stripe_customer_id
         FROM profiles WHERE id = $1`,
        [profileId]
      ),
      client.query(
        `SELECT p.id, p.username, p.display_name, p.stripe_account_id,
                p.account_type, p.is_verified
         FROM profiles p
         WHERE p.id = $1`,
        [receiverId]
      ),
    ]);

    if (senderResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Sender not found' }),
      };
    }

    const sender = senderResult.rows[0];

    if (receiverResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Creator not found' }),
      };
    }

    const receiver = receiverResult.rows[0];

    // Check if receiver can accept tips — only pro_creator accounts
    if (receiver.account_type !== 'pro_creator') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'This user cannot receive tips',
        }),
      };
    }

    // For Peak tips, verify the creator owns the peak and tips are enabled
    if (contextType === 'peak' && contextId) {
      const peakCheck = await client.query(
        `SELECT pc.tips_enabled, p.user_id
         FROM peak_challenges pc
         JOIN peaks p ON pc.peak_id = p.id
         WHERE pc.peak_id = $1
         LIMIT 1`,
        [contextId]
      );

      if (peakCheck.rows.length === 0 || !peakCheck.rows[0].tips_enabled) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Tips are not enabled for this Peak',
          }),
        };
      }

      // SECURITY: Verify the peak belongs to the receiver (prevent tip misdirection)
      if (peakCheck.rows[0].user_id !== receiverId) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Peak does not belong to this creator',
          }),
        };
      }
    }

    // Calculate fees (80% creator, 20% platform) — all math in cents first
    const amountInCents = amount;
    const platformFeeCents = Math.round(amountInCents * PLATFORM_FEE_PERCENT / 100);
    const creatorAmountCents = amountInCents - platformFeeCents;
    const amountDecimal = amountInCents / 100;
    const platformFee = platformFeeCents / 100;
    const creatorAmount = creatorAmountCents / 100;

    // Get or create Stripe customer
    let customerId = sender.stripe_customer_id;
    if (!customerId) {
      const customer = await safeStripeCall(
        () => stripe.customers.create({ metadata: { smuppy_user_id: profileId } }),
        'customers.create',
        log
      );
      customerId = customer.id;

      await client.query(
        'UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, profileId]
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
        profileId,
        receiverId,
        amountDecimal,
        currency.toUpperCase(),
        amountInCents,
        platformFee,
        creatorAmount,
        contextType,
        contextId || null,
        sanitizedMessage,
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
        sender_id: profileId,
        receiver_id: receiverId,
        context_type: contextType,
        context_id: contextId || '',
      },
      description: `Tip to @${receiver.username}`,
    };

    // If creator has Stripe Connect, set up transfer
    if (receiver.stripe_account_id) {
      try {
        // Verify the connected account exists under the current Stripe key
        await safeStripeCall(() => stripe.accounts.retrieve(receiver.stripe_account_id), 'accounts.retrieve', log);
        paymentIntentParams.transfer_data = {
          destination: receiver.stripe_account_id,
          amount: creatorAmountCents,
        };
      } catch (_accountError) {
        // Connected account not found under current key — skip transfer, log warning
        log.error('Stripe connected account not reachable, skipping transfer_data', {
          accountId: receiver.stripe_account_id,
          receiverId,
        });
      }
    }

    // SECURITY: Idempotency key prevents duplicate PaymentIntents from double-clicks/retries
    const idempotencyKey = `tip_${profileId}_${receiverId}_${amountInCents}_${tipId}`;
    const paymentIntent = await safeStripeCall(
      () => stripe.paymentIntents.create(paymentIntentParams, { idempotencyKey }),
      'paymentIntents.create',
      log
    );

    // Update tip with payment intent
    await client.query(
      `UPDATE tips SET stripe_payment_intent_id = $1 WHERE id = $2`,
      [paymentIntent.id, tipId]
    );

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers,
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
    };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Send tip error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Failed to process tip',
      }),
    };
  } finally {
    client.release();
  }
});
