/**
 * Unlike Peak Lambda Handler
 * Removes like from a peak for the current user
 */

import { createPeakActionHandler } from '../utils/create-peak-action-handler';

export const { handler } = createPeakActionHandler({
  loggerName: 'peaks-unlike',
  rateLimitPrefix: 'peak-unlike',
  rateLimitMax: 30,
  onAction: async (client, peak, profileId, _db, headers) => {
    const peakId = peak.id;

    // Delete like
    const deleteResult = await client.query(
      'DELETE FROM peak_likes WHERE user_id = $1 AND peak_id = $2 RETURNING id',
      [profileId, peakId]
    );

    // Only decrement if a like was actually deleted
    if (deleteResult.rows.length > 0) {
      await client.query(
        'UPDATE peaks SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
        [peakId]
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: deleteResult.rows.length > 0 ? 'Peak unliked successfully' : 'Peak was not liked',
        liked: false,
      }),
    };
  },
});
