/**
 * Get Spot Lambda Handler
 * Returns full spot detail by ID
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getReaderPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('spots-get');

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

    const db = await getReaderPool();

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
        s.opening_hours,
        s.contact_info,
        s.tags,
        s.qualities,
        s.subcategory,
        s.initial_rating,
        s.initial_review,
        s.created_at,
        s.updated_at,
        p.username AS creator_username,
        p.full_name AS creator_full_name,
        p.avatar_url AS creator_avatar_url,
        p.is_verified AS creator_is_verified,
        p.account_type AS creator_account_type,
        p.business_name AS creator_business_name
      FROM spots s
      JOIN profiles p ON s.creator_id = p.id
      WHERE s.id = $1`,
      [spotId]
    );

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Spot not found' }),
      };
    }

    const s = result.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        spot: {
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
          openingHours: s.opening_hours,
          contactInfo: s.contact_info,
          tags: s.tags || [],
          qualities: s.qualities || [],
          subcategory: s.subcategory,
          initialRating: s.initial_rating,
          initialReview: s.initial_review,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          creator: {
            id: s.creator_id,
            username: s.creator_username,
            fullName: s.creator_full_name,
            avatarUrl: s.creator_avatar_url,
            isVerified: s.creator_is_verified || false,
            accountType: s.creator_account_type,
            businessName: s.creator_business_name,
          },
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error getting spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
