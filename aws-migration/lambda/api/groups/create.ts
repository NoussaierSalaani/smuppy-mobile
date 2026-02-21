/**
 * Create Group Lambda Handler
 * Create a sports/fitness activity group on the map
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { sanitizeInput } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateTexts } from '../utils/text-moderation';

interface CreateGroupRequest {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  sport_type?: string;
  latitude: number;
  longitude: number;
  address?: string;
  starts_at: string;
  timezone?: string;
  max_participants?: number;
  is_free?: boolean;
  price?: number;
  currency?: string;
  is_public?: boolean;
  is_fans_only?: boolean;
  is_route?: boolean;
  route_start?: Record<string, unknown>;
  route_end?: Record<string, unknown>;
  route_waypoints?: Record<string, unknown>;
  route_geojson?: Record<string, unknown>;
  route_profile?: string;
  route_distance_km?: number;
  route_duration_min?: number;
  route_elevation_gain?: number;
  difficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  cover_image_url?: string;
}

export const handler = withAuthHandler('groups-create', async (event, { headers, log, cognitoSub, profileId, db }) => {
  const client = await db.connect();

  try {
    // Rate limit
    const rateLimitResponse = await requireRateLimit({
      prefix: 'groups-create',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 5,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check (suspended/banned users cannot create groups)
    const accountCheck = await requireActiveAccount(cognitoSub, {});
    if (isAccountError(accountCheck)) {
      return { statusCode: accountCheck.statusCode, headers, body: accountCheck.body };
    }

    // Resolve account type for limit/pricing checks
    const profileResult = await client.query(
      'SELECT account_type FROM profiles WHERE id = $1',
      [profileId]
    );
    const accountType = profileResult.rows[0].account_type;

    // Enforce monthly creation limit for personal accounts (4/month)
    if (accountType === 'personal') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM groups WHERE creator_id = $1 AND created_at >= $2 AND created_at < $3`,
        [profileId, monthStart, nextMonth]
      );
      if (countResult.rows[0].count >= 4) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, message: 'Monthly group creation limit reached (4 per month). Upgrade to Pro for unlimited.' }),
        };
      }
    }

    const body: CreateGroupRequest = JSON.parse(event.body || '{}');
    const {
      name,
      description,
      category,
      subcategory,
      sport_type: sportType,
      latitude,
      longitude,
      address,
      starts_at: startsAt,
      timezone = 'UTC',
      max_participants: maxParticipants,
      is_free: isFree = true,
      price,
      currency = 'usd',
      is_public: isPublic = true,
      is_fans_only: isFansOnly = false,
      is_route: isRoute = false,
      route_start: routeStart,
      route_end: routeEnd,
      route_waypoints: routeWaypoints,
      route_geojson: routeGeojson,
      route_profile: routeProfile,
      route_distance_km: routeDistanceKm,
      route_duration_min: routeDurationMin,
      route_elevation_gain: routeElevationGain,
      difficulty,
      cover_image_url: coverImageUrl,
    } = body;

    // Validate required fields
    if (!name || !latitude || !longitude || !startsAt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Name, latitude, longitude, and start date are required',
        }),
      };
    }

    // Validate name length
    if (name.length > 255) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Name too long (max 255 characters)' }),
      };
    }

    // Validate coordinates
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid coordinates' }),
      };
    }

    // Validate starts_at
    const startDate = new Date(startsAt);
    if (Number.isNaN(startDate.getTime())) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid start date' }),
      };
    }

    // BUG-2026-02-14: Ensure start date is in the future
    if (startDate <= new Date()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Start date must be in the future' }),
      };
    }

    // Validate max_participants
    if (maxParticipants !== undefined && (maxParticipants < 2 || maxParticipants > 10000)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Max participants must be between 2 and 10000' }),
      };
    }

    // Validate difficulty
    if (difficulty && !['easy', 'moderate', 'hard', 'expert'].includes(difficulty)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid difficulty level' }),
      };
    }

    // Validate price if not free
    if (!isFree) {
      // Only pro_creator can create paid groups
      if (accountType !== 'pro_creator') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, message: 'Only Pro Creators can create paid groups' }),
        };
      }
      if (!price || price <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Price is required for paid groups' }),
        };
      }
      if (price > 5000000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, message: 'Maximum price exceeded' }),
        };
      }
    }

    // Sanitize text inputs
    const sanitizedName = sanitizeInput(name, 255);
    const sanitizedDescription = description ? sanitizeInput(description, 5000) : null;
    const sanitizedCategory = category ? sanitizeInput(category, 100) : null;
    const sanitizedSubcategory = subcategory ? sanitizeInput(subcategory, 100) : null;
    const sanitizedSportType = sportType ? sanitizeInput(sportType, 100) : null;
    const sanitizedAddress = address ? sanitizeInput(address, 500) : null;
    const sanitizedRouteProfile = routeProfile ? sanitizeInput(routeProfile, 50) : null;

    // Moderation: check name and description for violations
    const textsToCheck = [sanitizedName, sanitizedDescription].filter(Boolean) as string[];
    const modResult = await moderateTexts(textsToCheck, headers, log, 'group');
    if (modResult.blocked) return modResult.blockResponse!;

    // SECURITY: Validate image URLs
    const ALLOWED_MEDIA_DOMAINS = ['.s3.amazonaws.com', '.s3.us-east-1.amazonaws.com', '.cloudfront.net'];
    const isAllowedUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return ALLOWED_MEDIA_DOMAINS.some(d => parsed.hostname.endsWith(d));
      } catch { return false; }
    };
    if (coverImageUrl && !isAllowedUrl(coverImageUrl)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid cover image URL' }) };
    }

    await client.query('BEGIN');

    // Create group
    const groupResult = await client.query(
      `INSERT INTO groups (
        creator_id, name, description, category, subcategory, sport_type,
        latitude, longitude, address, starts_at, timezone,
        max_participants, is_free, price, currency,
        is_public, is_fans_only, is_route,
        route_start, route_end, route_waypoints, route_geojson,
        route_profile, route_distance_km, route_duration_min, route_elevation_gain,
        difficulty, cover_image_url, current_participants
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 1
      )
      RETURNING id, name, description, category, subcategory, sport_type,
        latitude, longitude, address, starts_at, timezone,
        max_participants, current_participants, is_free, price, currency,
        is_public, is_fans_only, is_route,
        route_start, route_end, route_waypoints, route_geojson,
        route_profile, route_distance_km, route_duration_min, route_elevation_gain,
        difficulty, cover_image_url, status, created_at`,
      [
        profileId,
        sanitizedName,
        sanitizedDescription,
        sanitizedCategory,
        sanitizedSubcategory,
        sanitizedSportType,
        lat,
        lng,
        sanitizedAddress,
        startDate,
        timezone,
        maxParticipants || null,
        isFree,
        !isFree ? price : null,
        currency,
        isPublic,
        isFansOnly,
        isRoute,
        routeStart ? JSON.stringify(routeStart) : null,
        routeEnd ? JSON.stringify(routeEnd) : null,
        routeWaypoints ? JSON.stringify(routeWaypoints) : null,
        routeGeojson ? JSON.stringify(routeGeojson) : null,
        sanitizedRouteProfile,
        routeDistanceKm || null,
        routeDurationMin || null,
        routeElevationGain || null,
        difficulty || null,
        coverImageUrl || null,
      ]
    );

    const group = groupResult.rows[0];

    // Add creator as first participant
    await client.query(
      `INSERT INTO group_participants (group_id, user_id)
       VALUES ($1, $2)`,
      [group.id, profileId]
    );

    await client.query('COMMIT');

    // Get creator info
    const creatorResult = await client.query(
      `SELECT username, display_name, avatar_url, is_verified
       FROM profiles WHERE id = $1`,
      [profileId]
    );
    const creator = creatorResult.rows[0];

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
          category: group.category,
          subcategory: group.subcategory,
          sportType: group.sport_type,
          latitude: Number.parseFloat(group.latitude),
          longitude: Number.parseFloat(group.longitude),
          address: group.address,
          startsAt: group.starts_at,
          timezone: group.timezone,
          maxParticipants: group.max_participants,
          currentParticipants: group.current_participants,
          isFree: group.is_free,
          price: group.price ? Number.parseFloat(group.price) : null,
          currency: group.currency,
          isPublic: group.is_public,
          isFansOnly: group.is_fans_only,
          isRoute: group.is_route,
          routeStart: group.route_start,
          routeEnd: group.route_end,
          routeWaypoints: group.route_waypoints,
          routeGeojson: group.route_geojson,
          routeProfile: group.route_profile,
          routeDistanceKm: group.route_distance_km ? Number.parseFloat(group.route_distance_km) : null,
          routeDurationMin: group.route_duration_min,
          routeElevationGain: group.route_elevation_gain,
          difficulty: group.difficulty,
          coverImageUrl: group.cover_image_url,
          status: group.status,
          createdAt: group.created_at,
          creator: {
            id: profileId,
            username: creator.username,
            displayName: creator.display_name,
            avatarUrl: creator.avatar_url,
            isVerified: creator.is_verified,
          },
        },
      }),
    };
  } catch (error_: unknown) {
    await client.query('ROLLBACK');
    throw error_;
  } finally {
    client.release();
  }
});
