/**
 * Update Group Lambda Handler
 * Partial update of a group (creator only)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { sanitizeInput, isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('groups-update');

const VALID_DIFFICULTIES = ['easy', 'moderate', 'hard', 'expert'];

interface UpdateGroupField {
  column: string;
  maxLength?: number;
  type: 'text' | 'number' | 'boolean' | 'date' | 'jsonb';
}

const ALLOWED_FIELDS: Record<string, UpdateGroupField> = {
  name: { column: 'name', maxLength: 255, type: 'text' },
  description: { column: 'description', maxLength: 5000, type: 'text' },
  category: { column: 'category', maxLength: 100, type: 'text' },
  subcategory: { column: 'subcategory', maxLength: 100, type: 'text' },
  sportType: { column: 'sport_type', maxLength: 100, type: 'text' },
  address: { column: 'address', maxLength: 500, type: 'text' },
  latitude: { column: 'latitude', type: 'number' },
  longitude: { column: 'longitude', type: 'number' },
  startsAt: { column: 'starts_at', type: 'date' },
  timezone: { column: 'timezone', maxLength: 50, type: 'text' },
  maxParticipants: { column: 'max_participants', type: 'number' },
  isFree: { column: 'is_free', type: 'boolean' },
  price: { column: 'price', type: 'number' },
  currency: { column: 'currency', maxLength: 10, type: 'text' },
  isPublic: { column: 'is_public', type: 'boolean' },
  isFansOnly: { column: 'is_fans_only', type: 'boolean' },
  isRoute: { column: 'is_route', type: 'boolean' },
  routeStart: { column: 'route_start', type: 'jsonb' },
  routeEnd: { column: 'route_end', type: 'jsonb' },
  routeWaypoints: { column: 'route_waypoints', type: 'jsonb' },
  routeGeojson: { column: 'route_geojson', type: 'jsonb' },
  routeProfile: { column: 'route_profile', maxLength: 50, type: 'text' },
  routeDistanceKm: { column: 'route_distance_km', type: 'number' },
  routeDurationMin: { column: 'route_duration_min', type: 'number' },
  routeElevationGain: { column: 'route_elevation_gain', type: 'number' },
  difficulty: { column: 'difficulty', maxLength: 20, type: 'text' },
  coverImageUrl: { column: 'cover_image_url', maxLength: 2000, type: 'text' },
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    // Rate limit
    const rateLimitResult = await checkRateLimit({
      prefix: 'group-update',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimitResult.allowed) {
      return cors({
        statusCode: 429,
        body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }),
      });
    }

    // Account status check
    const accountCheck = await requireActiveAccount(cognitoSub, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    const groupId = event.pathParameters?.groupId;
    if (!groupId || !isValidUUID(groupId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve profile
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    const body = JSON.parse(event.body || '{}');

    // Validate difficulty if provided
    if (body.difficulty !== undefined && body.difficulty !== null) {
      if (!VALID_DIFFICULTIES.includes(body.difficulty)) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid difficulty level. Must be one of: easy, moderate, hard, expert' }),
        });
      }
    }

    // Validate maxParticipants if provided
    if (body.maxParticipants !== undefined && body.maxParticipants !== null) {
      const maxP = Number(body.maxParticipants);
      if (isNaN(maxP) || maxP < 2 || maxP > 10000) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Max participants must be between 2 and 10000' }),
        });
      }
    }

    // Validate startsAt if provided
    if (body.startsAt !== undefined && body.startsAt !== null) {
      const startDate = new Date(body.startsAt);
      if (isNaN(startDate.getTime())) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid start date' }),
        });
      }
    }

    // Validate coordinates if provided
    if (body.latitude !== undefined && body.latitude !== null) {
      const lat = Number(body.latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid latitude' }),
        });
      }
    }
    if (body.longitude !== undefined && body.longitude !== null) {
      const lng = Number(body.longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid longitude' }),
        });
      }
    }

    // Build SET clause from allowed fields only
    const setClauses: string[] = [];
    const params: (string | number | boolean | null | Date)[] = [];
    let paramIndex = 1;

    for (const [key, config] of Object.entries(ALLOWED_FIELDS)) {
      if (body[key] === undefined) continue;

      const value = body[key];

      if (config.type === 'text') {
        if (value !== null && typeof value !== 'string') continue;
        const sanitized = value !== null ? sanitizeInput(value, config.maxLength || 255) : null;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(sanitized);
        paramIndex++;
      } else if (config.type === 'number') {
        if (value !== null && typeof value !== 'number') continue;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      } else if (config.type === 'boolean') {
        if (value !== null && typeof value !== 'boolean') continue;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      } else if (config.type === 'date') {
        if (value !== null) {
          const d = new Date(value);
          if (isNaN(d.getTime())) continue;
          setClauses.push(`${config.column} = $${paramIndex}`);
          params.push(d);
          paramIndex++;
        } else {
          setClauses.push(`${config.column} = $${paramIndex}`);
          params.push(null);
          paramIndex++;
        }
      } else if (config.type === 'jsonb') {
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(value !== null ? JSON.stringify(value) : null);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'No valid fields to update' }),
      });
    }

    // Moderate text fields (name and description)
    const textsToModerate: Array<{ key: string; value: string }> = [];
    if (body.name && typeof body.name === 'string') textsToModerate.push({ key: 'name', value: body.name });
    if (body.description && typeof body.description === 'string') textsToModerate.push({ key: 'description', value: body.description });

    for (const field of textsToModerate) {
      const filterResult = await filterText(field.value);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Group update blocked by filter', { userId: cognitoSub.substring(0, 8) + '***', field: field.key });
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }),
        });
      }
      const toxicityResult = await analyzeTextToxicity(field.value);
      if (toxicityResult.action === 'block') {
        log.warn('Group update blocked by toxicity', { userId: cognitoSub.substring(0, 8) + '***', field: field.key, category: toxicityResult.topCategory });
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }),
        });
      }
    }

    // Add updated_at
    setClauses.push('updated_at = NOW()');

    // Add groupId and profileId for WHERE clause
    params.push(groupId);
    const groupIdIndex = paramIndex;
    paramIndex++;
    params.push(profileId);
    const profileIdIndex = paramIndex;

    await client.query('BEGIN');

    // Update with ownership check
    const result = await client.query(
      `UPDATE groups
       SET ${setClauses.join(', ')}
       WHERE id = $${groupIdIndex} AND creator_id = $${profileIdIndex}
       RETURNING id, name, description, category, subcategory, sport_type,
         latitude, longitude, address, starts_at, timezone,
         max_participants, current_participants, is_free, price, currency,
         is_public, is_fans_only, is_route,
         route_start, route_end, route_waypoints, route_geojson,
         route_profile, route_distance_km, route_duration_min, route_elevation_gain,
         difficulty, cover_image_url, status, created_at, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');

      // Check if group exists at all
      const existsResult = await client.query(
        'SELECT id, creator_id FROM groups WHERE id = $1',
        [groupId]
      );
      if (existsResult.rows.length === 0) {
        return cors({
          statusCode: 404,
          body: JSON.stringify({ success: false, message: 'Group not found' }),
        });
      }
      return cors({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Not authorized to update this group' }),
      });
    }

    await client.query('COMMIT');

    const row = result.rows[0];

    // Get creator info for response
    const creatorResult = await client.query(
      'SELECT username, display_name, avatar_url, is_verified FROM profiles WHERE id = $1',
      [profileId]
    );
    const creator = creatorResult.rows[0];

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
            id: profileId,
            username: creator.username,
            displayName: creator.display_name,
            avatarUrl: creator.avatar_url,
            isVerified: creator.is_verified,
          },
        },
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Update group error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Failed to update group' }),
    });
  } finally {
    client.release();
  }
};
