/**
 * Get Group Lambda Handler
 * Get a single group by ID with participants
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('groups-get');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getReaderPool();
  const client = await pool.connect();

  try {
    const groupId = event.pathParameters?.groupId;
    if (!groupId || !isValidUUID(groupId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Get group with creator info
    const groupResult = await client.query(
      `SELECT
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
        g.updated_at,
        creator.id AS creator_id,
        creator.username AS creator_username,
        creator.display_name AS creator_display_name,
        creator.avatar_url AS creator_avatar,
        creator.is_verified AS creator_verified
      FROM groups g
      JOIN profiles creator ON g.creator_id = creator.id
      WHERE g.id = $1
        AND creator.moderation_status NOT IN ('banned', 'shadow_banned')`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Group not found' }),
      });
    }

    const row = groupResult.rows[0];

    // Get participants
    const participantsResult = await client.query(
      `SELECT
        p.id,
        p.username,
        p.display_name,
        p.avatar_url,
        p.is_verified,
        gp.joined_at
      FROM group_participants gp
      JOIN profiles p ON gp.user_id = p.id
      WHERE gp.group_id = $1
      ORDER BY gp.joined_at ASC
      LIMIT 100`,
      [groupId]
    );

    const participants = participantsResult.rows.map((p: Record<string, unknown>) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      isVerified: p.is_verified,
      joinedAt: p.joined_at,
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        group: {
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          subcategory: row.subcategory,
          sportType: row.sport_type,
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
          address: row.address,
          startsAt: row.starts_at,
          timezone: row.timezone,
          maxParticipants: row.max_participants,
          currentParticipants: row.current_participants,
          isFree: row.is_free,
          price: row.price ? parseFloat(row.price) : null,
          currency: row.currency,
          isPublic: row.is_public,
          isFansOnly: row.is_fans_only,
          isRoute: row.is_route,
          routeStart: row.route_start,
          routeEnd: row.route_end,
          routeWaypoints: row.route_waypoints,
          routeGeojson: row.route_geojson,
          routeProfile: row.route_profile,
          routeDistanceKm: row.route_distance_km ? parseFloat(row.route_distance_km) : null,
          routeDurationMin: row.route_duration_min,
          routeElevationGain: row.route_elevation_gain,
          difficulty: row.difficulty,
          coverImageUrl: row.cover_image_url,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          creator: {
            id: row.creator_id,
            username: row.creator_username,
            displayName: row.creator_display_name,
            avatarUrl: row.creator_avatar,
            isVerified: row.creator_verified,
          },
          participants,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('Get group error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to fetch group' }),
    });
  } finally {
    client.release();
  }
};
