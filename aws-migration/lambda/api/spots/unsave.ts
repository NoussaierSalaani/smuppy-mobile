/**
 * Unsave Spot Lambda Handler
 * Removes a spot from the user's saved list
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('spots-unsave');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

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
    if (!spotId || !UUID_REGEX.test(spotId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid spot ID format' }),
      };
    }

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    const rateCheck = await checkRateLimit(profileId, 'spot-unsave', 30, 60000);
    if (rateCheck) return rateCheck;

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
