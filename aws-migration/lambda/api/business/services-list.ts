/**
 * Business Services List
 * GET /businesses/{businessId}/services
 * Public endpoint — returns active services for a business
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('business/services-list');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const businessId = event.pathParameters?.businessId || event.queryStringParameters?.businessId;

    if (!businessId || !UUID_REGEX.test(businessId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Valid businessId is required' }),
      };
    }

    const db = await getPool();
    const result = await db.query(
      `SELECT id, name, description, category, price_cents, duration_minutes,
              max_capacity, is_subscription, subscription_period, trial_days,
              entries_total, image_url, is_active, created_at
       FROM business_services
       WHERE business_id = $1 AND is_active = true
       ORDER BY category, name`,
      [businessId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        services: result.rows.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          priceCents: s.price_cents,
          durationMinutes: s.duration_minutes,
          maxCapacity: s.max_capacity,
          isSubscription: s.is_subscription,
          subscriptionPeriod: s.subscription_period,
          trialDays: s.trial_days,
          entriesTotal: s.entries_total,
          imageUrl: s.image_url,
          isActive: s.is_active,
          createdAt: s.created_at,
        })),
      }),
    };
  } catch (error) {
    log.error('Failed to list business services', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
