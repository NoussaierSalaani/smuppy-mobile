/**
 * List Spots Lambda Handler
 * Returns spots with pagination and optional filters
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('spots-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10) || 20, 50);
    const cursor = event.queryStringParameters?.cursor;
    const creatorId = event.queryStringParameters?.creatorId;
    const category = event.queryStringParameters?.category;
    const sportType = event.queryStringParameters?.sportType;

    const db = await getReaderPool();

    let query = `
      SELECT
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
        s.created_at,
        p.username AS creator_username,
        p.full_name AS creator_full_name,
        p.avatar_url AS creator_avatar_url
      FROM spots s
      JOIN profiles p ON s.creator_id = p.id
      WHERE 1=1
    `;

    const params: SqlParam[] = [];
    let paramIndex = 1;

    if (creatorId && isValidUUID(creatorId)) {
      query += ` AND s.creator_id = $${paramIndex}`;
      params.push(creatorId);
      paramIndex++;
    }

    if (category && typeof category === 'string') {
      query += ` AND s.category = $${paramIndex}`;
      params.push(category.slice(0, 100));
      paramIndex++;
    }

    if (sportType && typeof sportType === 'string') {
      query += ` AND s.sport_type = $${paramIndex}`;
      params.push(sportType.slice(0, 100));
      paramIndex++;
    }

    if (cursor) {
      query += ` AND s.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor, 10)));
      paramIndex++;
    }

    query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const spots = hasMore ? result.rows.slice(0, -1) : result.rows;

    const formattedSpots = spots.map((s: Record<string, unknown>) => ({
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
      createdAt: s.created_at,
      creator: {
        id: s.creator_id,
        username: s.creator_username,
        fullName: s.creator_full_name,
        avatarUrl: s.creator_avatar_url,
      },
    }));

    const nextCursor = hasMore && spots.length > 0
      ? new Date(spots[spots.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: formattedSpots,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing spots', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
