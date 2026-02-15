/**
 * Delete Account Lambda Handler
 * POST /profiles/me/delete
 *
 * Soft-deletes the user's account with a 30-day grace period:
 * 1. Cancels active Stripe subscriptions
 * 2. Anonymizes PII (username, name, avatar, bio)
 * 3. Marks profile as deleted (is_deleted = true, deleted_at = NOW())
 * 4. Disables Cognito user (prevents login during grace period)
 * 5. Removes push tokens (stops notifications)
 *
 * After 30 days, a scheduled job hard-deletes the profile (CASCADE handles related data)
 * and removes S3 media + Cognito user permanently.
 *
 * Required by: Apple App Store Guidelines 5.1.1(v), GDPR Art. 17
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getPool } from '../../shared/db';
import { getStripeClient } from '../../shared/stripe-client';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('profiles-delete');

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    // Strict rate limit: 2 per hour (prevent abuse)
    const { allowed } = await checkRateLimit({
      prefix: 'account-delete',
      identifier: cognitoSub,
      windowSeconds: 3600,
      maxRequests: 2,
    });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const db = await getPool();

    // Get profile with Stripe info
    const profileResult = await db.query(
      `SELECT id, username, stripe_customer_id, stripe_account_id, cognito_sub, is_deleted
       FROM profiles WHERE cognito_sub = $1`,
      [cognitoSub]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

    const profile = profileResult.rows[0];

    if (profile.is_deleted) {
      return { statusCode: 409, headers, body: JSON.stringify({ message: 'Account is already scheduled for deletion' }) };
    }

    const profileId = profile.id;

    // Step 1: Cancel active Stripe subscriptions (best-effort)
    if (profile.stripe_customer_id) {
      try {
        const stripe = await getStripeClient();

        // Cancel all active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'active',
          limit: 100,
        });

        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id, {
            prorate: true,
          });
          log.warn('Cancelled subscription for account deletion', {
            profileId: profileId.substring(0, 8) + '***',
            subscriptionId: sub.id.substring(0, 8) + '***',
          });
        }
      } catch (stripeErr: unknown) {
        // Log but don't block deletion — Stripe cleanup can be retried
        log.error('Failed to cancel Stripe subscriptions during account deletion', stripeErr);
      }
    }

    // Step 2: Anonymize PII + mark as deleted in a single transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Generate anonymous identifier for uniqueness
      const anonId = profileId.substring(0, 8);

      // Anonymize profile PII
      await client.query(
        `UPDATE profiles SET
           username = $2,
           full_name = 'Deleted User',
           display_name = 'Deleted User',
           bio = NULL,
           avatar_url = NULL,
           cover_url = NULL,
           email = NULL,
           phone_number = NULL,
           location = NULL,
           website = NULL,
           is_deleted = TRUE,
           deleted_at = NOW(),
           updated_at = NOW()
         WHERE id = $1`,
        [profileId, `deleted_${anonId}`]
      );

      // Remove push tokens (stop all notifications)
      await client.query(
        'DELETE FROM push_tokens WHERE user_id = $1',
        [profileId]
      );

      // Remove WebSocket connections
      await client.query(
        'DELETE FROM websocket_connections WHERE user_id = $1',
        [profileId]
      );

      // Update subscription statuses in DB
      await client.query(
        `UPDATE platform_subscriptions SET status = 'canceled', updated_at = NOW()
         WHERE user_id = $1 AND status = 'active'`,
        [profileId]
      );
      await client.query(
        `UPDATE channel_subscriptions SET status = 'canceled', updated_at = NOW()
         WHERE fan_id = $1 AND status = 'active'`,
        [profileId]
      );

      await client.query('COMMIT');
    } catch (txErr: unknown) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // Step 3: Disable Cognito user (prevents login during grace period)
    if (USER_POOL_ID && profile.cognito_sub) {
      try {
        await cognitoClient.send(new AdminDisableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: profile.cognito_sub,
        }));
      } catch (cognitoErr: unknown) {
        // Log but don't block — account is already marked deleted in DB
        log.error('Failed to disable Cognito user during account deletion', cognitoErr);
      }
    }

    log.warn('Account deletion initiated', {
      profileId: profileId.substring(0, 8) + '***',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Your account has been scheduled for deletion. You have 30 days to reactivate by logging in.',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting account', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
