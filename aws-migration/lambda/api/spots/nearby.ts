/**
 * Nearby Spots Lambda Handler
 * Returns spots near a given coordinate, sorted by distance
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { EARTH_RADIUS_METERS, MAX_SEARCH_RADIUS_METERS, DEFAULT_SEARCH_RADIUS_METERS, RATE_WINDOW_1_MIN } from '../utils/constants';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('spots-nearby');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const latParam = event.queryStringParameters?.lat;
    const lngParam = event.queryStringParameters?.lng;
    const radiusParam = event.queryStringParameters?.radius;
    const limitParam = event.queryStringParameters?.limit;

    // Validate required params
    if (!latParam || !lngParam) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'lat and lng query parameters are required' }),
      };
    }

    const lat = Number.parseFloat(latParam);
    const lng = Number.parseFloat(lngParam);

    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid latitude (must be between -90 and 90)' }),
      };
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid longitude (must be between -180 and 180)' }),
      };
    }

    const radius = Math.min(
      Math.max(Number.parseInt(radiusParam || String(DEFAULT_SEARCH_RADIUS_METERS), 10) || DEFAULT_SEARCH_RADIUS_METERS, 100),
      MAX_SEARCH_RADIUS_METERS
    );
    const limit = Math.min(Number.parseInt(limitParam || '20', 10) || 20, 50);

    // Rate limit: anti-scraping — geo queries are expensive
    const rateLimitId = event.requestContext.authorizer?.claims?.sub
      || event.requestContext.identity?.sourceIp || 'anonymous';
    const rateLimit = await checkRateLimit({
      prefix: 'spots-nearby',
      identifier: rateLimitId,
      windowSeconds: RATE_WINDOW_1_MIN,
      maxRequests: 20,
      failOpen: true,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    // Bounding box pre-filter for performance
    const latDelta = (radius / EARTH_RADIUS_METERS) * (180 / Math.PI);
    const lngDelta = latDelta / Math.cos(lat * Math.PI / 180);

    const db = await getPool();

    // Haversine distance formula in SQL
    const result = await db.query(
      `SELECT
        s.id,
        s.creator_id,
        s.name,
        s.description,
        s.category,
        s.sport_type,
        s.address,
        s.city,
        s.country,
        s.latitude,
        s.longitude,
        s.images,
        s.amenities,
        s.rating,
        s.review_count,
        s.is_verified,
        s.tags,
        s.qualities,
        s.subcategory,
        s.created_at,
        p.username AS creator_username,
        p.full_name AS creator_full_name,
        p.avatar_url AS creator_avatar_url,
        (
          ${EARTH_RADIUS_METERS} * acos(
            LEAST(1.0, cos(radians($1)) * cos(radians(s.latitude))
            * cos(radians(s.longitude) - radians($2))
            + sin(radians($1)) * sin(radians(s.latitude)))
          )
        ) AS distance
      FROM spots s
      JOIN profiles p ON s.creator_id = p.id
      WHERE s.latitude IS NOT NULL
        AND s.longitude IS NOT NULL
        AND s.latitude BETWEEN $3 AND $4
        AND s.longitude BETWEEN $5 AND $6
        AND (
        ${EARTH_RADIUS_METERS} * acos(
          LEAST(1.0, cos(radians($1)) * cos(radians(s.latitude))
          * cos(radians(s.longitude) - radians($2))
          + sin(radians($1)) * sin(radians(s.latitude)))
        )
      ) <= $7
      ORDER BY distance ASC
      LIMIT $8`,
      [
        lat, lng,
        lat - latDelta, lat + latDelta,
        lng - lngDelta, lng + lngDelta,
        radius, limit,
      ]
    );

    const spots = result.rows.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      sportType: s.sport_type,
      address: s.address,
      city: s.city,
      country: s.country,
      latitude: s.latitude,
      longitude: s.longitude,
      images: s.images || [],
      amenities: s.amenities || [],
      rating: s.rating,
      reviewCount: s.review_count,
      isVerified: s.is_verified || false,
      tags: s.tags || [],
      qualities: s.qualities || [],
      subcategory: s.subcategory,
      distance: Math.round(s.distance as number),
      createdAt: s.created_at,
      creator: {
        id: s.creator_id,
        username: s.creator_username,
        fullName: s.creator_full_name,
        avatarUrl: s.creator_avatar_url,
      },
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: spots,
      }),
    };
  } catch (error: unknown) {
    log.error('Error fetching nearby spots', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
