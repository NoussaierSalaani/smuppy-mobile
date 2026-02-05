/**
 * Business Log Entry
 * POST /businesses/log-entry
 * Records member check-in at a business facility
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';
import { isValidUUID } from '../utils/security';

const log = createLogger('business/log-entry');

interface LogEntryRequest {
  subscriptionId: string;
  businessId: string;
}

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

    let body: LogEntryRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }

    const { subscriptionId, businessId } = body;

    if (!subscriptionId || !businessId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing required fields' }) };
    }

    // Validate UUID format
    if (!isValidUUID(subscriptionId) || !isValidUUID(businessId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid ID format' }) };
    }

    const db = await getPool();

    // Verify the scanner is the business owner
    if (businessId !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You can only log entries for your own business' }) };
    }

    // Get subscription to verify it exists and get session info
    const subscriptionResult = await db.query(
      `SELECT id, sessions_used, sessions_limit, status
       FROM business_subscriptions
       WHERE id = $1 AND business_id = $2`,
      [subscriptionId, businessId]
    );

    if (subscriptionResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found' }) };
    }

    const subscription = subscriptionResult.rows[0];

    // Insert entry log
    await db.query(
      `INSERT INTO business_entry_logs (subscription_id, business_id, scanned_at, scanned_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT DO NOTHING`,
      [subscriptionId, businessId, user.id]
    );

    // If session-based subscription, increment sessions_used
    if (subscription.sessions_limit !== null) {
      await db.query(
        `UPDATE business_subscriptions
         SET sessions_used = COALESCE(sessions_used, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId]
      );
    }

    log.info('Entry logged', { subscriptionId, businessId });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Entry logged successfully' }),
    };
  } catch (error) {
    log.error('Failed to log entry', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
