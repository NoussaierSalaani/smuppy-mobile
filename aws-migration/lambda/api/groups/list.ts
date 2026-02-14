/**
 * List Groups Lambda Handler
 * Get groups with various filters (upcoming, nearby, my-groups, joined)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('groups-list');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getReaderPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const {
      filter = 'upcoming',
      latitude,
      longitude,
      radiusKm = '50',
      category,
      limit = '20',
      offset = '0',
    } = event.queryStringParameters || {};

    const limitNum = Math.min(parseInt(limit) || 20, 50);
    const offsetNum = parseInt(offset) || 0;

    // Resolve profile if authenticated
    let profileId: string | null = null;
    if (cognitoSub) {
      const profileResult = await client.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      if (profileResult.rows.length > 0) {
        profileId = profileResult.rows[0].id;
      }
    }

    // For my-groups and joined filters, auth is required
    if ((filter === 'my-groups' || filter === 'joined') && !profileId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const params: SqlParam[] = [];
    const hasCoords = latitude && longitude;
    let latIdx = 0;
    let lonIdx = 0;

    if (hasCoords) {
      params.push(parseFloat(latitude));
      latIdx = params.length;
      params.push(parseFloat(longitude));
      lonIdx = params.length;
    }

    const distanceExpr = hasCoords
      ? `,
        (6371 * acos(cos(radians($${latIdx})) * cos(radians(g.latitude))
        * cos(radians(g.longitude) - radians($${lonIdx}))
        + sin(radians($${latIdx})) * sin(radians(g.latitude)))) AS distance_km`
      : '';

    const baseSelect = `
      SELECT
        g.id,
        g.name,
        g.description,
        g.category,
        g.subcategory,
        g.sport_type,
        g.latitude,
        g.longitude,
        g.address,
        g.starts_at,
        g.timezone,
        g.max_participants,
        g.current_participants,
        g.is_free,
        g.price,
        g.currency,
        g.is_public,
        g.is_fans_only,
        g.is_route,
        g.route_start,
        g.route_end,
        g.route_waypoints,
        g.route_geojson,
        g.route_profile,
        g.route_distance_km,
        g.route_duration_min,
        g.route_elevation_gain,
        g.difficulty,
        g.cover_image_url,
        g.status,
        g.created_at,
        creator.id AS creator_id,
        creator.username AS creator_username,
        creator.display_name AS creator_display_name,
        creator.avatar_url AS creator_avatar,
        creator.is_verified AS creator_verified
        ${distanceExpr}
      FROM groups g
      JOIN profiles creator ON g.creator_id = creator.id
    `;

    const whereConditions: string[] = [];

    // Exclude cancelled
    params.push('cancelled');
    whereConditions.push(`g.status != $${params.length}`);

    // Exclude groups from banned/shadow_banned creators
    whereConditions.push(`creator.moderation_status NOT IN ('banned', 'shadow_banned')`);

    if (filter === 'upcoming' || filter === 'nearby') {
      whereConditions.push(`g.starts_at > NOW()`);
      whereConditions.push(`g.is_public = TRUE`);
    }

    if (filter === 'nearby' && hasCoords) {
      const radiusNum = parseFloat(radiusKm);
      params.push(radiusNum);
      whereConditions.push(`
        (6371 * acos(cos(radians($${latIdx})) * cos(radians(g.latitude))
        * cos(radians(g.longitude) - radians($${lonIdx}))
        + sin(radians($${latIdx})) * sin(radians(g.latitude)))) < $${params.length}
      `);
    }

    if (category) {
      params.push(category);
      whereConditions.push(`g.category = $${params.length}`);
    }

    let query: string;

    if (filter === 'my-groups' && profileId) {
      params.push(profileId);
      whereConditions.push(`g.creator_id = $${params.length}`);
      query = `${baseSelect} WHERE ${whereConditions.join(' AND ')}`;
    } else if (filter === 'joined' && profileId) {
      params.push(profileId);
      query = `
        ${baseSelect}
        JOIN group_participants gp ON g.id = gp.group_id
        WHERE gp.user_id = $${params.length}
        ${whereConditions.length > 0 ? ' AND ' + whereConditions.join(' AND ') : ''}
      `;
    } else {
      query = `${baseSelect} WHERE ${whereConditions.join(' AND ')}`;
    }

    // Order by
    const orderBy = (filter === 'nearby' && hasCoords) ? 'distance_km ASC' : 'g.starts_at ASC';

    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offsetNum);
    const offsetIdx = params.length;
    query += ` ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const result = await client.query(query, params);

    // Get total count for pagination
    let totalQuery: string;
    const countParams: SqlParam[] = [];

    if (filter === 'my-groups' && profileId) {
      totalQuery = `SELECT COUNT(*) AS total FROM groups g WHERE g.status != 'cancelled' AND g.creator_id = $1`;
      countParams.push(profileId);
    } else if (filter === 'joined' && profileId) {
      totalQuery = `SELECT COUNT(*) AS total FROM groups g JOIN group_participants gp ON g.id = gp.group_id WHERE gp.user_id = $1 AND g.status != 'cancelled'`;
      countParams.push(profileId);
    } else {
      totalQuery = `SELECT COUNT(*) AS total FROM groups g WHERE g.status != 'cancelled' AND g.starts_at > NOW() AND g.is_public = TRUE`;
    }

    const totalResult = await client.query(totalQuery, countParams);
    const total = parseInt(totalResult.rows[0].total);

    const groups = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      sportType: row.sport_type,
      latitude: parseFloat(row.latitude as string),
      longitude: parseFloat(row.longitude as string),
      address: row.address,
      distance: row.distance_km ? parseFloat((row.distance_km as number).toFixed(1)) : null,
      startsAt: row.starts_at,
      timezone: row.timezone,
      maxParticipants: row.max_participants,
      currentParticipants: row.current_participants,
      spotsLeft: row.max_participants
        ? (row.max_participants as number) - (row.current_participants as number)
        : null,
      isFree: row.is_free,
      price: row.price ? parseFloat(row.price as string) : null,
      currency: row.currency,
      isPublic: row.is_public,
      isFansOnly: row.is_fans_only,
      isRoute: row.is_route,
      routeStart: row.route_start,
      routeEnd: row.route_end,
      routeWaypoints: row.route_waypoints,
      routeGeojson: row.route_geojson,
      routeProfile: row.route_profile,
      routeDistanceKm: row.route_distance_km ? parseFloat(row.route_distance_km as string) : null,
      routeDurationMin: row.route_duration_min,
      routeElevationGain: row.route_elevation_gain,
      difficulty: row.difficulty,
      coverImageUrl: row.cover_image_url,
      status: row.status,
      createdAt: row.created_at,
      creator: {
        id: row.creator_id,
        username: row.creator_username,
        displayName: row.creator_display_name,
        avatarUrl: row.creator_avatar,
        isVerified: row.creator_verified,
      },
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        groups,
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('List groups error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to fetch groups' }),
    });
  } finally {
    client.release();
  }
};
