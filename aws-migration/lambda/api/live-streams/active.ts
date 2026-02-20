/**
 * List Active Live Streams Lambda Handler
 * Returns currently live streams for map markers and profile badges
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';

export const handler = withErrorHandler('live-streams-active', async (event, { headers }) => {
  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const db = await getPool();

  // Resolve profile ID for block filtering
  const profileResult = await db.query(
    'SELECT id FROM profiles WHERE cognito_sub = $1',
    [cognitoSub]
  );
  const currentProfileId = profileResult.rows[0]?.id || null;

  // Get all active live streams with host info
  const result = currentProfileId
    ? await db.query(
        `SELECT
           ls.id,
           ls.channel_name,
           ls.title,
           ls.started_at,
           p.id AS host_id,
           p.username AS host_username,
           p.display_name AS host_display_name,
           p.avatar_url AS host_avatar_url,
           (SELECT COUNT(1) FROM live_stream_viewers v WHERE v.channel_name = ls.channel_name) AS viewer_count
         FROM live_streams ls
         JOIN profiles p ON p.id = ls.host_id
         WHERE ls.status = 'live'
           AND p.moderation_status NOT IN ('banned', 'shadow_banned')
           AND NOT EXISTS (SELECT 1 FROM blocked_users WHERE (blocker_id = $1 AND blocked_id = p.id) OR (blocker_id = p.id AND blocked_id = $1))
         ORDER BY ls.started_at DESC
         LIMIT 50`,
        [currentProfileId]
      )
    : await db.query(
        `SELECT
           ls.id,
           ls.channel_name,
           ls.title,
           ls.started_at,
           p.id AS host_id,
           p.username AS host_username,
           p.display_name AS host_display_name,
           p.avatar_url AS host_avatar_url,
           (SELECT COUNT(1) FROM live_stream_viewers v WHERE v.channel_name = ls.channel_name) AS viewer_count
         FROM live_streams ls
         JOIN profiles p ON p.id = ls.host_id
         WHERE ls.status = 'live'
           AND p.moderation_status NOT IN ('banned', 'shadow_banned')
         ORDER BY ls.started_at DESC
         LIMIT 50`
      );

  const streams = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    channelName: row.channel_name,
    title: row.title,
    startedAt: row.started_at,
    viewerCount: Number.parseInt(row.viewer_count as string) || 0,
    host: {
      id: row.host_id,
      username: row.host_username,
      displayName: row.host_display_name,
      avatarUrl: row.host_avatar_url,
    },
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      data: streams,
    }),
  };
});
