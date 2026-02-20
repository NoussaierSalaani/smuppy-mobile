/**
 * List Groups Lambda Handler
 * Get groups with various filters (upcoming, nearby, my-groups, joined)
 */

import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';
import { blockExclusionSQL } from '../utils/block-filter';

export const handler = withErrorHandler('groups-list', async (event, { headers }) => {
  // Rate limit: 30 requests per minute per IP (unauthenticated) or user
  const identifier = event.requestContext.authorizer?.claims?.sub ||
                     event.requestContext.identity?.sourceIp || 'unknown';
  const rateLimitResponse = await requireRateLimit({ prefix: 'groups-list', identifier, maxRequests: 30 }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  const pool = await getPool();
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
      cursor,
    } = event.queryStringParameters || {};

    const limitNum = Math.min(Number.parseInt(limit) || 20, 50);

    // Resolve profile if authenticated
    let profileId: string | null = null;
    if (cognitoSub) {
      profileId = await resolveProfileId(client, cognitoSub);
    }

    // For my-groups and joined filters, auth is required
    if ((filter === 'my-groups' || filter === 'joined') && !profileId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    const params: SqlParam[] = [];
    const hasCoords = latitude && longitude;
    let latIdx = 0;
    let lonIdx = 0;

    if (hasCoords) {
      params.push(Number.parseFloat(latitude));
      latIdx = params.length;
      params.push(Number.parseFloat(longitude));
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
      const radiusNum = Math.max(1, Math.min(500, Number.parseFloat(radiusKm) || 50));
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

    // Exclude groups from users the current user has blocked (bidirectional)
    if (profileId) {
      params.push(profileId);
      whereConditions.push(
        blockExclusionSQL(params.length, 'creator.id').trimStart().replace(/^AND /, '')
      );
    }

    // Order by
    const isNearby = filter === 'nearby' && hasCoords;
    const orderBy = isNearby ? 'distance_km ASC' : 'g.starts_at ASC, g.id ASC';

    // Cursor-based pagination — parse cursor BEFORE building query so keyset conditions are included in WHERE
    let cursorOffset = 0;
    const MAX_OFFSET = 500;
    if (cursor) {
      if (isNearby) {
        // For nearby: cursor is a numeric offset (distance changes with position, keyset not possible)
        cursorOffset = Math.min(Math.max(0, Number.parseInt(cursor) || 0), MAX_OFFSET);
      } else {
        // For starts_at order: cursor is "ISO_DATE|UUID"
        const separatorIdx = cursor.indexOf('|');
        if (separatorIdx <= 0) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cursor format' }) };
        }
        const cursorDate = cursor.substring(0, separatorIdx);
        const cursorId = cursor.substring(separatorIdx + 1);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(cursorId) || Number.isNaN(Date.parse(cursorDate))) {
          return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cursor format' }) };
        }
        params.push(cursorDate);
        const cursorDateIdx = params.length;
        params.push(cursorId);
        const cursorIdIdx = params.length;
        whereConditions.push(`(g.starts_at, g.id) > ($${cursorDateIdx}::timestamptz, $${cursorIdIdx}::uuid)`);
      }
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

    // Fetch one extra row to detect hasMore
    params.push(limitNum + 1);
    const limitIdx = params.length;

    if (isNearby && cursorOffset > 0) {
      params.push(cursorOffset);
      const offsetIdx = params.length;
      query += ` ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    } else {
      query += ` ORDER BY ${orderBy} LIMIT $${limitIdx}`;
    }

    const result = await client.query(query, params);

    // Detect hasMore from extra row
    const hasMore = result.rows.length > limitNum;
    const rows = hasMore ? result.rows.slice(0, limitNum) : result.rows;

    // Compute nextCursor from last row
    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const lastRow = rows.at(-1)!;
      if (isNearby) {
        nextCursor = String(cursorOffset + limitNum);
      } else {
        const startsAtStr = lastRow.starts_at instanceof Date
          ? lastRow.starts_at.toISOString()
          : String(lastRow.starts_at);
        nextCursor = `${startsAtStr}|${lastRow.id}`;
      }
    }

    const groups = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      subcategory: row.subcategory,
      sportType: row.sport_type,
      latitude: Number.parseFloat(row.latitude as string),
      longitude: Number.parseFloat(row.longitude as string),
      address: row.address,
      distance: row.distance_km ? Number.parseFloat((row.distance_km as number).toFixed(1)) : null,
      startsAt: row.starts_at,
      timezone: row.timezone,
      maxParticipants: row.max_participants,
      currentParticipants: row.current_participants,
      spotsLeft: row.max_participants
        ? (row.max_participants as number) - (row.current_participants as number)
        : null,
      isFree: row.is_free,
      price: row.price ? Number.parseFloat(row.price as string) : null,
      currency: row.currency,
      isPublic: row.is_public,
      isFansOnly: row.is_fans_only,
      isRoute: row.is_route,
      routeStart: row.route_start,
      routeEnd: row.route_end,
      routeWaypoints: row.route_waypoints,
      routeGeojson: row.route_geojson,
      routeProfile: row.route_profile,
      routeDistanceKm: row.route_distance_km ? Number.parseFloat(row.route_distance_km as string) : null,
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        groups,
        pagination: {
          limit: limitNum,
          hasMore,
          nextCursor,
        },
      }),
    };
  } finally {
    client.release();
  }
});
