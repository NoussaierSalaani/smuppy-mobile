/**
 * Update Spot Lambda Handler
 * Partial update of a spot (owner only)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('spots-update');

const ALLOWED_FIELDS: Record<string, { column: string; maxLength?: number; type: string }> = {
  name: { column: 'name', maxLength: 255, type: 'text' },
  description: { column: 'description', maxLength: 5000, type: 'text' },
  category: { column: 'category', maxLength: 100, type: 'text' },
  sportType: { column: 'sport_type', maxLength: 100, type: 'text' },
  address: { column: 'address', maxLength: 500, type: 'text' },
  city: { column: 'city', maxLength: 100, type: 'text' },
  country: { column: 'country', maxLength: 100, type: 'text' },
  latitude: { column: 'latitude', type: 'number' },
  longitude: { column: 'longitude', type: 'number' },
  images: { column: 'images', type: 'text[]' },
  amenities: { column: 'amenities', type: 'text[]' },
  openingHours: { column: 'opening_hours', type: 'jsonb' },
  contactInfo: { column: 'contact_info', type: 'jsonb' },
  subcategory: { column: 'subcategory', maxLength: 100, type: 'text' },
  tags: { column: 'tags', type: 'text[]' },
  qualities: { column: 'qualities', type: 'text[]' },
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    // Account status check
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    const rateLimitResponse = await requireRateLimit({ prefix: 'spot-update', identifier: userId, windowSeconds: 60, maxRequests: 10 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    const spotId = event.pathParameters?.id;
    if (!spotId || !isValidUUID(spotId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid spot ID format' }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};

    // Build SET clause from allowed fields only
    const setClauses: string[] = [];
    const params: SqlParam[] = [];
    let paramIndex = 1;

    for (const [key, config] of Object.entries(ALLOWED_FIELDS)) {
      if (body[key] === undefined) continue;

      const value = body[key];

      if (config.type === 'text') {
        if (value !== null && typeof value !== 'string') continue;
        const sanitized = value !== null ? sanitizeText(value, config.maxLength) : null;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(sanitized);
        paramIndex++;
      } else if (config.type === 'number') {
        if (value !== null && typeof value !== 'number') continue;
        if (config.column === 'latitude' && value !== null && (value < -90 || value > 90)) continue;
        if (config.column === 'longitude' && value !== null && (value < -180 || value > 180)) continue;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      } else if (config.type === 'text[]') {
        if (value !== null && !Array.isArray(value)) continue;
        const sanitized = value !== null ? value.map((v: string) => sanitizeText(v, 2000)) : null;
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(sanitized);
        paramIndex++;
      } else if (config.type === 'jsonb') {
        setClauses.push(`${config.column} = $${paramIndex}`);
        params.push(value !== null ? JSON.stringify(value) : null);
        paramIndex++;
      }
    }

    // Moderate text fields (name and description)
    const textFieldsToModerate: Array<{ key: string; value: string }> = [];
    if (body.name && typeof body.name === 'string') textFieldsToModerate.push({ key: 'name', value: body.name });
    if (body.description && typeof body.description === 'string') textFieldsToModerate.push({ key: 'description', value: body.description });

    for (const field of textFieldsToModerate) {
      const filterResult = await filterText(field.value);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Spot update blocked by filter', { userId: userId.substring(0, 8) + '***', field: field.key });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: `Your spot ${field.key} contains content that violates our community guidelines.` }),
        };
      }
      const toxicityResult = await analyzeTextToxicity(field.value);
      if (toxicityResult.action === 'block') {
        log.warn('Spot update blocked by toxicity', { userId: userId.substring(0, 8) + '***', field: field.key });
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: `Your spot ${field.key} contains content that violates our community guidelines.` }),
        };
      }
    }

    if (setClauses.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'No valid fields to update' }),
      };
    }

    // Add updated_at
    setClauses.push(`updated_at = NOW()`);

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    // Update with ownership check
    params.push(spotId);
    const spotIdIndex = paramIndex;
    paramIndex++;
    params.push(profileId);
    const profileIdIndex = paramIndex;

    const result = await db.query(
      `UPDATE spots
       SET ${setClauses.join(', ')}
       WHERE id = $${spotIdIndex} AND creator_id = $${profileIdIndex}
       RETURNING id, creator_id, name, description, category, sport_type,
         address, city, country, latitude, longitude,
         images, amenities, rating, review_count, is_verified,
         opening_hours, contact_info, created_at, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      // Check if spot exists at all
      const existsResult = await db.query(
        'SELECT id FROM spots WHERE id = $1',
        [spotId]
      );
      if (existsResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Spot not found' }),
        };
      }
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to update this spot' }),
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
          updatedAt: s.updated_at,
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error updating spot', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
