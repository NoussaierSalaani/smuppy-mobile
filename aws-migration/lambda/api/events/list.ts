/**
 * List Events Lambda Handler
 * Get events with various filters (map, nearby, category, etc.)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('events-list');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    const {
      filter = 'upcoming', // upcoming, nearby, category, my-events, joined
      latitude,
      longitude,
      radiusKm = '50',
      category,
      startDate,
      endDate,
      isFree,
      hasRoute,
      limit = '20',
      offset = '0',
    } = event.queryStringParameters || {};

    const limitNum = Math.min(parseInt(limit), 50);
    const offsetNum = parseInt(offset);

    // Resolve profile ID for authenticated user
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

    // All params are pushed in order — never use unshift
    const params: SqlParam[] = [];

    const hasCoords = latitude && longitude;
    let latIdx = 0;
    let lonIdx = 0;

    if (hasCoords) {
      params.push(parseFloat(latitude));
      latIdx = params.length; // $1
      params.push(parseFloat(longitude));
      lonIdx = params.length; // $2
    }

    const distanceExpr = hasCoords
      ? `,
        (6371 * acos(cos(radians($${latIdx})) * cos(radians(e.latitude))
        * cos(radians(e.longitude) - radians($${lonIdx}))
        + sin(radians($${latIdx})) * sin(radians(e.latitude)))) AS distance_km`
      : '';

    const baseSelect = `
      SELECT
        e.id,
        e.title,
        e.description,
        e.location_name,
        e.address,
        e.latitude,
        e.longitude,
        e.starts_at,
        e.ends_at,
        e.timezone,
        e.max_participants,
        e.min_participants,
        e.current_participants,
        e.is_free,
        e.price,
        e.currency,
        e.is_public,
        e.is_fans_only,
        e.cover_image_url,
        e.has_route,
        e.route_distance_km,
        e.route_elevation_gain_m,
        e.route_difficulty,
        e.status,
        e.view_count,
        e.created_at,
        ec.id as category_id,
        ec.name as category_name,
        ec.slug as category_slug,
        ec.icon as category_icon,
        ec.color as category_color,
        creator.id as creator_id,
        creator.username as creator_username,
        creator.display_name as creator_display_name,
        creator.avatar_url as creator_avatar,
        creator.is_verified as creator_verified
        ${distanceExpr}
      FROM events e
      JOIN event_categories ec ON e.category_id = ec.id
      JOIN profiles creator ON e.creator_id = creator.id
    `;

    // Build WHERE conditions
    const whereConditions: string[] = [];

    params.push('cancelled');
    whereConditions.push(`e.status != $${params.length}`);

    // Exclude events from banned/shadow_banned creators
    whereConditions.push(`creator.moderation_status NOT IN ('banned', 'shadow_banned')`);

    // Filter: upcoming (default)
    if (filter === 'upcoming' || filter === 'nearby') {
      whereConditions.push(`e.starts_at > NOW()`);
      whereConditions.push(`e.is_public = TRUE`);
    }

    // Filter: nearby (within radius)
    if (filter === 'nearby' && hasCoords) {
      const radiusNum = Math.max(1, Math.min(500, parseFloat(radiusKm) || 50));
      params.push(radiusNum);
      whereConditions.push(`
        (6371 * acos(cos(radians($${latIdx})) * cos(radians(e.latitude))
        * cos(radians(e.longitude) - radians($${lonIdx}))
        + sin(radians($${latIdx})) * sin(radians(e.latitude)))) < $${params.length}
      `);
    }

    // Filter: category
    if (category) {
      params.push(category);
      whereConditions.push(`ec.slug = $${params.length}`);
    }

    // Filter: my-events (created by user)
    if (filter === 'my-events' && profileId) {
      params.push(profileId);
      whereConditions.push(`e.creator_id = $${params.length}`);
    }

    // Exclude events from users the current user has blocked
    if (profileId) {
      params.push(profileId);
      whereConditions.push(
        `NOT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $${params.length} AND blocked_id = creator.id)`
      );
    }

    // Build query
    let query: string;

    if (filter === 'joined' && profileId) {
      params.push(profileId);
      query = `
        ${baseSelect}
        JOIN event_participants ep ON e.id = ep.event_id
        WHERE ep.user_id = $${params.length}
        AND ep.status IN ('registered', 'confirmed', 'attended')
        ${whereConditions.length > 0 ? ' AND ' + whereConditions.join(' AND ') : ''}
      `;
    } else {
      query = `
        ${baseSelect}
        WHERE ${whereConditions.join(' AND ')}
      `;
    }

    // Date range filter
    if (startDate) {
      params.push(new Date(startDate));
      query += ` AND e.starts_at >= $${params.length}`;
    }

    if (endDate) {
      params.push(new Date(endDate));
      query += ` AND e.starts_at <= $${params.length}`;
    }

    // Free events only
    if (isFree === 'true') {
      query += ` AND e.is_free = TRUE`;
    }

    // Events with routes only
    if (hasRoute === 'true') {
      query += ` AND e.has_route = TRUE`;
    }

    // Order by
    const orderBy = (filter === 'nearby' && hasCoords) ? 'distance_km ASC' : 'e.starts_at ASC';

    params.push(limitNum);
    const limitIdx = params.length;
    params.push(offsetNum);
    const offsetIdx = params.length;
    query += ` ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const result = await client.query(query, params);

    // Check user participation status
    let userParticipation: Record<string, string> = {};
    if (profileId && result.rows.length > 0) {
      const eventIds = result.rows.map((r: Record<string, unknown>) => r.id);
      const participationResult = await client.query(
        `SELECT event_id, status FROM event_participants
         WHERE event_id = ANY($1) AND user_id = $2`,
        [eventIds, profileId]
      );
      userParticipation = participationResult.rows.reduce((acc: Record<string, string>, r: Record<string, unknown>) => {
        acc[r.event_id as string] = r.status as string;
        return acc;
      }, {} as Record<string, string>);
    }

    const events = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      location: {
        name: row.location_name,
        address: row.address,
        latitude: parseFloat(row.latitude as string),
        longitude: parseFloat(row.longitude as string),
      },
      distance: row.distance_km ? parseFloat((row.distance_km as number).toFixed(1)) : null,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      participants: {
        current: row.current_participants,
        max: row.max_participants,
        min: row.min_participants,
        spotsLeft: row.max_participants
          ? (row.max_participants as number) - (row.current_participants as number)
          : null,
      },
      isFree: row.is_free,
      price: row.price ? parseFloat(row.price as string) : null,
      currency: row.currency,
      isPublic: row.is_public,
      isFansOnly: row.is_fans_only,
      coverImageUrl: row.cover_image_url,
      route: row.has_route
        ? {
            distanceKm: row.route_distance_km
              ? parseFloat(row.route_distance_km as string)
              : null,
            elevationGainM: row.route_elevation_gain_m,
            difficulty: row.route_difficulty,
          }
        : null,
      status: row.status,
      viewCount: row.view_count,
      createdAt: row.created_at,
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
        icon: row.category_icon,
        color: row.category_color,
      },
      creator: {
        id: row.creator_id,
        username: row.creator_username,
        displayName: row.creator_display_name,
        avatarUrl: row.creator_avatar,
        isVerified: row.creator_verified,
      },
      userParticipation: userParticipation[row.id as string] || null,
    }));

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        filter,
        events,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          hasMore: result.rows.length === limitNum,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('List events error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to fetch events',
      }),
    });
  } finally {
    client.release();
  }
};
