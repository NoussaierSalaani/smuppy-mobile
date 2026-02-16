/**
 * Create/Update Spot Review Lambda Handler
 * Creates or updates a review for a spot (UPSERT)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('spots-reviews-create');

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

    // Account status check
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    const rateLimit = await checkRateLimit({
      prefix: 'spot-review',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
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

    const body = event.body ? JSON.parse(event.body) : {};
    const { rating, comment, images } = body;

    // Validate rating (required, 1-5)
    if (rating === undefined || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Rating is required and must be an integer between 1 and 5' }),
      };
    }

    if (images !== undefined && !Array.isArray(images)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Images must be an array' }),
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

    // Verify spot exists and check creator for self-review prevention
    const spotExists = await db.query(
      'SELECT id, creator_id FROM spots WHERE id = $1',
      [spotId]
    );

    if (spotExists.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Spot not found' }),
      };
    }

    // BUG-2026-02-14: Prevent self-review (spot creator cannot review their own spot)
    if (spotExists.rows[0].creator_id === profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'You cannot review your own spot' }),
      };
    }

    const sanitizedComment = comment ? sanitizeText(comment, 2000) : null;
    const sanitizedImages = images ? images.map((img: string) => sanitizeText(img, 2000)) : null;

    // Moderate comment text if provided
    if (sanitizedComment) {
      const filterResult = await filterText(sanitizedComment);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Spot review comment blocked by filter', { userId: userId.substring(0, 8) + '***' });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Your review contains content that violates our community guidelines.' }),
        };
      }
      const toxicityResult = await analyzeTextToxicity(sanitizedComment);
      if (toxicityResult.action === 'block') {
        log.warn('Spot review comment blocked by toxicity', { userId: userId.substring(0, 8) + '***' });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Your review contains content that violates our community guidelines.' }),
        };
      }
    }

    // Use transaction for UPSERT + rating recalculation
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // UPSERT review
      const reviewResult = await client.query(
        `INSERT INTO spot_reviews (spot_id, user_id, rating, comment, images)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (spot_id, user_id)
         DO UPDATE SET rating = $3, comment = $4, images = $5, updated_at = NOW()
         RETURNING id, spot_id, user_id, rating, comment, images, created_at, updated_at`,
        [spotId, profileId, rating, sanitizedComment, sanitizedImages]
      );

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

      const review = reviewResult.rows[0];

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          review: {
            id: review.id,
            spotId: review.spot_id,
            userId: review.user_id,
            rating: review.rating,
            comment: review.comment,
            images: review.images || [],
            createdAt: review.created_at,
            updatedAt: review.updated_at,
          },
        }),
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error creating spot review', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
