/**
 * Delete Spot Review Lambda Handler
 * Deletes a review (owner only)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('spots-reviews-delete');

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

    // Rate limit: destructive action
    const rateLimitResponse = await requireRateLimit({
      prefix: 'spot-review-delete',
      identifier: userId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 10,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const reviewId = event.pathParameters?.id;
    if (!reviewId || !isValidUUID(reviewId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid review ID format' }),
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

    // Use transaction: delete review + recalculate spot rating
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Delete with ownership check, return spot_id for recalculation
      const deleteResult = await client.query(
        'DELETE FROM spot_reviews WHERE id = $1 AND user_id = $2 RETURNING spot_id',
        [reviewId, profileId]
      );

      if (deleteResult.rows.length === 0) {
        await client.query('ROLLBACK');

        // Check if review exists at all
        const existsResult = await client.query(
          'SELECT id FROM spot_reviews WHERE id = $1',
          [reviewId]
        );
        if (existsResult.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ message: 'Review not found' }),
          };
        }
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Not authorized to delete this review' }),
        };
      }

      const spotId = deleteResult.rows[0].spot_id;

      // Recalculate spot rating and review_count
      await client.query(
        `UPDATE spots SET
          rating = (SELECT COALESCE(AVG(rating), 0) FROM spot_reviews WHERE spot_id = $1),
          review_count = (SELECT COUNT(*) FROM spot_reviews WHERE spot_id = $1),
          updated_at = NOW()
        WHERE id = $1`,
        [spotId]
      );

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Review deleted successfully',
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error deleting spot review', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
