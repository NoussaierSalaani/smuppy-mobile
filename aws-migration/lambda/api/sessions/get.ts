/**
 * Get Session Handler
 * GET /sessions/{id} - Get session details
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';
import { isValidUUID } from '../utils/security';
import { createLogger } from '../utils/logger';

const log = createLogger('sessions-get');

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const cognitoSub = event.requestContext.authorizer?.claims?.sub;
  if (!cognitoSub) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const sessionId = event.pathParameters?.id;
  if (!sessionId || !isValidUUID(sessionId)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Valid session ID required' }),
    };
  }

  try {
    const pool = await getPool();

    // Resolve cognitoSub → profile ID
    const profileLookup = await pool.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    const result = await pool.query(
      `SELECT
        s.id, s.status, s.scheduled_at, s.duration, s.price,
        s.notes, s.started_at, s.ended_at, s.created_at,
        -- Creator info
        cp.id as creator_id,
        cp.full_name as creator_name,
        cp.username as creator_username,
        cp.avatar_url as creator_avatar,
        cp.is_verified as creator_verified,
        cp.bio as creator_bio,
        -- Fan info
        fp.id as fan_id,
        fp.full_name as fan_name,
        fp.username as fan_username,
        fp.avatar_url as fan_avatar,
        -- Agora token (if session is about to start)
        CASE
          WHEN s.status = 'confirmed' AND s.scheduled_at <= NOW() + interval '5 minutes'
          THEN s.agora_channel
          ELSE NULL
        END as agora_channel
      FROM private_sessions s
      JOIN profiles cp ON s.creator_id = cp.id
      JOIN profiles fp ON s.fan_id = fp.id
      WHERE s.id = $1 AND (s.creator_id = $2 OR s.fan_id = $2)`,
      [sessionId, profileId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Session not found' }),
      };
    }

    const row = result.rows[0];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        session: {
          id: row.id,
          status: row.status,
          scheduledAt: row.scheduled_at,
          duration: row.duration,
          price: Number.parseFloat(row.price),
          notes: row.notes,
          creator: {
            id: row.creator_id,
            name: row.creator_name,
            username: row.creator_username,
            avatar: row.creator_avatar,
            verified: row.creator_verified,
            bio: row.creator_bio,
          },
          fan: {
            id: row.fan_id,
            name: row.fan_name,
            username: row.fan_username,
            avatar: row.fan_avatar,
          },
          isCreator: row.creator_id === profileId,
          agoraChannel: row.agora_channel,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          createdAt: row.created_at,
        },
      }),
    };
  } catch (error) {
    log.error('Get session error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to get session' }),
    };
  }
};
