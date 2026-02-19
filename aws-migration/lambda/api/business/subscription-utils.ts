/**
 * Shared utilities for business subscription handlers.
 * Eliminates boilerplate duplication across cancel, reactivate, my-subscriptions, access-pass.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { getUserFromEvent, resolveProfileId } from '../utils/auth';
import { isValidUUID } from '../utils/security';

interface AuthenticatedContext {
  headers: Record<string, string>;
  profileId: string;
  db: Pool;
  userSub: string;
}

/**
 * Authenticate user, resolve profile, and return context.
 * Returns an error response if auth/profile resolution fails, or the context if successful.
 */
export async function authenticateAndResolveProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult | AuthenticatedContext> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const user = getUserFromEvent(event);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
  }

  const db = await getPool();

  const profileId = await resolveProfileId(db, user.sub);
  if (!profileId) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }

  return { headers, profileId, db, userSub: user.sub };
}

/**
 * Type guard: check if authenticateAndResolveProfile returned an error response.
 */
export function isErrorResponse(result: APIGatewayProxyResult | AuthenticatedContext): result is APIGatewayProxyResult {
  return 'statusCode' in result;
}

/**
 * Validate and extract subscription ID from path parameters.
 * Returns the ID or an error response.
 */
export function validateSubscriptionId(
  event: APIGatewayProxyEvent,
  headers: Record<string, string>
): string | APIGatewayProxyResult {
  const subscriptionId = event.pathParameters?.subscriptionId;
  if (!subscriptionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing subscription ID' }) };
  }
  if (!isValidUUID(subscriptionId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription ID format' }) };
  }
  return subscriptionId;
}

/**
 * Get a subscription by ID and verify ownership.
 * Returns the subscription row or an error response.
 */
export async function getOwnedSubscription(
  db: Pool,
  subscriptionId: string,
  profileId: string,
  headers: Record<string, string>,
  extraColumns?: string
): Promise<APIGatewayProxyResult | Record<string, unknown>> {
  const columns = `id, user_id, stripe_subscription_id, status, cancel_at_period_end${extraColumns ? `, ${extraColumns}` : ''}`;
  const result = await db.query(
    `SELECT ${columns} FROM business_subscriptions WHERE id = $1`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found' }) };
  }

  const subscription = result.rows[0];

  if (subscription.user_id !== profileId) {
    return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You do not own this subscription' }) };
  }

  return subscription;
}
