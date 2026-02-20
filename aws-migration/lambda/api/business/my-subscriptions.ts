/**
 * My Business Subscriptions
 * GET /businesses/my/subscriptions
 * Returns all business subscriptions for the authenticated user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../utils/logger';
import { authenticateAndResolveProfile, isErrorResponse, listUserSubscriptions } from './subscription-utils';

const log = createLogger('business/my-subscriptions');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);

  const authResult = await authenticateAndResolveProfile(event);
  if (isErrorResponse(authResult)) return authResult;
  const { headers, profileId, db } = authResult;

  try {
    return await listUserSubscriptions(db, profileId, headers);
  } catch (error) {
    log.error('Failed to get subscriptions', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'Internal server error' }) };
  }
}
