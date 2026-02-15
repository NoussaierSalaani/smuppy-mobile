/**
 * Business Services Update
 * PATCH /businesses/my/services/{serviceId}
 * Owner only — updates an existing service
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { getUserFromEvent } from '../utils/auth';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/services-update');
const VALID_CATEGORIES = ['drop_in', 'pack', 'membership'];
const VALID_PERIODS = ['weekly', 'monthly', 'yearly'];
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const user = getUserFromEvent(event);
    if (!user) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    const { allowed } = await checkRateLimit({ prefix: 'biz-svc-update', identifier: user.id, maxRequests: 20 });
    if (!allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
    }

    const serviceId = event.pathParameters?.serviceId;
    if (!serviceId || !isValidUUID(serviceId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid serviceId is required' }) };
    }

    const body = JSON.parse(event.body || '{}');

    // Build dynamic update
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      const name = String(body.name).trim().replace(/<[^>]*>/g, '').substring(0, MAX_NAME_LENGTH);
      if (name.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Name cannot be empty' }) };
      }
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (body.description !== undefined) {
      const desc = body.description ? String(body.description).trim().replace(/<[^>]*>/g, '').substring(0, MAX_DESCRIPTION_LENGTH) : null;
      setClauses.push(`description = $${paramIndex++}`);
      params.push(desc);
    }

    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category)) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid category' }) };
      }
      setClauses.push(`category = $${paramIndex++}`);
      params.push(body.category);
    }

    if (body.price_cents !== undefined) {
      if (typeof body.price_cents !== 'number' || body.price_cents < 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid price' }) };
      }
      setClauses.push(`price_cents = $${paramIndex++}`);
      params.push(Math.round(body.price_cents));
    }

    if (body.duration_minutes !== undefined) {
      setClauses.push(`duration_minutes = $${paramIndex++}`);
      params.push(body.duration_minutes);
    }

    if (body.max_capacity !== undefined) {
      setClauses.push(`max_capacity = $${paramIndex++}`);
      params.push(body.max_capacity);
    }

    if (body.is_subscription !== undefined) {
      setClauses.push(`is_subscription = $${paramIndex++}`);
      params.push(body.is_subscription);
    }

    if (body.subscription_period !== undefined) {
      if (body.subscription_period && !VALID_PERIODS.includes(body.subscription_period)) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid subscription period' }) };
      }
      setClauses.push(`subscription_period = $${paramIndex++}`);
      params.push(body.subscription_period);
    }

    if (body.trial_days !== undefined) {
      setClauses.push(`trial_days = $${paramIndex++}`);
      params.push(body.trial_days);
    }

    if (body.entries_total !== undefined) {
      setClauses.push(`entries_total = $${paramIndex++}`);
      params.push(body.entries_total);
    }

    if (body.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(body.is_active);
    }

    if (setClauses.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'No fields to update' }) };
    }

    setClauses.push('updated_at = NOW()');

    const db = await getPool();

    // Verify ownership
    const ownerCheck = await db.query(
      'SELECT id FROM business_services WHERE id = $1 AND business_id = $2',
      [serviceId, user.id]
    );

    if (ownerCheck.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Service not found' }) };
    }

    params.push(serviceId);
    const result = await db.query(
      `UPDATE business_services SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, description, category, price_cents, duration_minutes,
                 is_subscription, subscription_period, trial_days, max_capacity,
                 entries_total, is_active, created_at, updated_at`,
      params
    );

    const s = result.rows[0];
    log.info('Business service updated', { serviceId: s.id });

    return {
      statusCode: 200,
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
    log.error('Failed to update business service', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
