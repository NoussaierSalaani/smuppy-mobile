/**
 * Like/Unlike Peak Lambda Handler (Toggle)
 * POST: toggles like state for the current user
 */

import { sendPushToUser } from '../services/push-notification';
import { createPeakActionHandler } from '../utils/create-peak-action-handler';

export const { handler } = createPeakActionHandler({
  loggerName: 'peaks-like',
  rateLimitPrefix: 'peak-like',
  rateLimitMax: 30,
  onAction: async (client, peak, profileId, db, headers, log) => {
    const peakId = peak.id;

    // Fetch full_name for notification text
    const profileResult = await client.query(
      'SELECT full_name FROM profiles WHERE id = $1',
      [profileId]
    );
    const fullName: string | undefined = profileResult.rows[0]?.full_name;

    // Check if already liked INSIDE transaction to prevent race condition
    const existingLike = await client.query(
      'SELECT 1 FROM peak_likes WHERE user_id = $1 AND peak_id = $2 LIMIT 1',
      [profileId, peakId]
    );

    const alreadyLiked = existingLike.rows.length > 0;

    if (alreadyLiked) {
      // Unlike: remove like + decrement count
      await client.query(
        'DELETE FROM peak_likes WHERE user_id = $1 AND peak_id = $2',
        [profileId, peakId]
      );
      await client.query(
        'UPDATE peaks SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = $1',
        [peakId]
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          liked: false,
        }),
      };
    }

    // Like: insert + increment count
    await client.query(
      'INSERT INTO peak_likes (user_id, peak_id) VALUES ($1, $2)',
      [profileId, peakId]
    );
    await client.query(
      'UPDATE peaks SET likes_count = likes_count + 1 WHERE id = $1',
      [peakId]
    );

    // Idempotent notification: ON CONFLICT prevents duplicates from retries or toggle cycling
    if (peak.author_id !== profileId) {
      const notifData = JSON.stringify({ peakId, likerId: profileId });
      const dailyBucket = Math.floor(Date.now() / 86400000);
      const idempotencyKey = `peak_like:${profileId}:${peakId}:${dailyBucket}`;
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
         VALUES ($1, 'peak_like', 'New Like', $2, $3, $4)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
        [peak.author_id, `${fullName || 'Someone'} liked your peak`, notifData, idempotencyKey]
      );
    }

    // Send push notification to peak author (non-blocking, after COMMIT handled by factory)
    if (peak.author_id !== profileId) {
      sendPushToUser(db, peak.author_id, {
        title: 'New Like',
        body: `${fullName || 'Someone'} liked your peak`,
        data: { type: 'peak_like', peakId },
      }, profileId).catch(err => log.error('Push notification failed', err));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        liked: true,
      }),
    };
  },
});
