/**
 * Unfollow User Lambda Handler
 * Removes a follow relationship between users
 * Tracks unfollows for anti-spam cooldown (7 days after 2+ unfollows)
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';

// Cooldown: 7 days after 2+ unfollows
const COOLDOWN_THRESHOLD = 2;
const COOLDOWN_DAYS = 7;

export const handler = withAuthHandler('follows-delete', async (event, { headers, log, cognitoSub, profileId, db }) => {
  const followerId = profileId;

  const rateLimitResponse = await requireRateLimit({
    prefix: 'follow-delete',
    identifier: cognitoSub,
    windowSeconds: 60,
    maxRequests: 10,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const followingId = event.pathParameters?.userId;

  if (!followingId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'userId is required' }),
    };
  }

  // SECURITY: Validate UUID format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(followingId)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Invalid ID format' }),
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Check if follow relationship exists
    const existingResult = await client.query(
      `SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2 FOR UPDATE`,
      [followerId, followingId]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Not following this user',
        }),
      };
    }

    // Delete follow record
    // Note: fan_count and following_count are updated automatically by database triggers
    // (see migration-015-counter-triggers-indexes.sql)
    await client.query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    // Track unfollow for anti-spam cooldown (optional - table might not exist)
    let cooldownInfo: { unfollow_count: number; cooldown_until: string | null } | null = null;
    try {
      const cooldownResult = await client.query(
        `INSERT INTO follow_cooldowns (follower_id, following_id, unfollow_count, last_unfollow_at, cooldown_until)
         VALUES ($1, $2, 1, NOW(), NULL)
         ON CONFLICT (follower_id, following_id)
         DO UPDATE SET
           unfollow_count = follow_cooldowns.unfollow_count + 1,
           last_unfollow_at = NOW(),
           cooldown_until = CASE
             WHEN follow_cooldowns.unfollow_count + 1 >= $3
             THEN NOW() + INTERVAL '${COOLDOWN_DAYS} days'
             ELSE follow_cooldowns.cooldown_until
           END
         RETURNING unfollow_count, cooldown_until`,
        [followerId, followingId, COOLDOWN_THRESHOLD]
      );
      cooldownInfo = cooldownResult.rows[0];
    } catch (cooldownErr) {
      // Table might not exist - continue without cooldown tracking
      log.warn('Cooldown tracking failed (table may not exist)', { error: String(cooldownErr) });
    }

    const isNowBlocked = cooldownInfo && cooldownInfo.unfollow_count >= COOLDOWN_THRESHOLD;

    await client.query('COMMIT');

    // Return with cooldown info if user is now blocked
    if (isNowBlocked && cooldownInfo?.cooldown_until) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Successfully unfollowed user',
          cooldown: {
            blocked: true,
            until: cooldownInfo.cooldown_until,
            message: `You can follow this user again after ${new Date(cooldownInfo.cooldown_until).toLocaleDateString()}`,
          },
        }),
      };
    }
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      message: 'Successfully unfollowed user',
    }),
  };
});
