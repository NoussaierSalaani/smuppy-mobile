/**
 * Business Discover
 * GET /businesses/discover?category=...&lat=...&lng=...&radius=...&search=...
 * Public — search and filter businesses
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('business/discover');

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const DEFAULT_RADIUS_KM = 10;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const q = event.queryStringParameters || {};
    const category = q.category?.replace(/<[^>]*>/g, '').substring(0, 50);
    const search = q.search?.replace(/<[^>]*>/g, '').substring(0, 100);
    const lat = q.lat ? parseFloat(q.lat) : undefined;
    const lng = q.lng ? parseFloat(q.lng) : undefined;
    const radius = q.radius ? Math.min(parseFloat(q.radius), 100) : DEFAULT_RADIUS_KM;
    const limit = Math.min(parseInt(q.limit || String(DEFAULT_LIMIT)), MAX_LIMIT);
    const offset = Math.max(parseInt(q.offset || '0'), 0);

    const db = await getPool();

    // Resolve profile ID for block filtering (if authenticated)
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    let currentProfileId: string | null = null;
    if (cognitoSub) {
      const profileResult = await db.query(
        'SELECT id FROM profiles WHERE cognito_sub = $1',
        [cognitoSub]
      );
      currentProfileId = profileResult.rows[0]?.id || null;
    }

    const conditions: string[] = [
      "p.account_type IN ('business', 'pro_business')",
      "p.moderation_status NOT IN ('banned', 'shadow_banned')",
    ];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Exclude businesses from users the current user has blocked
    if (currentProfileId) {
      conditions.push(`NOT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $${paramIdx} AND blocked_id = p.id)`);
      params.push(currentProfileId);
      paramIdx++;
    }

    if (category) {
      conditions.push(`p.business_category = $${paramIdx++}`);
      params.push(category);
    }

    if (search) {
      const escapedSearch = search.replace(/[%_\\]/g, '\\$&');
      conditions.push(`(p.full_name ILIKE $${paramIdx} OR p.username ILIKE $${paramIdx} OR p.bio ILIKE $${paramIdx})`);
      params.push(`%${escapedSearch}%`);
      paramIdx++;
    }

    // Geo filter using Haversine approximation
    let distanceSelect = '';
    let orderClause = 'ORDER BY p.created_at DESC';

    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      distanceSelect = `, (
        6371 * acos(
          cos(radians($${paramIdx})) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians($${paramIdx + 1})) +
          sin(radians($${paramIdx})) * sin(radians(p.latitude))
        )
      ) as distance_km`;
      params.push(lat, lng);

      conditions.push(`p.latitude IS NOT NULL AND p.longitude IS NOT NULL`);
      conditions.push(`(
        6371 * acos(
          cos(radians($${paramIdx})) * cos(radians(p.latitude)) *
          cos(radians(p.longitude) - radians($${paramIdx + 1})) +
          sin(radians($${paramIdx})) * sin(radians(p.latitude))
        )
      ) <= $${paramIdx + 2}`);
      params.push(radius);
      paramIdx += 3;

      orderClause = 'ORDER BY distance_km ASC';
    }

    params.push(limit, offset);

    const whereClause = conditions.join(' AND ');

    const result = await db.query(
      `SELECT p.id, p.full_name, p.username, p.avatar_url, p.bio,
              p.business_category, p.business_address, p.is_verified,
              p.latitude, p.longitude
              ${distanceSelect}
       FROM profiles p
       WHERE ${whereClause}
       ${orderClause}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM profiles p WHERE ${whereClause}`,
      params.slice(0, params.length - 2) // exclude limit/offset
    );

    const businesses = result.rows.map((b: Record<string, unknown>) => ({
      id: b.id,
      name: b.full_name,
      username: b.username,
      avatarUrl: b.avatar_url,
      bio: b.bio,
      category: b.business_category,
      address: b.business_address,
      isVerified: b.is_verified,
      latitude: b.latitude,
      longitude: b.longitude,
      distanceKm: b.distance_km ? Math.round((b.distance_km as number) * 10) / 10 : undefined,
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        businesses,
        total: parseInt(countResult.rows[0]?.total || '0'),
      }),
    };
  } catch (error) {
    log.error('Failed to discover businesses', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
