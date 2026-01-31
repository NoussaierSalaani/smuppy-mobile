/**
 * List Active Live Streams Lambda Handler
 * Returns currently live streams for map markers and profile badges
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('live-streams-active');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions(event);
  const headers = cors(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getReaderPool();

    // Get all active live streams with host info
    const result = await db.query(
      `SELECT
         ls.id,
         ls.channel_name,
         ls.title,
         ls.started_at,
         p.id AS host_id,
         p.username AS host_username,
         p.display_name AS host_display_name,
         p.avatar_url AS host_avatar_url,
         (SELECT COUNT(*) FROM live_stream_viewers v WHERE v.channel_name = ls.channel_name) AS viewer_count
       FROM live_streams ls
       JOIN profiles p ON p.id = ls.host_id
       WHERE ls.status = 'live'
       ORDER BY ls.started_at DESC
       LIMIT 50`
    );

    const streams = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      channelName: row.channel_name,
      title: row.title,
      startedAt: row.started_at,
      viewerCount: parseInt(row.viewer_count as string) || 0,
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
  } catch (error) {
    log.error('Error listing active live streams', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
