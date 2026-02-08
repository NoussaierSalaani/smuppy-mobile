/**
 * List Sessions Handler
 * GET /sessions - List user's sessions (upcoming and past)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool, getPool, corsHeaders, SqlParam } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('sessions-list');

export const handler: APIGatewayProxyHandler = async (event) => {
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

  try {
    // Resolve cognitoSub → profile ID (use write pool for profile lookup)
    const writePool = await getPool();
    const profileLookup = await writePool.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (profileLookup.rows.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }
    const profileId = profileLookup.rows[0].id as string;

    const pool = await getReaderPool();
    const status = event.queryStringParameters?.status; // 'upcoming', 'past', 'pending'
    const role = event.queryStringParameters?.role; // 'fan', 'creator'

    let query = `
      SELECT
        s.*,
        -- Creator info
        cp.id as creator_id,
        cp.full_name as creator_name,
        cp.username as creator_username,
        cp.avatar_url as creator_avatar,
        cp.is_verified as creator_verified,
        -- Fan info
        fp.id as fan_id,
        fp.full_name as fan_name,
        fp.username as fan_username,
        fp.avatar_url as fan_avatar
      FROM private_sessions s
      JOIN profiles cp ON s.creator_id = cp.id
      JOIN profiles fp ON s.fan_id = fp.id
      WHERE (s.creator_id = $1 OR s.fan_id = $1)
    `;

    const params: SqlParam[] = [profileId];
    let paramIndex = 2;

    // Filter by role if specified
    if (role === 'fan') {
      query += ` AND s.fan_id = $1`;
    } else if (role === 'creator') {
      query += ` AND s.creator_id = $1`;
    }

    // Filter by status
    const now = new Date().toISOString();
    if (status === 'upcoming') {
      query += ` AND s.scheduled_at > $${paramIndex} AND s.status IN ('confirmed', 'pending')`;
      params.push(now);
      paramIndex++;
    } else if (status === 'past') {
      query += ` AND (s.scheduled_at < $${paramIndex} OR s.status IN ('completed', 'cancelled', 'no_show'))`;
      params.push(now);
      paramIndex++;
    } else if (status === 'pending') {
      query += ` AND s.status = 'pending'`;
    }

    query += ` ORDER BY s.scheduled_at ${status === 'past' ? 'DESC' : 'ASC'}`;

    const result = await pool.query(query, params);

    const sessions = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      status: row.status,
      scheduledAt: row.scheduled_at,
      duration: row.duration,
      price: parseFloat(row.price as string),
      notes: row.notes,
      creator: {
        id: row.creator_id,
        name: row.creator_name,
        username: row.creator_username,
        avatar: row.creator_avatar,
        verified: row.creator_verified,
      },
      fan: {
        id: row.fan_id,
        name: row.fan_name,
        username: row.fan_username,
        avatar: row.fan_avatar,
      },
      isCreator: row.creator_id === profileId,
      createdAt: row.created_at,
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        sessions,
      }),
    };
  } catch (error) {
    log.error('List sessions error', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to list sessions' }),
    };
  }
};
