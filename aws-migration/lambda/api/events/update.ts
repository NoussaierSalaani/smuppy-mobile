/**
 * Update Event Lambda Handler
 * Update an existing event (creator only)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID, sanitizeText } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('events-update');

interface UpdateEventRequest {
  title?: string;
  description?: string;
  locationName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  maxParticipants?: number;
  isFree?: boolean;
  price?: number;
  currency?: string;
  isPublic?: boolean;
  isFansOnly?: boolean;
  coverImageUrl?: string;
  images?: string[];
  hasRoute?: boolean;
  routeDistanceKm?: number;
  routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  routePolyline?: string;
  routeWaypoints?: { lat: number; lng: number; name?: string }[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const { allowed } = await checkRateLimit({ prefix: 'event-update', identifier: userId, windowSeconds: 60, maxRequests: 10 });
    if (!allowed) {
      return cors({ statusCode: 429, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) });
    }

    // Account status check (suspended/banned users cannot update events)
    const accountCheck = await requireActiveAccount(userId, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    const eventId = event.pathParameters?.eventId;
    if (!eventId || !isValidUUID(eventId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve cognito_sub to profile ID
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    const body: UpdateEventRequest = JSON.parse(event.body || '{}');

    // Validate fields if provided
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Title cannot be empty' }),
        });
      }
      if (body.title.length > 200) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Title too long (max 200 characters)' }),
        });
      }
    }

    if (body.maxParticipants !== undefined && (body.maxParticipants < 2 || body.maxParticipants > 10000)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Max participants must be between 2 and 10000' }),
      });
    }

    if (body.latitude !== undefined || body.longitude !== undefined) {
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Invalid coordinates' }),
        });
      }
    }

    if (body.startsAt !== undefined) {
      const startDate = new Date(body.startsAt);
      if (startDate < new Date()) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Event start date must be in the future' }),
        });
      }
    }

    // Sanitize text fields
    const sanitizedTitle = body.title !== undefined ? sanitizeText(body.title, 200) : undefined;
    const sanitizedDescription = body.description !== undefined ? sanitizeText(body.description, 5000) : undefined;
    const sanitizedLocationName = body.locationName !== undefined ? sanitizeText(body.locationName, 500) : undefined;
    const sanitizedAddress = body.address !== undefined ? sanitizeText(body.address, 500) : undefined;

    // Moderation: check title and description for violations
    const textsToCheck = [sanitizedTitle, sanitizedDescription].filter(Boolean) as string[];
    for (const text of textsToCheck) {
      const filterResult = await filterText(text);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Event update text blocked by filter', { userId: userId.substring(0, 8) + '***', severity: filterResult.severity });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
      const toxicityResult = await analyzeTextToxicity(text);
      if (toxicityResult.action === 'block') {
        log.warn('Event update text blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
    }

    // Ownership check: verify event exists and belongs to the user
    const ownerCheck = await client.query(
      `SELECT id, status FROM events WHERE id = $1 AND creator_id = $2`,
      [eventId, profileId]
    );
    if (ownerCheck.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found or you are not the creator' }),
      });
    }

    if (ownerCheck.rows[0].status === 'cancelled') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Cannot update a cancelled event' }),
      });
    }

    // Build dynamic UPDATE query with only provided fields
    const setClauses: string[] = [];
    const params: (string | number | boolean | Date | string[] | null)[] = [];
    let paramIndex = 0;

    const addField = (column: string, value: string | number | boolean | Date | string[] | null) => {
      paramIndex++;
      setClauses.push(`${column} = $${paramIndex}`);
      params.push(value);
    };

    if (sanitizedTitle !== undefined) addField('title', sanitizedTitle);
    if (sanitizedDescription !== undefined) addField('description', sanitizedDescription);
    if (sanitizedLocationName !== undefined) addField('location_name', sanitizedLocationName);
    if (sanitizedAddress !== undefined) addField('address', sanitizedAddress);
    if (body.latitude !== undefined) addField('latitude', body.latitude);
    if (body.longitude !== undefined) addField('longitude', body.longitude);
    if (body.startsAt !== undefined) addField('starts_at', new Date(body.startsAt));
    if (body.endsAt !== undefined) addField('ends_at', body.endsAt ? new Date(body.endsAt) : null);
    if (body.timezone !== undefined) addField('timezone', body.timezone);
    if (body.maxParticipants !== undefined) addField('max_participants', body.maxParticipants);
    if (body.isFree !== undefined) addField('is_free', body.isFree);
    if (body.price !== undefined) addField('price', body.price);
    if (body.currency !== undefined) addField('currency', body.currency);
    if (body.isPublic !== undefined) addField('is_public', body.isPublic);
    if (body.isFansOnly !== undefined) addField('is_fans_only', body.isFansOnly);
    if (body.coverImageUrl !== undefined) addField('cover_image_url', body.coverImageUrl);
    if (body.images !== undefined) addField('images', body.images);
    if (body.hasRoute !== undefined) addField('has_route', body.hasRoute);
    if (body.routeDistanceKm !== undefined) addField('route_distance_km', body.routeDistanceKm);
    if (body.routeDifficulty !== undefined) addField('route_difficulty', body.routeDifficulty);
    if (body.routePolyline !== undefined) addField('route_polyline', body.routePolyline);
    if (body.routeWaypoints !== undefined) addField('route_waypoints', body.routeWaypoints ? JSON.stringify(body.routeWaypoints) : null);

    // Always update updated_at
    paramIndex++;
    setClauses.push(`updated_at = $${paramIndex}`);
    params.push(new Date());

    if (setClauses.length === 1) {
      // Only updated_at was added — no actual fields to update
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'No fields to update' }),
      });
    }

    // Add eventId and creatorId as final params for the WHERE clause
    paramIndex++;
    const eventIdIdx = paramIndex;
    params.push(eventId);

    paramIndex++;
    const creatorIdIdx = paramIndex;
    params.push(profileId);

    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE events SET ${setClauses.join(', ')}
       WHERE id = $${eventIdIdx} AND creator_id = $${creatorIdIdx}
       RETURNING id, title, description, location_name, address, latitude, longitude,
                 starts_at, ends_at, timezone, max_participants, current_participants,
                 is_free, price, currency, is_public, is_fans_only,
                 cover_image_url, images, has_route, route_distance_km, route_difficulty,
                 route_polyline, route_waypoints, status, created_at, updated_at`,
      params
    );

    await client.query('COMMIT');

    if (updateResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found or you are not the creator' }),
      });
    }

    const updated = updateResult.rows[0];

    // Get creator info for response
    const creatorResult = await client.query(
      `SELECT username, display_name, avatar_url, is_verified
       FROM profiles WHERE id = $1`,
      [profileId]
    );
    const creator = creatorResult.rows[0];

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Event updated successfully',
        event: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          location: {
            name: updated.location_name,
            address: updated.address,
            latitude: parseFloat(updated.latitude),
            longitude: parseFloat(updated.longitude),
          },
          startsAt: updated.starts_at,
          endsAt: updated.ends_at,
          timezone: updated.timezone,
          maxParticipants: updated.max_participants,
          currentParticipants: updated.current_participants,
          isFree: updated.is_free,
          price: updated.price ? parseFloat(updated.price) : null,
          currency: updated.currency,
          isPublic: updated.is_public,
          isFansOnly: updated.is_fans_only,
          coverImageUrl: updated.cover_image_url,
          images: updated.images,
          route: updated.has_route
            ? {
                distanceKm: updated.route_distance_km
                  ? parseFloat(updated.route_distance_km)
                  : null,
                difficulty: updated.route_difficulty,
                polyline: updated.route_polyline,
                waypoints: updated.route_waypoints,
              }
            : null,
          status: updated.status,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
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
    log.error('Update event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to update event',
      }),
    });
  } finally {
    client.release();
  }
};
