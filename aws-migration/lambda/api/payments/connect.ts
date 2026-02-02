/**
 * Stripe Connect Lambda
 * Handles creator onboarding to Stripe Connect for revenue share
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool } from '../../shared/db';

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  }
  return stripeInstance;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://smuppy.com',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
  'Content-Type': 'application/json',
};

interface ConnectBody {
  action: 'create-account' | 'create-link' | 'get-status' | 'get-dashboard-link' | 'get-balance';
  returnUrl?: string;
  refreshUrl?: string;
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

    const body: ConnectBody = JSON.parse(event.body || '{}');

    // Resolve cognito_sub → profile ID
    const pool = await getPool();
    const profileLookup = await pool.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    switch (body.action) {
      case 'create-account':
        return await createConnectAccount(profileId);
      case 'create-link':
        return await createAccountLink(profileId, body.returnUrl!, body.refreshUrl!);
      case 'get-status':
        return await getAccountStatus(profileId);
      case 'get-dashboard-link':
        return await getDashboardLink(profileId);
      case 'get-balance':
        return await getBalance(profileId);
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Connect error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function createConnectAccount(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Check if user already has a Connect account
    const result = await client.query(
      'SELECT stripe_account_id, email, full_name FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    const { stripe_account_id, email, full_name } = result.rows[0];

    if (stripe_account_id) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          accountId: stripe_account_id,
          message: 'Account already exists',
        }),
      };
    }

    // Create Express Connect account (easier onboarding for creators)
    const account = await stripe.accounts.create({
      type: 'express',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: {
        userId,
        platform: 'smuppy',
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'weekly',
            weekly_anchor: 'monday',
          },
        },
      },
    });

    // Save account ID
    await client.query(
      'UPDATE profiles SET stripe_account_id = $1, updated_at = NOW() WHERE id = $2',
      [account.id, userId]
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        accountId: account.id,
      }),
    };
  } finally {
    client.release();
  }
}

async function createAccountLink(
  userId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No Connect account found. Create one first.' }),
      };
    }

    const accountLink = await stripe.accountLinks.create({
      account: result.rows[0].stripe_account_id,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
      }),
    };
  } finally {
    client.release();
  }
}

async function getAccountStatus(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          hasAccount: false,
          status: 'not_created',
        }),
      };
    }

    const account = await stripe.accounts.retrieve(result.rows[0].stripe_account_id);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        hasAccount: true,
        status: account.charges_enabled ? 'active' : 'pending',
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        requirements: account.requirements,
        capabilities: account.capabilities,
      }),
    };
  } finally {
    client.release();
  }
}

async function getDashboardLink(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No Connect account found' }),
      };
    }

    const loginLink = await stripe.accounts.createLoginLink(
      result.rows[0].stripe_account_id
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        url: loginLink.url,
      }),
    };
  } finally {
    client.release();
  }
}

async function getBalance(userId: string): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT stripe_account_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.stripe_account_id) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No Connect account found' }),
      };
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: result.rows[0].stripe_account_id,
    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        balance: {
          available: balance.available,
          pending: balance.pending,
        },
      }),
    };
  } finally {
    client.release();
  }
}
