/**
 * Create Spot Lambda Handler
 * Creates a new spot location
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { sanitizeText } from '../utils/security';

const log = createLogger('spots-create');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'spot-create',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid JSON' }) };
    }

    const {
      name, description, category, sport_type,
      address, city, country, latitude, longitude,
      images, amenities, opening_hours, contact_info,
      tags, qualities, subcategory, initial_rating, initial_review,
    } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Name is required' }),
      };
    }

    // Validate latitude/longitude if provided
    if (latitude !== undefined && (typeof latitude !== 'number' || latitude < -90 || latitude > 90)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid latitude (must be between -90 and 90)' }),
      };
    }
    if (longitude !== undefined && (typeof longitude !== 'number' || longitude < -180 || longitude > 180)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid longitude (must be between -180 and 180)' }),
      };
    }

    // Validate arrays
    if (images !== undefined && !Array.isArray(images)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Images must be an array' }),
      };
    }
    if (amenities !== undefined && !Array.isArray(amenities)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Amenities must be an array' }),
      };
    }

    // Validate tags array
    if (tags !== undefined && !Array.isArray(tags)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Tags must be an array' }),
      };
    }

    // Validate qualities array
    if (qualities !== undefined && !Array.isArray(qualities)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Qualities must be an array' }),
      };
    }

    // Validate subcategory
    if (subcategory !== undefined && typeof subcategory !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Subcategory must be a string' }),
      };
    }

    // Validate initial_rating (1-5 integer)
    if (initial_rating !== undefined) {
      if (typeof initial_rating !== 'number' || !Number.isInteger(initial_rating) || initial_rating < 1 || initial_rating > 5) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Initial rating must be an integer between 1 and 5' }),
        };
      }
    }

    // Validate initial_review
    if (initial_review !== undefined && typeof initial_review !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Initial review must be a string' }),
      };
    }

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Sanitize text inputs
    const sanitizedName = sanitizeText(name, 255);
    const sanitizedDescription = description ? sanitizeText(description, 5000) : null;
    const sanitizedCategory = category ? sanitizeText(category, 100) : null;
    const sanitizedSportType = sport_type ? sanitizeText(sport_type, 100) : null;
    const sanitizedAddress = address ? sanitizeText(address, 500) : null;
    const sanitizedCity = city ? sanitizeText(city, 100) : null;
    const sanitizedCountry = country ? sanitizeText(country, 100) : null;
    const sanitizedImages = images ? images.map((img: string) => sanitizeText(img, 2000)) : null;
    const sanitizedAmenities = amenities ? amenities.map((a: string) => sanitizeText(a, 100)) : null;
    // NOTE: The columns tags, qualities, subcategory, initial_rating, initial_review do not exist in the spots table yet.
    // A database migration is required to add these columns before using them in the INSERT statement.
    // After running the migration, rename these to remove underscore prefix and add to INSERT/RETURNING.
    // Migration needed:
    //   ALTER TABLE spots ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
    //   ALTER TABLE spots ADD COLUMN IF NOT EXISTS qualities TEXT[] DEFAULT '{}';
    //   ALTER TABLE spots ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100);
    //   ALTER TABLE spots ADD COLUMN IF NOT EXISTS initial_rating INTEGER CHECK (initial_rating >= 1 AND initial_rating <= 5);
    //   ALTER TABLE spots ADD COLUMN IF NOT EXISTS initial_review TEXT;
    const _sanitizedTags = tags ? tags.map((t: string) => sanitizeText(t, 100)) : null;
    const _sanitizedQualities = qualities ? qualities.map((q: string) => sanitizeText(q, 100)) : null;
    const _sanitizedSubcategory = subcategory ? sanitizeText(subcategory, 100) : null;
    const _sanitizedInitialRating = initial_rating ?? null;
    const _sanitizedInitialReview = initial_review ? sanitizeText(initial_review, 5000) : null;
    // Suppress unused variable warnings - these are prepared for post-migration use
    void _sanitizedTags;
    void _sanitizedQualities;
    void _sanitizedSubcategory;
    void _sanitizedInitialRating;
    void _sanitizedInitialReview;

    const result = await db.query(
      `INSERT INTO spots (
        creator_id, name, description, category, sport_type,
        address, city, country, latitude, longitude,
        images, amenities, opening_hours, contact_info
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, creator_id, name, description, category, sport_type,
        address, city, country, latitude, longitude,
        images, amenities, rating, review_count, is_verified,
        opening_hours, contact_info, created_at`,
      [
        profileId, sanitizedName, sanitizedDescription, sanitizedCategory, sanitizedSportType,
        sanitizedAddress, sanitizedCity, sanitizedCountry,
        latitude ?? null, longitude ?? null,
        sanitizedImages, sanitizedAmenities,
        opening_hours ? JSON.stringify(opening_hours) : null,
        contact_info ? JSON.stringify(contact_info) : null,
      ]
    );

    const s = result.rows[0];

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        spot: {
          id: s.id,
          creatorId: s.creator_id,
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
          createdAt: s.created_at,
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error creating spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
