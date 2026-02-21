/**
 * List Spots Lambda Handler
 * Returns spots with pagination and optional filters
 */

import { getPool, SqlParam } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { parseLimit, applyHasMore } from '../utils/pagination';
import { parseCursor, cursorToSql, generateCursor } from '../utils/cursor';

export const handler = withErrorHandler('spots-list', async (event, { headers }) => {
  const limit = parseLimit(event.queryStringParameters?.limit);
  const cursor = event.queryStringParameters?.cursor;
  const creatorId = event.queryStringParameters?.creatorId;
  const category = event.queryStringParameters?.category;
  const sportType = event.queryStringParameters?.sportType;

  const db = await getPool();

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

  const parsedCursor = parseCursor(cursor, 'timestamp-ms');
  if (parsedCursor) {
    const cursorSql = cursorToSql(parsedCursor, 's.created_at', paramIndex);
    query += cursorSql.condition;
    params.push(...cursorSql.params);
    paramIndex += cursorSql.params.length;
  }

  query += ` ORDER BY s.created_at DESC LIMIT $${paramIndex}`;
  params.push(limit + 1);

  const result = await db.query(query, params);

  const { data: spots, hasMore } = applyHasMore(result.rows, limit);

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
    creator: {
      id: s.creator_id,
      username: s.creator_username,
      fullName: s.creator_full_name,
      avatarUrl: s.creator_avatar_url,
    },
  }));

  const nextCursor = hasMore && spots.length > 0
    ? generateCursor('timestamp-ms', spots.at(-1)! as Record<string, unknown>)
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
