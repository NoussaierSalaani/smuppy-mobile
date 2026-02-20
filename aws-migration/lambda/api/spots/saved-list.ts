/**
 * Saved Spots List Lambda Handler
 * Returns the current user's saved spots with pagination
 */

import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('spots-saved-list', async (event, { headers }) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  const limit = Math.min(Number.parseInt(event.queryStringParameters?.limit || '20', 10) || 20, 50);
  const cursor = event.queryStringParameters?.cursor;

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
      s.tags,
      s.qualities,
      s.subcategory,
      s.created_at,
      ss.created_at AS saved_at,
      p.username AS creator_username,
      p.full_name AS creator_full_name,
      p.avatar_url AS creator_avatar_url
    FROM saved_spots ss
    JOIN spots s ON ss.spot_id = s.id
    JOIN profiles p ON s.creator_id = p.id
    WHERE ss.user_id = $1
  `;

  const params: SqlParam[] = [profileId];
  let paramIndex = 2;

  if (cursor) {
    query += ` AND ss.created_at < $${paramIndex}`;
    params.push(new Date(Number.parseInt(cursor, 10)));
    paramIndex++;
  }

  query += ` ORDER BY ss.created_at DESC LIMIT $${paramIndex}`;
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
    isVerified: !!s.is_verified,
    tags: s.tags || [],
    qualities: s.qualities || [],
    subcategory: s.subcategory,
    createdAt: s.created_at,
    savedAt: s.saved_at,
    creator: {
      id: s.creator_id,
      username: s.creator_username,
      fullName: s.creator_full_name,
      avatarUrl: s.creator_avatar_url,
    },
  }));

  const nextCursor = hasMore && spots.length > 0
    ? new Date(spots.at(-1)!.saved_at).getTime().toString()
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
});
