/**
 * Stripe Identity Lambda
 * Handles identity verification for creators
 *
 * Pricing:
 * - Verification fee: $14.90 (100% to Smuppy, minus Stripe fees)
 * - Stripe Identity charges ~$1.50 per verification
 * - Net revenue to Smuppy: ~$13.40 per verification
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey, getStripePublishableKey } from '../../shared/secrets';
import { Pool } from 'pg';

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeInstance;
}

// Verification fee: $14.90 (1490 cents) - 100% goes to Smuppy
const VERIFICATION_FEE_CENTS = 1490;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
  max: 1,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Content-Type': 'application/json',
};

interface IdentityBody {
  action: 'create-session' | 'get-status' | 'get-report' | 'create-payment-intent' | 'confirm-payment';
  returnUrl?: string;
  paymentIntentId?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const stripe = await getStripe();
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    const body: IdentityBody = JSON.parse(event.body || '{}');

    switch (body.action) {
      case 'create-payment-intent':
        // Step 1: Create payment intent for verification fee
        return await createVerificationPaymentIntent(userId);
      case 'confirm-payment':
        // Step 2: Confirm payment and proceed to verification
        return await confirmPaymentAndStartVerification(userId, body.paymentIntentId!, body.returnUrl!);
      case 'create-session':
        // Legacy: Direct session creation (requires prior payment)
        return await createVerificationSession(userId, body.returnUrl!);
      case 'get-status':
        return await getVerificationStatus(userId);
      case 'get-report':
        return await getVerificationReport(userId);
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Identity error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

/**
 * Create a payment intent for the verification fee ($14.90)
 * This must be completed before starting verification
 */
async function createVerificationPaymentIntent(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const client = await pool.connect();
  try {
    // Get user info
    const result = await client.query(
      'SELECT id, email, full_name, stripe_customer_id, is_verified, verification_payment_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const { email, full_name, stripe_customer_id, is_verified, verification_payment_id } = result.rows[0];

    // Check if already verified
    if (is_verified) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User is already verified' }),
      };
    }

    // Check if payment already completed
    if (verification_payment_id) {
      // Check payment status
      const paymentIntent = await stripe.paymentIntents.retrieve(verification_payment_id);
      if (paymentIntent.status === 'succeeded') {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            paymentCompleted: true,
            message: 'Payment already completed, proceed to verification',
          }),
        };
      }

      // If payment pending, return existing intent
      if (paymentIntent.status === 'requires_payment_method' || paymentIntent.status === 'requires_confirmation') {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            success: true,
            paymentIntent: {
              id: paymentIntent.id,
              clientSecret: paymentIntent.client_secret,
              amount: paymentIntent.amount,
            },
            priceFormatted: '$14.90',
          }),
        };
      }
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

    // Create payment intent for verification fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: VERIFICATION_FEE_CENTS,
      currency: 'usd',
      customer: customerId,
      description: 'Smuppy Identity Verification Fee',
      metadata: {
        userId,
        type: 'identity_verification',
        platform: 'smuppy',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Save payment intent ID
    await client.query(
      'UPDATE profiles SET verification_payment_id = $1, updated_at = NOW() WHERE id = $2',
      [paymentIntent.id, userId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          amount: paymentIntent.amount,
        },
        priceFormatted: '$14.90',
        publishableKey: await getStripePublishableKey(),
      }),
    };
  } finally {
    client.release();
  }
}

/**
 * Confirm payment was successful and create verification session
 */
async function confirmPaymentAndStartVerification(
  userId: string,
  paymentIntentId: string,
  returnUrl: string
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const client = await pool.connect();
  try {
    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Payment not completed',
          paymentStatus: paymentIntent.status,
        }),
      };
    }

    // Verify this payment belongs to this user
    if (paymentIntent.metadata.userId !== userId) {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Payment does not belong to this user' }),
      };
    }

    // Update payment status in DB
    await client.query(
      'UPDATE profiles SET verification_payment_status = $1, verification_payment_date = NOW() WHERE id = $2',
      ['paid', userId]
    );

    // Now create the verification session
    return await createVerificationSession(userId, returnUrl);
  } finally {
    client.release();
  }
}

async function createVerificationSession(
  userId: string,
  returnUrl: string
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const client = await pool.connect();
  try {
    // Get user info
    const result = await client.query(
      `SELECT email, full_name, identity_verification_session_id, verification_payment_status
       FROM profiles WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const { email, full_name, identity_verification_session_id, verification_payment_status } = result.rows[0];

    // Check if verification fee was paid
    if (verification_payment_status !== 'paid') {
      return {
        statusCode: 402,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Verification fee not paid',
          message: 'Please pay the $14.90 verification fee first',
          action: 'create-payment-intent',
        }),
      };
    }

    // Check if there's an existing pending session
    if (identity_verification_session_id) {
      try {
        const existingSession = await stripe.identity.verificationSessions.retrieve(
          identity_verification_session_id
        );

        if (existingSession.status === 'requires_input') {
          // Session still valid, return existing URL
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              sessionId: existingSession.id,
              url: existingSession.url,
              status: existingSession.status,
            }),
          };
        }
      } catch {
        // Session expired or invalid, create new one
      }
    }

    // Create new verification session
    const verificationSession = await stripe.identity.verificationSessions.create({
      type: 'document',
      provided_details: {
        email,
      },
      options: {
        document: {
          require_id_number: true,
          require_live_capture: true,
          require_matching_selfie: true,
          allowed_types: ['driving_license', 'passport', 'id_card'],
        },
      },
      metadata: {
        userId,
        platform: 'smuppy',
        purpose: 'creator_verification',
      },
      return_url: returnUrl,
    });

    // Save session ID
    await client.query(
      'UPDATE profiles SET identity_verification_session_id = $1, updated_at = NOW() WHERE id = $2',
      [verificationSession.id, userId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        sessionId: verificationSession.id,
        url: verificationSession.url,
        status: verificationSession.status,
      }),
    };
  } finally {
    client.release();
  }
}

async function getVerificationStatus(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT identity_verification_session_id, is_verified FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const { identity_verification_session_id, is_verified } = result.rows[0];

    if (!identity_verification_session_id) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          hasSession: false,
          isVerified: is_verified || false,
          status: 'not_started',
        }),
      };
    }

    const session = await stripe.identity.verificationSessions.retrieve(
      identity_verification_session_id
    );

    // Update verified status in DB if verification succeeded
    if (session.status === 'verified' && !is_verified) {
      await client.query(
        'UPDATE profiles SET is_verified = true, verified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [userId]
      );
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        hasSession: true,
        sessionId: session.id,
        status: session.status,
        isVerified: session.status === 'verified',
        lastError: session.last_error,
      }),
    };
  } finally {
    client.release();
  }
}

async function getVerificationReport(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT identity_verification_session_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.identity_verification_session_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No verification session found' }),
      };
    }

    const session = await stripe.identity.verificationSessions.retrieve(
      result.rows[0].identity_verification_session_id,
      { expand: ['verified_outputs'] }
    );

    if (session.status !== 'verified') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Verification not completed' }),
      };
    }

    // Return limited info for privacy
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        verified: true,
        verifiedAt: session.created,
        // Only return non-sensitive verified data
        documentType: session.verified_outputs?.id_number_type,
      }),
    };
  } finally {
    client.release();
  }
}
