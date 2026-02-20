/**
 * Business Subscription Management
 * Combined handler for:
 * - POST /businesses/subscriptions/{subscriptionId}/cancel - Cancel subscription
 * - POST /businesses/subscriptions/{subscriptionId}/reactivate - Reactivate subscription
 * - GET /businesses/subscriptions/my - List user's subscriptions
 * - GET /businesses/subscriptions/{subscriptionId}/access-pass - Get access pass
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { createBusinessHandler } from '../utils/create-business-handler';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';
import { Logger } from '../utils/logger';
import {
  validateSubscriptionId,
  getOwnedSubscription,
  performCancelSubscription,
  performReactivateSubscription,
  listUserSubscriptions,
  getAccessPass,
} from './subscription-utils';

// ── Shared helpers ───────────────────────────────────────────────────

async function resolveProfile(
  db: Pool,
  userSub: string,
  headers: Record<string, string>,
): Promise<string | APIGatewayProxyResult> {
  const profileId = await resolveProfileId(db, userSub);
  if (!profileId) {
    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
  }
  return profileId;
}

function isEarlyExit(value: string | APIGatewayProxyResult): value is APIGatewayProxyResult {
  return typeof value !== 'string';
}

// ── Sub-handlers ─────────────────────────────────────────────────────

async function handleCancel(
  event: APIGatewayProxyEvent,
  db: Pool,
  user: { id: string; sub: string },
  headers: Record<string, string>,
  log: Logger,
): Promise<APIGatewayProxyResult> {
  const rateLimitResponse = await requireRateLimit(
    { prefix: 'biz-sub-cancel', identifier: user.sub, maxRequests: 5, windowSeconds: 60 },
    headers,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const subIdOrError = validateSubscriptionId(event, headers);
  if (isEarlyExit(subIdOrError)) return subIdOrError;
  const subscriptionId = subIdOrError;

  const profileIdOrError = await resolveProfile(db, user.sub, headers);
  if (isEarlyExit(profileIdOrError)) return profileIdOrError;
  const profileId = profileIdOrError;

  const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers);
  if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;

  return performCancelSubscription(db, subResult, subscriptionId, profileId, headers, log);
}

async function handleReactivate(
  event: APIGatewayProxyEvent,
  db: Pool,
  user: { id: string; sub: string },
  headers: Record<string, string>,
  log: Logger,
): Promise<APIGatewayProxyResult> {
  const rateLimitResponse = await requireRateLimit(
    { prefix: 'biz-sub-reactivate', identifier: user.sub, maxRequests: 5, windowSeconds: 60 },
    headers,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const subIdOrError = validateSubscriptionId(event, headers);
  if (isEarlyExit(subIdOrError)) return subIdOrError;
  const subscriptionId = subIdOrError;

  const profileIdOrError = await resolveProfile(db, user.sub, headers);
  if (isEarlyExit(profileIdOrError)) return profileIdOrError;
  const profileId = profileIdOrError;

  const subResult = await getOwnedSubscription(db, subscriptionId, profileId, headers, ['current_period_end']);
  if ('statusCode' in subResult) return subResult as APIGatewayProxyResult;

  return performReactivateSubscription(db, subResult, subscriptionId, profileId, headers, log);
}

async function handleListSubscriptions(
  db: Pool,
  userSub: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const profileIdOrError = await resolveProfile(db, userSub, headers);
  if (isEarlyExit(profileIdOrError)) return profileIdOrError;

  return listUserSubscriptions(db, profileIdOrError, headers);
}

async function handleGetAccessPass(
  event: APIGatewayProxyEvent,
  db: Pool,
  userSub: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyResult> {
  const subIdOrError = validateSubscriptionId(event, headers);
  if (isEarlyExit(subIdOrError)) return subIdOrError;
  const subscriptionId = subIdOrError;

  const profileIdOrError = await resolveProfile(db, userSub, headers);
  if (isEarlyExit(profileIdOrError)) return profileIdOrError;

  return getAccessPass(db, subscriptionId, profileIdOrError, headers);
}

// ── Main handler via factory ─────────────────────────────────────────

const { handler } = createBusinessHandler({
  loggerName: 'business/subscription-manage',
  rateLimitPrefix: 'biz-sub-manage',
  rateLimitMax: 60,
  skipRateLimit: true,
  onAction: async ({ headers, user, db, event, log }) => {
    const path = event.path;
    const method = event.httpMethod;

    // Route based on path and method
    if (path.endsWith('/subscriptions/my') && method === 'GET') {
      return handleListSubscriptions(db, user.sub, headers);
    } else if (path.includes('/access-pass') && method === 'GET') {
      return handleGetAccessPass(event, db, user.sub, headers);
    } else if (path.includes('/reactivate') && method === 'POST') {
      return handleReactivate(event, db, user, headers, log);
    } else if (path.includes('/cancel') && method === 'POST') {
      return handleCancel(event, db, user, headers, log);
    }

    return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Not found' }) };
  },
});

export { handler };
