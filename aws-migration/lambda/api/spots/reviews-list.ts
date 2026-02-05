/**
 * List Spot Reviews Lambda Handler
 * Returns reviews for a spot with pagination
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('spots-reviews-list');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const spotId = event.pathParameters?.id;
    if (!spotId || !isValidUUID(spotId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid spot ID format' }),
      };
    }

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '20', 10) || 20, 50);
    const cursor = event.queryStringParameters?.cursor;

    const db = await getReaderPool();

    let query = `
      SELECT
        sr.id,
        sr.spot_id,
        sr.user_id,
        sr.rating,
        sr.comment,
        sr.images,
        sr.created_at,
        sr.updated_at,
        p.username AS user_username,
        p.full_name AS user_full_name,
        p.avatar_url AS user_avatar_url,
        p.is_verified AS user_is_verified
      FROM spot_reviews sr
      JOIN profiles p ON sr.user_id = p.id
      WHERE sr.spot_id = $1
    `;

    const params: SqlParam[] = [spotId];
    let paramIndex = 2;

    if (cursor) {
      query += ` AND sr.created_at < $${paramIndex}`;
      params.push(new Date(parseInt(cursor, 10)));
      paramIndex++;
    }

    query += ` ORDER BY sr.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit + 1);

    const result = await db.query(query, params);

    const hasMore = result.rows.length > limit;
    const reviews = hasMore ? result.rows.slice(0, -1) : result.rows;

    const formattedReviews = reviews.map((r: Record<string, unknown>) => ({
      id: r.id,
      spotId: r.spot_id,
      rating: r.rating,
      comment: r.comment,
      images: (r.images as unknown[]) || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      user: {
        id: r.user_id,
        username: r.user_username,
        fullName: r.user_full_name,
        avatarUrl: r.user_avatar_url,
        isVerified: r.user_is_verified || false,
      },
    }));

    const nextCursor = hasMore && reviews.length > 0
      ? new Date(reviews[reviews.length - 1].created_at).getTime().toString()
      : null;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: formattedReviews,
        nextCursor,
        hasMore,
      }),
    };
  } catch (error: unknown) {
    log.error('Error listing spot reviews', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
