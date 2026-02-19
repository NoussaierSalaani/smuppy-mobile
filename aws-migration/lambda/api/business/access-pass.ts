/**
 * Business Access Pass
 * GET /businesses/subscriptions/{subscriptionId}/access-pass
 * Returns member QR code access pass for a subscription
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { authenticateAndResolveProfile, isErrorResponse, validateSubscriptionId } from './subscription-utils';

const log = createLogger('business/access-pass');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db } = authResult;

  try {
    const subIdResult = validateSubscriptionId(event, headers);
    if (typeof subIdResult !== 'string') return subIdResult;
    const subscriptionId = subIdResult;

    const subscriptionResult = await db.query(
      `SELECT
        bs.id, bs.user_id, bs.business_id, bs.service_id, bs.status,
        bs.current_period_end, bs.sessions_used, bs.sessions_limit,
        p.full_name as member_name,
        bp.full_name as business_name, bp.avatar_url as business_logo,
        sv.name as membership_type
      FROM business_subscriptions bs
      JOIN profiles p ON bs.user_id = p.id
      JOIN profiles bp ON bs.business_id = bp.id
      LEFT JOIN business_services sv ON bs.service_id = sv.id
      WHERE bs.id = $1 AND bs.user_id = $2`,
      [subscriptionId, profileId]
    );

    if (subscriptionResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Subscription not found or not owned by you' }) };
    }

    const subscription = subscriptionResult.rows[0];

    const qrCodeData = JSON.stringify({
      type: 'smuppy_access',
      subscriptionId: subscription.id,
      businessId: subscription.business_id,
      userId: subscription.user_id,
      timestamp: Date.now(),
    });

    let remainingSessions: number | undefined;
    if (subscription.sessions_limit !== null && subscription.sessions_limit !== undefined) {
      remainingSessions = subscription.sessions_limit - (subscription.sessions_used || 0);
    }

    const accessPass = {
      id: subscription.id,
      qrCode: qrCodeData,
      memberName: subscription.member_name || 'Member',
      membershipType: subscription.membership_type || 'Premium',
      validUntil: subscription.current_period_end,
      status: subscription.status,
      remainingSessions,
      businessName: subscription.business_name || 'Business',
      businessLogo: subscription.business_logo,
    };

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, accessPass }) };
  } catch (error) {
    log.error('Failed to get access pass', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}
