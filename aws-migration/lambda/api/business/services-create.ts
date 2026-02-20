/**
 * Business Services Create
 * POST /businesses/my/services
 * Owner only — creates a new service
 */

import { createBusinessHandler } from '../utils/create-business-handler';
import {
  VALID_SERVICE_CATEGORIES,
  VALID_SUBSCRIPTION_PERIODS,
  MAX_SERVICE_NAME_LENGTH,
  MAX_SERVICE_DESCRIPTION_LENGTH,
  mapServiceRow,
} from '../utils/business-constants';
import type { ServiceRow } from '../utils/business-constants';

const { handler } = createBusinessHandler({
  loggerName: 'business/services-create',
  rateLimitPrefix: 'biz-svc-create',
  rateLimitMax: 10,
  onAction: async ({ headers, user, db, event, log }) => {
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
    if (name.length > MAX_SERVICE_NAME_LENGTH) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: `Name must be under ${MAX_SERVICE_NAME_LENGTH} characters` }) };
    }
    if (!category || !VALID_SERVICE_CATEGORIES.includes(category)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid category is required (drop_in, pack, membership)' }) };
    }
    if (typeof price_cents !== 'number' || price_cents < 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid price is required' }) };
    }
    if (description && typeof description === 'string' && description.length > MAX_SERVICE_DESCRIPTION_LENGTH) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: `Description must be under ${MAX_SERVICE_DESCRIPTION_LENGTH} characters` }) };
    }
    if (is_subscription && subscription_period && !VALID_SUBSCRIPTION_PERIODS.includes(subscription_period)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid subscription period is required' }) };
    }

    // Sanitize text inputs
    const sanitizedName = name.trim().replaceAll(/<[^>]*>/g, '').substring(0, MAX_SERVICE_NAME_LENGTH); // NOSONAR
    const sanitizedDesc = description
      ? String(description).trim().replaceAll(/<[^>]*>/g, '').substring(0, MAX_SERVICE_DESCRIPTION_LENGTH) // NOSONAR
      : null;

    // Verify user is a business account
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
        !!is_subscription,
        subscription_period || null,
        trial_days || 0,
        max_capacity || null,
        entries_total || null,
        is_active !== false,
      ]
    );

    const row = result.rows[0] as ServiceRow;
    log.info('Business service created', { serviceId: row.id, businessId: user.id.substring(0, 8) + '***' });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        service: mapServiceRow(row),
      }),
    };
  },
});

export { handler };
