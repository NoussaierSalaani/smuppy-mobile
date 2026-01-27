/**
 * Create Event Lambda Handler
 * Create a sports/fitness event on the map
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

interface CreateEventRequest {
  title: string;
  description?: string;
  categorySlug: string;
  locationName: string;
  address?: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt?: string;
  timezone?: string;
  maxParticipants?: number;
  minParticipants?: number;
  isFree?: boolean;
  price?: number;
  currency?: string;
  isPublic?: boolean;
  isFansOnly?: boolean;
  coverImageUrl?: string;
  images?: string[];
  // Route for running/hiking/cycling
  hasRoute?: boolean;
  routeDistanceKm?: number;
  routeElevationGainM?: number;
  routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  routePolyline?: string;
  routeWaypoints?: { lat: number; lng: number; name?: string }[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const body: CreateEventRequest = JSON.parse(event.body || '{}');
    const {
      title,
      description,
      categorySlug,
      locationName,
      address,
      latitude,
      longitude,
      startsAt,
      endsAt,
      timezone = 'UTC',
      maxParticipants,
      minParticipants = 1,
      isFree = true,
      price,
      currency = 'EUR',
      isPublic = true,
      isFansOnly = false,
      coverImageUrl,
      images,
      hasRoute = false,
      routeDistanceKm,
      routeElevationGainM,
      routeDifficulty,
      routePolyline,
      routeWaypoints,
    } = body;

    // Validation
    if (!title || !categorySlug || !locationName || !latitude || !longitude || !startsAt) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Title, category, location, and start date are required',
        }),
      });
    }

    // Get category
    const categoryResult = await client.query(
      `SELECT id, name, icon, color FROM event_categories WHERE slug = $1 AND is_active = TRUE`,
      [categorySlug]
    );

    if (categoryResult.rows.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid category' }),
      });
    }

    const category = categoryResult.rows[0];

    // Validate date
    const startDate = new Date(startsAt);
    if (startDate < new Date()) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Event start date must be in the future',
        }),
      });
    }

    // Validate price if not free
    if (!isFree && (!price || price <= 0)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Price is required for paid events',
        }),
      });
    }

    await client.query('BEGIN');

    // Create event
    const eventResult = await client.query(
      `INSERT INTO events (
        creator_id, title, description, category_id,
        location_name, address, latitude, longitude,
        starts_at, ends_at, timezone,
        max_participants, min_participants,
        is_free, price, currency,
        is_public, is_fans_only,
        cover_image_url, images,
        has_route, route_distance_km, route_elevation_gain_m,
        route_difficulty, route_polyline, route_waypoints
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      RETURNING *`,
      [
        userId,
        title,
        description,
        category.id,
        locationName,
        address,
        latitude,
        longitude,
        startDate,
        endsAt ? new Date(endsAt) : null,
        timezone,
        maxParticipants,
        minParticipants,
        isFree,
        !isFree ? price : null,
        currency,
        isPublic,
        isFansOnly,
        coverImageUrl,
        images || [],
        hasRoute,
        routeDistanceKm,
        routeElevationGainM,
        routeDifficulty,
        routePolyline,
        routeWaypoints ? JSON.stringify(routeWaypoints) : null,
      ]
    );

    const createdEvent = eventResult.rows[0];

    // Auto-register creator as first participant
    await client.query(
      `INSERT INTO event_participants (event_id, user_id, status)
       VALUES ($1, $2, 'confirmed')`,
      [createdEvent.id, userId]
    );

    // Update participant count
    await client.query(
      `UPDATE events SET current_participants = 1 WHERE id = $1`,
      [createdEvent.id]
    );

    await client.query('COMMIT');

    // Get creator info
    const creatorResult = await client.query(
      `SELECT username, display_name, avatar_url, is_verified
       FROM profiles WHERE id = $1`,
      [userId]
    );

    const creator = creatorResult.rows[0];

    return cors({
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        event: {
          id: createdEvent.id,
          title: createdEvent.title,
          description: createdEvent.description,
          category: {
            id: category.id,
            name: category.name,
            slug: categorySlug,
            icon: category.icon,
            color: category.color,
          },
          location: {
            name: createdEvent.location_name,
            address: createdEvent.address,
            latitude: parseFloat(createdEvent.latitude),
            longitude: parseFloat(createdEvent.longitude),
          },
          startsAt: createdEvent.starts_at,
          endsAt: createdEvent.ends_at,
          timezone: createdEvent.timezone,
          maxParticipants: createdEvent.max_participants,
          minParticipants: createdEvent.min_participants,
          currentParticipants: 1,
          isFree: createdEvent.is_free,
          price: createdEvent.price ? parseFloat(createdEvent.price) : null,
          currency: createdEvent.currency,
          isPublic: createdEvent.is_public,
          isFansOnly: createdEvent.is_fans_only,
          coverImageUrl: createdEvent.cover_image_url,
          images: createdEvent.images,
          route: createdEvent.has_route
            ? {
                distanceKm: createdEvent.route_distance_km
                  ? parseFloat(createdEvent.route_distance_km)
                  : null,
                elevationGainM: createdEvent.route_elevation_gain_m,
                difficulty: createdEvent.route_difficulty,
                polyline: createdEvent.route_polyline,
                waypoints: createdEvent.route_waypoints,
              }
            : null,
          status: createdEvent.status,
          createdAt: createdEvent.created_at,
          creator: {
            id: userId,
            username: creator.username,
            displayName: creator.display_name,
            avatarUrl: creator.avatar_url,
            isVerified: creator.is_verified,
          },
        },
      }),
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create event error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Failed to create event',
      }),
    });
  } finally {
    client.release();
  }
};
