/**
 * Unsave Spot Lambda Handler
 * Removes a spot from the user's saved list
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('spots-unsave');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const spotId = event.pathParameters?.id;
    if (!spotId || !isValidUUID(spotId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid spot ID format' }),
      };
    }

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'spot-unsave', identifier: profileId, maxRequests: 30, windowSeconds: 60 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    await db.query(
      'DELETE FROM saved_spots WHERE user_id = $1 AND spot_id = $2',
      [profileId, spotId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        saved: false,
      }),
    };
  } catch (error: unknown) {
    log.error('Error unsaving spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
