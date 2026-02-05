/**
 * Delete Spot Lambda Handler
 * Deletes a spot (owner only)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

const log = createLogger('spots-delete');

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

    const rateLimit = await checkRateLimit({ prefix: 'spot-delete', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ error: 'Too many requests. Please try again later.' }) };
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

    // Delete with ownership check
    const result = await db.query(
      'DELETE FROM spots WHERE id = $1 AND creator_id = $2 RETURNING id',
      [spotId, profileId]
    );

    if (result.rows.length === 0) {
      // Check if spot exists at all
      const existsResult = await db.query(
        'SELECT id FROM spots WHERE id = $1',
        [spotId]
      );
      if (existsResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Spot not found' }),
        };
      }
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to delete this spot' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Spot deleted successfully',
      }),
    };
  } catch (error: unknown) {
    log.error('Error deleting spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
