/**
 * Business Access Pass
 * GET /businesses/subscriptions/{subscriptionId}/access-pass
 * Returns member QR code access pass for a subscription
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import {
  authenticateAndResolveProfile,
  isErrorResponse,
  validateSubscriptionId,
  getAccessPass,
} from './subscription-utils';

const log = createLogger('business/access-pass');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db } = authResult;

  try {
    const subIdResult = validateSubscriptionId(event, headers);
    if (typeof subIdResult !== 'string') return subIdResult;

    return await getAccessPass(db, subIdResult, profileId, headers);
  } catch (error) {
    log.error('Failed to get access pass', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}
