/**
 * Create Event Lambda Handler
 * Create a sports/fitness event on the map
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN, MAX_EVENT_TITLE_LENGTH, MIN_EVENT_PARTICIPANTS, MAX_EVENT_PARTICIPANTS } from '../utils/constants';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('events-create');

interface CreateEventRequest {
  title: string;
  description?: string;
  categorySlug: string;
  locationName: string;
  address?: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt?: string;
  timezone?: string;
  maxParticipants?: number;
  minParticipants?: number;
  isFree?: boolean;
  price?: number;
  currency?: string;
  isPublic?: boolean;
  isFansOnly?: boolean;
  coverImageUrl?: string;
  images?: string[];
  // Route for running/hiking/cycling
  hasRoute?: boolean;
  routeDistanceKm?: number;
  routeElevationGainM?: number;
  routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  routePolyline?: string;
  routeWaypoints?: { lat: number; lng: number; name?: string }[];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const { allowed } = await checkRateLimit({ prefix: 'event-create', identifier: userId, windowSeconds: RATE_WINDOW_1_MIN, maxRequests: 5 });
    if (!allowed) {
      return cors({ statusCode: 429, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) });
    }

    // Account status check (suspended/banned users cannot create events)
    const accountCheck = await requireActiveAccount(userId, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    // Resolve cognito_sub to profile ID and account type
    const profileResult = await client.query(
      'SELECT id, account_type FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;
    const accountType = profileResult.rows[0].account_type;

    // Enforce monthly creation limit for personal accounts (4/month)
    if (accountType === 'personal') {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      const countResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM events WHERE creator_id = $1 AND created_at >= $2 AND created_at < $3`,
        [profileId, monthStart, nextMonth]
      );
      if (countResult.rows[0].count >= 4) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({ success: false, message: 'Monthly event creation limit reached (4 per month). Upgrade to Pro for unlimited.' }),
        });
      }
    }

    const body: CreateEventRequest = JSON.parse(event.body || '{}');
    const {
      title,
      description,
      categorySlug,
      locationName,
      address,
      latitude,
      longitude,
      startsAt,
      endsAt,
      timezone = 'UTC',
      maxParticipants,
      minParticipants = 1,
      isFree = true,
      price,
      currency = 'EUR',
      isPublic = true,
      isFansOnly = false,
      coverImageUrl,
      images,
      hasRoute = false,
      routeDistanceKm,
      routeElevationGainM,
      routeDifficulty,
      routePolyline,
      routeWaypoints,
    } = body;

    // Validation — check required fields and lengths BEFORE moderation (avoid wasting Comprehend calls)
    if (!title || typeof title !== 'string' || title.trim().length === 0 || !categorySlug || !locationName || !latitude || !longitude || !startsAt) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Title, category, location, and start date are required',
        }),
      });
    }

    // Validate title length
    if (title.length > MAX_EVENT_TITLE_LENGTH) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Title too long (max 200 characters)' }),
      });
    }

    // Validate coordinates
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid coordinates' }),
      });
    }

    // Validate participants bounds
    if (maxParticipants !== undefined && (maxParticipants < MIN_EVENT_PARTICIPANTS || maxParticipants > MAX_EVENT_PARTICIPANTS)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Max participants must be between 2 and 10000' }),
      });
    }

    // Sanitize user-provided text fields
    const sanitize = (s: string) => s.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    const sanitizedTitle = sanitize(title);
    const sanitizedDescription = description ? sanitize(description) : description;
    const sanitizedLocationName = sanitize(locationName || '');
    const sanitizedAddress = address ? sanitize(address) : address;

    // Moderation: check title and description for violations
    const textsToCheck = [sanitizedTitle, sanitizedDescription].filter(Boolean) as string[];
    for (const text of textsToCheck) {
      const filterResult = await filterText(text);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Event text blocked by filter', { userId: userId.substring(0, 8) + '***', severity: filterResult.severity });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
      const toxicityResult = await analyzeTextToxicity(text);
      if (toxicityResult.action === 'block') {
        log.warn('Event text blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
    }

    // Get category
    const categoryResult = await client.query(
      `SELECT id, name, icon, color FROM event_categories WHERE slug = $1 AND is_active = TRUE`,
      [categorySlug]
    );

    if (categoryResult.rows.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid category' }),
      });
    }

    const category = categoryResult.rows[0];

    // Validate date
    const startDate = new Date(startsAt);
    if (startDate < new Date()) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Event start date must be in the future',
        }),
      });
    }

    // Validate price if not free
    if (!isFree) {
      // Only pro_creator can create paid events
      if (accountType !== 'pro_creator') {
        return cors({
          statusCode: 403,
          body: JSON.stringify({ success: false, message: 'Only Pro Creators can create paid events' }),
        });
      }
      if (!price || price <= 0) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Price is required for paid events' }),
        });
      }
      if (price > 50000) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Maximum price is 50,000' }),
        });
      }
    }

    // SECURITY: Validate image URLs
    const ALLOWED_MEDIA_DOMAINS = ['.s3.amazonaws.com', '.s3.us-east-1.amazonaws.com', '.cloudfront.net'];
    const isAllowedUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return ALLOWED_MEDIA_DOMAINS.some(d => parsed.hostname.endsWith(d));
      } catch { return false; }
    };
    if (coverImageUrl && !isAllowedUrl(coverImageUrl)) {
      return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid cover image URL' }) });
    }
    if (images && images.length > 0) {
      const hasInvalidImage = images.some((url: string) => typeof url !== 'string' || !isAllowedUrl(url));
      if (hasInvalidImage) {
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Invalid image URL' }) });
      }
    }

    await client.query('BEGIN');

    // Create event
    const eventResult = await client.query(
      `INSERT INTO events (
        creator_id, title, description, category_id,
        location_name, address, latitude, longitude,
        starts_at, ends_at, timezone,
        max_participants, min_participants,
        is_free, price, currency,
        is_public, is_fans_only,
        cover_image_url, images,
        has_route, route_distance_km, route_elevation_gain_m,
        route_difficulty, route_polyline, route_waypoints
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      RETURNING id, title, description, category_id, location_name, address, latitude, longitude, starts_at, ends_at, timezone, max_participants, min_participants, is_free, price, currency, is_public, is_fans_only, cover_image_url, images, has_route, route_distance_km, route_elevation_gain_m, route_difficulty, route_polyline, route_waypoints, status, created_at`,
      [
        profileId,
        sanitizedTitle,
        sanitizedDescription,
        category.id,
        sanitizedLocationName,
        sanitizedAddress,
        latitude,
        longitude,
        startDate,
        endsAt ? new Date(endsAt) : null,
        timezone,
        maxParticipants,
        minParticipants,
        isFree,
        !isFree ? price : null,
        currency,
        isPublic,
        isFansOnly,
        coverImageUrl,
        images || [],
        hasRoute,
        routeDistanceKm,
        routeElevationGainM,
        routeDifficulty,
        routePolyline,
        routeWaypoints ? JSON.stringify(routeWaypoints) : null,
      ]
    );

    const createdEvent = eventResult.rows[0];

    // Auto-register creator as first participant
    await client.query(
      `INSERT INTO event_participants (event_id, user_id, status)
       VALUES ($1, $2, 'confirmed')`,
      [createdEvent.id, profileId]
    );

    // Update participant count
    await client.query(
      `UPDATE events SET current_participants = 1 WHERE id = $1`,
      [createdEvent.id]
    );

    await client.query('COMMIT');

    // Get creator info
    const creatorResult = await client.query(
      `SELECT username, display_name, avatar_url, is_verified
       FROM profiles WHERE id = $1`,
      [profileId]
    );

    const creator = creatorResult.rows[0];

    return cors({
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        event: {
          id: createdEvent.id,
          title: createdEvent.title,
          description: createdEvent.description,
          category: {
            id: category.id,
            name: category.name,
            slug: categorySlug,
            icon: category.icon,
            color: category.color,
          },
          location: {
            name: createdEvent.location_name,
            address: createdEvent.address,
            latitude: parseFloat(createdEvent.latitude),
            longitude: parseFloat(createdEvent.longitude),
          },
          startsAt: createdEvent.starts_at,
          endsAt: createdEvent.ends_at,
          timezone: createdEvent.timezone,
          maxParticipants: createdEvent.max_participants,
          minParticipants: createdEvent.min_participants,
          currentParticipants: 1,
          isFree: createdEvent.is_free,
          price: createdEvent.price ? parseFloat(createdEvent.price) : null,
          currency: createdEvent.currency,
          isPublic: createdEvent.is_public,
          isFansOnly: createdEvent.is_fans_only,
          coverImageUrl: createdEvent.cover_image_url,
          images: createdEvent.images,
          route: createdEvent.has_route
            ? {
                distanceKm: createdEvent.route_distance_km
                  ? parseFloat(createdEvent.route_distance_km)
                  : null,
                elevationGainM: createdEvent.route_elevation_gain_m,
                difficulty: createdEvent.route_difficulty,
                polyline: createdEvent.route_polyline,
                waypoints: createdEvent.route_waypoints,
              }
            : null,
          status: createdEvent.status,
          createdAt: createdEvent.created_at,
          creator: {
            id: profileId,
            username: creator.username,
            displayName: creator.display_name,
            avatarUrl: creator.avatar_url,
            isVerified: creator.is_verified,
          },
        },
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Create event error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to create event',
      }),
    });
  } finally {
    client.release();
  }
};
