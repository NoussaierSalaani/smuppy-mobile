/**
 * My Business Subscriptions
 * GET /businesses/my/subscriptions
 * Returns all business subscriptions for the authenticated user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { authenticateAndResolveProfile, isErrorResponse } from './subscription-utils';

const log = createLogger('business/my-subscriptions');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db } = authResult;

  try {
    // Get all subscriptions for this user with business and plan details
    const subscriptionsResult = await db.query(
      `SELECT
        bs.id, bs.status, bs.current_period_start, bs.current_period_end,
        bs.trial_end, bs.cancel_at_period_end, bs.sessions_used, bs.sessions_limit, bs.created_at,
        bp.id as business_id, bp.full_name as business_name, bp.avatar_url as business_logo,
        COALESCE(bc.name, 'General') as category_name,
        COALESCE(bc.icon, 'business') as category_icon,
        COALESCE(bc.color, '#0EBF8A') as category_color,
        sv.id as plan_id, sv.name as plan_name, sv.price_cents, sv.billing_period as period
      FROM business_subscriptions bs
      JOIN profiles bp ON bs.business_id = bp.id
      LEFT JOIN business_services sv ON bs.service_id = sv.id
      LEFT JOIN business_categories bc ON bp.business_category_id = bc.id
      WHERE bs.user_id = $1
      ORDER BY
        CASE WHEN bs.status = 'active' THEN 0
             WHEN bs.status = 'trial' THEN 1
             WHEN bs.status = 'cancelled' THEN 2
             ELSE 3 END,
        bs.created_at DESC
      LIMIT 50`,
      [profileId]
    );

    const subscriptions = subscriptionsResult.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      business: {
        id: row.business_id,
        name: row.business_name,
        logo_url: row.business_logo,
        category: {
          name: row.category_name,
          icon: row.category_icon,
          color: row.category_color,
        },
      },
      plan: {
        id: row.plan_id,
        name: row.plan_name || 'Subscription',
        price_cents: row.price_cents || 0,
        period: row.period || 'monthly',
      },
      status: row.status,
      current_period_start: row.current_period_start,
      current_period_end: row.current_period_end,
      trial_end: row.trial_end,
      cancel_at_period_end: row.cancel_at_period_end,
      sessions_used: row.sessions_used,
      sessions_limit: row.sessions_limit,
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriptions }) };
  } catch (error) {
    log.error('Failed to get subscriptions', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}
