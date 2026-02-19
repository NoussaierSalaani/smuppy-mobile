/**
 * Save Spot Lambda Handler
 * Saves a spot to the user's saved list
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('spots-save');

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

    const rateLimitResponse = await requireRateLimit({ prefix: 'spot-save', identifier: profileId, maxRequests: 30, windowSeconds: 60 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Verify spot exists
    const spotExists = await db.query(
      'SELECT id FROM spots WHERE id = $1',
      [spotId]
    );

    if (spotExists.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Spot not found' }),
      };
    }

    // Save spot (ON CONFLICT DO NOTHING for idempotency)
    await db.query(
      'INSERT INTO saved_spots (user_id, spot_id) VALUES ($1, $2) ON CONFLICT (user_id, spot_id) DO NOTHING',
      [profileId, spotId]
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        saved: true,
      }),
    };
  } catch (error: unknown) {
    log.error('Error saving spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
