/**
 * List Packs Handler
 * GET /packs - List available packs for a creator or user's purchased packs
 * GET /packs?creatorId={id} - List packs offered by a creator
 * GET /packs?owned=true - List user's purchased packs
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('packs-list');

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const pool = await getPool();
    const creatorId = event.queryStringParameters?.creatorId;
    const owned = event.queryStringParameters?.owned === 'true';

    if (owned) {
      // List user's purchased packs
      const result = await pool.query(
        `SELECT
          usp.*,
          sp.name, sp.description, sp.sessions_included, sp.session_duration,
          sp.validity_days, sp.price,
          p.id as creator_id, p.full_name as creator_name, p.username as creator_username,
          p.avatar_url as creator_avatar
         FROM user_session_packs usp
         JOIN session_packs sp ON usp.pack_id = sp.id
         JOIN profiles p ON usp.creator_id = p.id
         WHERE usp.user_id = $1 AND usp.sessions_remaining > 0 AND usp.expires_at > NOW()
         ORDER BY usp.expires_at ASC`,
        [userId]
      );

      const packs = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        packId: row.pack_id,
        name: row.name,
        description: row.description,
        sessionsIncluded: row.sessions_included,
        sessionsRemaining: row.sessions_remaining,
        sessionDuration: row.session_duration,
        expiresAt: row.expires_at,
        creator: {
          id: row.creator_id,
          name: row.creator_name,
          username: row.creator_username,
          avatar: row.creator_avatar,
        },
        purchasedAt: row.created_at,
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, packs }),
      };
    }

    if (creatorId) {
      // List packs offered by a creator
      const result = await pool.query(
        `SELECT
          sp.*,
          p.id as creator_id, p.full_name as creator_name, p.username as creator_username,
          p.avatar_url as creator_avatar, p.is_verified as creator_verified
         FROM session_packs sp
         JOIN profiles p ON sp.creator_id = p.id
         WHERE sp.creator_id = $1 AND sp.is_active = true
         ORDER BY sp.sessions_included ASC`,
        [creatorId]
      );

      const packs = result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        sessionsIncluded: row.sessions_included,
        sessionDuration: row.session_duration,
        validityDays: row.validity_days,
        price: Number.parseFloat(row.price as string),
        savings: row.savings_percent || 0,
        creator: {
          id: row.creator_id,
          name: row.creator_name,
          username: row.creator_username,
          avatar: row.creator_avatar,
          verified: row.creator_verified,
        },
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, packs }),
      };
    }

    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Specify creatorId or owned=true' }),
    };
  } catch (error) {
    log.error('List packs error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to list packs' }),
    };
  }
};
