/**
 * Business Validate Access
 * POST /businesses/validate-access
 * Validates member QR code for facility access
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { getUserFromEvent } from '../utils/auth';

const log = createLogger('business/validate-access');

interface ValidateRequest {
  subscriptionId: string;
  businessId: string;
  userId: string;
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

    let body: ValidateRequest;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }

    const { subscriptionId, businessId, userId } = body;

    if (!subscriptionId || !businessId || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing required fields' }) };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(subscriptionId) || !uuidRegex.test(businessId) || !uuidRegex.test(userId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid ID format' }) };
    }

    const db = await getPool();

    // Verify the scanner is the business owner
    const ownerCheck = await db.query(
      `SELECT id FROM profiles WHERE id = $1 AND account_type = 'pro_business'`,
      [user.id]
    );

    if (ownerCheck.rows.length === 0) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'Only business owners can scan access codes' }) };
    }

    // Verify the business belongs to this owner
    // For now, we check if the business ID matches the user ID (business profile = user profile)
    if (businessId !== user.id) {
      return { statusCode: 403, headers, body: JSON.stringify({ success: false, message: 'You can only scan for your own business' }) };
    }

    // Get subscription details with member info
    const subscriptionResult = await db.query(
      `SELECT
        bs.id,
        bs.user_id,
        bs.business_id,
        bs.service_id,
        bs.status,
        bs.current_period_end,
        bs.sessions_used,
        bs.sessions_limit,
        p.full_name as member_name,
        p.avatar_url as member_photo,
        sv.name as membership_type
      FROM business_subscriptions bs
      JOIN profiles p ON bs.user_id = p.id
      LEFT JOIN business_services sv ON bs.service_id = sv.id
      WHERE bs.id = $1 AND bs.business_id = $2 AND bs.user_id = $3`,
      [subscriptionId, businessId, userId]
    );

    if (subscriptionResult.rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          valid: false,
          message: 'Subscription not found',
          memberName: 'Unknown',
          membershipType: 'N/A',
        }),
      };
    }

    const subscription = subscriptionResult.rows[0];

    // Check if subscription is active
    if (subscription.status !== 'active' && subscription.status !== 'trial') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          valid: false,
          message: `Subscription is ${subscription.status}`,
          memberName: subscription.member_name || 'Unknown',
          membershipType: subscription.membership_type || 'N/A',
        }),
      };
    }

    // Check if subscription has expired
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < now) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          valid: false,
          message: 'Subscription has expired',
          memberName: subscription.member_name || 'Unknown',
          membershipType: subscription.membership_type || 'N/A',
        }),
      };
    }

    // Check session limits if applicable
    let remainingSessions: number | undefined;
    if (subscription.sessions_limit !== null && subscription.sessions_limit !== undefined) {
      const used = subscription.sessions_used || 0;
      remainingSessions = subscription.sessions_limit - used;

      if (remainingSessions <= 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            valid: false,
            message: 'No sessions remaining',
            memberName: subscription.member_name || 'Unknown',
            membershipType: subscription.membership_type || 'N/A',
            remainingSessions: 0,
          }),
        };
      }
    }

    // Access granted
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        valid: true,
        memberName: subscription.member_name || 'Unknown',
        membershipType: subscription.membership_type || 'Premium',
        validUntil: subscription.current_period_end,
        remainingSessions,
        photo: subscription.member_photo,
      }),
    };
  } catch (error) {
    log.error('Failed to validate access', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
