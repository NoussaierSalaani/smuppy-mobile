/**
 * Stripe Connect Lambda
 * Handles creator onboarding to Stripe Connect for revenue share
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';
import { getStripeKey } from '../../shared/secrets';
import { getPool } from '../../shared/db';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('payments/connect');

let stripeInstance: Stripe | null = null;
async function getStripe(): Promise<Stripe> {
  if (!stripeInstance) {
    const key = await getStripeKey();
    stripeInstance = new Stripe(key, { apiVersion: '2025-12-15.clover' });
  }
  return stripeInstance;
}

// SECURITY: Allowed URL patterns for Stripe redirects
const ALLOWED_URL_PATTERN = /^(smuppy:\/\/|https:\/\/(www\.)?smuppy\.com\/)/;

interface ConnectBody {
  action: 'create-account' | 'create-link' | 'get-status' | 'get-dashboard-link' | 'get-balance' | 'admin-set-account';
  returnUrl?: string;
  refreshUrl?: string;
  targetProfileId?: string;
  stripeAccountId?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const corsHeaders = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    await getStripe();
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 10 connect actions per minute
    const { allowed } = await checkRateLimit({ prefix: 'payment-connect', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!allowed) {
      return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) };
    }

    const body: ConnectBody = JSON.parse(event.body || '{}');

    // Resolve cognito_sub → profile ID
    const pool = await getPool();
    const profileLookup = await pool.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    switch (body.action) {
      case 'create-account':
        return await createConnectAccount(profileId, corsHeaders);
      case 'create-link':
        // SECURITY: Validate returnUrl and refreshUrl against allowlist
        if (!body.returnUrl || !ALLOWED_URL_PATTERN.test(body.returnUrl)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Invalid return URL' }) };
        }
        if (!body.refreshUrl || !ALLOWED_URL_PATTERN.test(body.refreshUrl)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Invalid refresh URL' }) };
        }
        return await createAccountLink(profileId, body.returnUrl, body.refreshUrl, corsHeaders);
      case 'get-status':
        return await getAccountStatus(profileId, corsHeaders);
      case 'get-dashboard-link':
        return await getDashboardLink(profileId, corsHeaders);
      case 'get-balance':
        return await getBalance(profileId, corsHeaders);
      case 'admin-set-account': {
        // SECURITY: Require admin key verification, not just environment check
        const { getAdminKey } = await import('../../shared/secrets');
        const adminKey = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
        if (!adminKey) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Admin key required' }) };
        }
        const expectedKey = await getAdminKey();
        const { timingSafeEqual } = await import('crypto');
        const a = Buffer.from(adminKey);
        const b = Buffer.from(expectedKey);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Invalid admin key' }) };
        }
        if (!body.targetProfileId || !body.stripeAccountId) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Missing targetProfileId or stripeAccountId' }) };
        }
        // Verify the Stripe account exists and is an Express account
        const stripeForAdmin = await getStripe();
        let adminAccount: Stripe.Account;
        try {
          adminAccount = await stripeForAdmin.accounts.retrieve(body.stripeAccountId);
        } catch {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Stripe account not found' }) };
        }
        if (adminAccount.type !== 'express') {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Only Express accounts are supported' }) };
        }
        // Verify account is not already assigned to another user
        const adminPool = await getPool();
        const existingAssignment = await adminPool.query(
          'SELECT id FROM profiles WHERE stripe_account_id = $1 AND id != $2',
          [body.stripeAccountId, body.targetProfileId]
        );
        if (existingAssignment.rows.length > 0) {
          return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Stripe account already assigned to another user' }) };
        }
        await adminPool.query('UPDATE profiles SET stripe_account_id = $1, channel_price_cents = COALESCE(channel_price_cents, 999), updated_at = NOW() WHERE id = $2', [body.stripeAccountId, body.targetProfileId]);
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, targetProfileId: body.targetProfileId, stripeAccountId: body.stripeAccountId }) };
      }
      default:
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Invalid action' }),
        };
    }
  } catch (error) {
    log.error('Connect error', { error: error instanceof Error ? error.message : 'Unknown error' });
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
};

async function createConnectAccount(userId: string, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
  const stripe = await getStripe();
  const pool = await getPool();
  const client = await pool.connect();
  try {
    // Check if user already has a Connect account
    const result = await client.query(
      'SELECT stripe_account_id, email, cognito_sub FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      };
    }

    const { stripe_account_id, cognito_sub } = result.rows[0];
    let email = result.rows[0].email as string | null;

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

    // If email missing in profiles, fetch from Cognito and sync
    if (!email && cognito_sub) {
      const cognitoClient = new CognitoIdentityProviderClient({});
      const sanitizedSub = cognito_sub.replace(/["\\]/g, '');
      const cognitoResult = await cognitoClient.send(new ListUsersCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Filter: `sub = "${sanitizedSub}"`,
        Limit: 1,
      }));
      email = cognitoResult.Users?.[0]?.Attributes?.find(a => a.Name === 'email')?.Value || null;
      if (email) {
        await client.query('UPDATE profiles SET email = $1 WHERE id = $2', [email, userId]);
      }
    }

    if (!email) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'No email found for this account' }),
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
  refreshUrl: string,
  corsHeaders: Record<string, string>
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
        body: JSON.stringify({ success: false, message: 'No Connect account found. Create one first.' }),
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

async function getAccountStatus(userId: string, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
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

async function getDashboardLink(userId: string, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
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
        body: JSON.stringify({ success: false, message: 'No Connect account found' }),
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

async function getBalance(userId: string, corsHeaders: Record<string, string>): Promise<APIGatewayProxyResult> {
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
        body: JSON.stringify({ success: false, message: 'No Connect account found' }),
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
