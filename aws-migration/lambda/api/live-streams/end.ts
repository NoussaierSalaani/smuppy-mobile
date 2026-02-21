/**
 * End Live Stream Lambda Handler
 * Marks a live stream as ended and records stats
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

export const handler = withAuthHandler('live-streams-end', async (event, { headers, cognitoSub, profileId, db }) => {
  // Rate limit: destructive action
  const rateLimitResponse = await requireRateLimit({
    prefix: 'live-stream-end',
    identifier: cognitoSub,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 5,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Find active stream for this host
    const streamResult = await client.query(
      `SELECT id, channel_name, started_at FROM live_streams
       WHERE host_id = $1 AND status = 'live'
       LIMIT 1`,
      [profileId]
    );

    if (streamResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'No active live stream found' }) };
    }

    const stream = streamResult.rows[0];

    // Get current viewer count for max_viewers
    const viewerCountResult = await client.query(
      'SELECT COUNT(1) as count FROM live_stream_viewers WHERE channel_name = $1',
      [stream.channel_name]
    );
    const currentViewers = Number.parseInt(viewerCountResult.rows[0].count);

    // End the stream
    const updateResult = await client.query(
      `UPDATE live_streams
       SET status = 'ended',
           ended_at = NOW(),
           max_viewers = GREATEST(COALESCE(max_viewers, 0), $2)
       WHERE id = $1
       RETURNING id, started_at, ended_at, max_viewers, total_comments, total_reactions`,
      [stream.id, currentViewers]
    );

    // Clean up viewers
    await client.query(
      'DELETE FROM live_stream_viewers WHERE channel_name = $1',
      [stream.channel_name]
    );

    await client.query('COMMIT');

    const ended = updateResult.rows[0];
    const durationMs = new Date(ended.ended_at).getTime() - new Date(ended.started_at).getTime();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          id: ended.id,
          durationSeconds: Math.floor(durationMs / 1000),
          maxViewers: ended.max_viewers || 0,
          totalComments: ended.total_comments || 0,
          totalReactions: ended.total_reactions || 0,
        },
      }),
    };
  } catch (error_) {
    await client.query('ROLLBACK');
    throw error_;
  } finally {
    client.release();
  }
});
