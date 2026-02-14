/**
 * Get Event Lambda Handler
 * Get a single event by ID with creator info and user participation status
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('events-get');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getReaderPool();
  const client = await pool.connect();

  try {
    const eventId = event.pathParameters?.eventId;
    if (!eventId || !isValidUUID(eventId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Optionally resolve authenticated user
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
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

    // Fetch event with creator info, excluding banned/shadow_banned creators
    const result = await client.query(
      `SELECT
        e.id,
        e.title,
        e.description,
        e.category_slug,
        e.category_name,
        e.category_icon,
        e.category_color,
        e.location_name,
        e.address,
        e.latitude,
        e.longitude,
        e.starts_at,
        e.ends_at,
        e.timezone,
        e.max_participants,
        e.current_participants,
        e.is_free,
        e.price,
        e.currency,
        e.is_public,
        e.is_fans_only,
        e.status,
        e.cover_image_url,
        e.images,
        e.has_route,
        e.route_distance_km,
        e.route_difficulty,
        e.route_waypoints,
        e.route_polyline,
        e.created_at,
        e.updated_at,
        creator.id AS creator_id,
        creator.username AS creator_username,
        creator.display_name AS creator_display_name,
        creator.avatar_url AS creator_avatar_url,
        creator.is_verified AS creator_is_verified
      FROM events e
      JOIN profiles creator ON e.creator_id = creator.id
      WHERE e.id = $1
        AND creator.moderation_status NOT IN ('banned', 'shadow_banned')`,
      [eventId]
    );

    if (result.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Event not found' }),
      });
    }

    const row = result.rows[0];

    // Check user participation status if authenticated
    let userParticipation: string | null = null;
    if (profileId) {
      const participationResult = await client.query(
        `SELECT status FROM event_participants
         WHERE event_id = $1 AND user_id = $2`,
        [eventId, profileId]
      );
      if (participationResult.rows.length > 0) {
        userParticipation = participationResult.rows[0].status;
      }
    }

    const isCreator = profileId !== null && profileId === row.creator_id;

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        event: {
          id: row.id,
          title: row.title,
          description: row.description,
          category: {
            slug: row.category_slug,
            name: row.category_name,
            icon: row.category_icon,
            color: row.category_color,
          },
          location: {
            name: row.location_name,
            address: row.address,
            latitude: parseFloat(row.latitude),
            longitude: parseFloat(row.longitude),
          },
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          timezone: row.timezone,
          maxParticipants: row.max_participants,
          currentParticipants: row.current_participants,
          isFree: row.is_free,
          price: row.price ? parseFloat(row.price) : null,
          currency: row.currency,
          isPublic: row.is_public,
          isFansOnly: row.is_fans_only,
          status: row.status,
          coverImageUrl: row.cover_image_url,
          images: row.images,
          route: row.has_route
            ? {
                distanceKm: row.route_distance_km
                  ? parseFloat(row.route_distance_km)
                  : null,
                difficulty: row.route_difficulty,
                waypoints: row.route_waypoints,
                polyline: row.route_polyline,
              }
            : null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          creator: {
            id: row.creator_id,
            username: row.creator_username,
            displayName: row.creator_display_name,
            avatarUrl: row.creator_avatar_url,
            isVerified: row.creator_is_verified,
          },
          isCreator,
          userParticipation,
        },
      }),
    });
  } catch (error: unknown) {
    log.error('Get event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to fetch event',
      }),
    });
  } finally {
    client.release();
  }
};
