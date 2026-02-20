/**
 * Delete Spot Review Lambda Handler
 * Deletes a review (owner only) and recalculates the spot rating
 */

import { RATE_WINDOW_1_MIN } from '../utils/constants';
import { createDeleteHandler } from '../utils/create-delete-handler';

export const handler = createDeleteHandler({
  resourceName: 'Review',
  resourceTable: 'spot_reviews',
  loggerName: 'spots-reviews-delete',
  ownershipField: 'user_id',
  selectColumns: 'id, user_id, spot_id',
  rateLimitPrefix: 'spot-review-delete',
  rateLimitMax: 10,
  rateLimitWindow: RATE_WINDOW_1_MIN,

  async onDelete({ client, resource, resourceId, profileId }) {
    // Delete with ownership check (RETURNING to get spot_id for recalculation)
    const deleteResult = await client.query(
      'DELETE FROM spot_reviews WHERE id = $1 AND user_id = $2 RETURNING spot_id',
      [resourceId, profileId],
    );

    if (deleteResult.rows.length === 0) {
      // The factory already verified the row exists, so this means ownership mismatch.
      // However the factory ownership check already passed, so this branch
      // should not trigger. Kept as defensive guard.
      return;
    }

    const spotId = deleteResult.rows[0].spot_id;

    // Recalculate spot rating and review_count
    await client.query(
      `UPDATE spots SET
        rating = (SELECT COALESCE(AVG(rating), 0) FROM spot_reviews WHERE spot_id = $1),
        review_count = (SELECT COUNT(*) FROM spot_reviews WHERE spot_id = $1),
        updated_at = NOW()
      WHERE id = $1`,
      [spotId],
    );
  },
});
