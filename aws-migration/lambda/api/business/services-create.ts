/**
 * Business Services Create
 * POST /businesses/my/services
 * Owner only — creates a new service
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('business/services-create');

const VALID_CATEGORIES = ['drop_in', 'pack', 'membership'];
const VALID_PERIODS = ['weekly', 'monthly', 'yearly'];
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const rateCheck = await checkRateLimit({ prefix: 'biz-svc-create', identifier: user.id, maxRequests: 10 });
    if (!rateCheck.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const {
      name, description, category, price_cents, duration_minutes,
      is_subscription, subscription_period, trial_days, max_capacity,
      entries_total, is_active,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Name is required' }) };
    }
    if (name.length > MAX_NAME_LENGTH) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: `Name must be under ${MAX_NAME_LENGTH} characters` }) };
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid category is required (drop_in, pack, membership)' }) };
    }
    if (typeof price_cents !== 'number' || price_cents < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid price is required' }) };
    }
    if (description && typeof description === 'string' && description.length > MAX_DESCRIPTION_LENGTH) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: `Description must be under ${MAX_DESCRIPTION_LENGTH} characters` }) };
    }
    if (is_subscription && subscription_period && !VALID_PERIODS.includes(subscription_period)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid subscription period is required' }) };
    }

    // Sanitize text inputs
    const sanitizedName = name.trim().replace(/<[^>]*>/g, '').substring(0, MAX_NAME_LENGTH);
    const sanitizedDesc = description
      ? String(description).trim().replace(/<[^>]*>/g, '').substring(0, MAX_DESCRIPTION_LENGTH)
      : null;

    // Verify user is a business account
    const db = await getPool();
    const profileResult = await db.query(
      "SELECT id, account_type FROM profiles WHERE id = $1",
      [user.id]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const profile = profileResult.rows[0];
    if (profile.account_type !== 'business' && profile.account_type !== 'pro_business') {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'Business account required' }) };
    }

    const result = await db.query(
      `INSERT INTO business_services (
        business_id, name, description, category, price_cents, duration_minutes,
        is_subscription, subscription_period, trial_days, max_capacity,
        entries_total, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, description, category, price_cents, duration_minutes,
                is_subscription, subscription_period, trial_days, max_capacity,
                entries_total, is_active, created_at`,
      [
        user.id,
        sanitizedName,
        sanitizedDesc,
        category,
        Math.round(price_cents),
        duration_minutes || null,
        is_subscription || false,
        subscription_period || null,
        trial_days || 0,
        max_capacity || null,
        entries_total || null,
        is_active !== false,
      ]
    );

    const s = result.rows[0];
    log.info('Business service created', { serviceId: s.id, businessId: user.id.substring(0, 8) + '***' });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        service: {
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          priceCents: s.price_cents,
          durationMinutes: s.duration_minutes,
          isSubscription: s.is_subscription,
          subscriptionPeriod: s.subscription_period,
          trialDays: s.trial_days,
          maxCapacity: s.max_capacity,
          entriesTotal: s.entries_total,
          isActive: s.is_active,
          createdAt: s.created_at,
        },
      }),
    };
  } catch (error) {
    log.error('Failed to create business service', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
