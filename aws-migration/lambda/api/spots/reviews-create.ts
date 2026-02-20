/**
 * Create/Update Spot Review Lambda Handler
 * Creates or updates a review for a spot (UPSERT)
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateText } from '../utils/text-moderation';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('spots-reviews-create', async (event, { headers, log }) => {
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

  const rateLimitResponse = await requireRateLimit({
    prefix: 'spot-review',
    identifier: userId,
    windowSeconds: 60,
    maxRequests: 5,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

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
  const profileId = await resolveProfileId(db, userId);
  if (!profileId) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'User profile not found' }),
    };
  }

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

  // Moderate comment text if provided (keyword filter + Comprehend toxicity)
  if (sanitizedComment) {
    const modResult = await moderateText(sanitizedComment, headers, log, 'spot review');
    if (modResult.blocked) return modResult.blockResponse!;
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
});
