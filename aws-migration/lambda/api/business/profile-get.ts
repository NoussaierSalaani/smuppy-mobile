/**
 * Business Public Profile
 * GET /businesses/{businessId}
 * Public — returns business profile with services, schedule, stats
 */

import { createBusinessHandler } from '../utils/create-business-handler';
import { isValidUUID } from '../utils/security';
import { getUserFromEvent } from '../utils/auth';

const { handler } = createBusinessHandler({
  loggerName: 'business/profile-get',
  rateLimitPrefix: 'biz-profile-get',
  rateLimitMax: 60,
  skipAuth: true,
  skipRateLimit: true,
  onAction: async ({ headers, db, event }) => {
    const businessId = event.pathParameters?.businessId;

    if (!businessId || !isValidUUID(businessId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Valid businessId is required' }) };
    }

    // Get business profile (include fan_count to avoid separate COUNT query)
    const profileResult = await db.query(
      `SELECT id, full_name, username, bio, avatar_url, cover_url,
              business_category, business_address, business_phone, business_website,
              business_hours, latitude, longitude, is_verified,
              stripe_account_id, stripe_charges_enabled, fan_count
       FROM profiles
       WHERE id = $1 AND account_type IN ('business', 'pro_business')`,
      [businessId]
    );

    if (profileResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Business not found' }) };
    }

    const profile = profileResult.rows[0];

    // Run parallel queries for related data (fan_count comes from profile, no separate COUNT needed)
    const [servicesResult, tagsResult, isFollowingResult] = await Promise.all([
      db.query(
        `SELECT id, name, description, category, price_cents, duration_minutes,
                max_capacity, is_subscription, subscription_period, trial_days,
                entries_total, image_url
         FROM business_services
         WHERE business_id = $1 AND is_active = true
         ORDER BY category, name`,
        [businessId]
      ),
      db.query(
        `SELECT id, name, category FROM business_tags WHERE business_id = $1 ORDER BY name`,
        [businessId]
      ),
      // Check if current user follows this business (if authenticated)
      (async () => {
        const user = getUserFromEvent(event);
        if (!user) return { rows: [{ is_following: false }] };
        const r = await db.query(
          `SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following`,
          [user.id, businessId]
        );
        return r;
      })(),
    ]);

    const business = {
      id: profile.id,
      name: profile.full_name,
      username: profile.username,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      coverUrl: profile.cover_url,
      category: profile.business_category,
      address: profile.business_address,
      phone: profile.business_phone,
      website: profile.business_website,
      hours: profile.business_hours,
      latitude: profile.latitude,
      longitude: profile.longitude,
      isVerified: profile.is_verified,
      paymentsEnabled: !!profile.stripe_account_id && profile.stripe_charges_enabled,
      followersCount: profile.fan_count ?? 0,
      isFollowing: isFollowingResult.rows[0]?.is_following || false,
      tags: tagsResult.rows.map((t: Record<string, unknown>) => ({ id: t.id, name: t.name, category: t.category })),
      services: servicesResult.rows.map((s: Record<string, unknown>) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        priceCents: s.price_cents,
        durationMinutes: s.duration_minutes,
        maxCapacity: s.max_capacity,
        isSubscription: s.is_subscription,
        subscriptionPeriod: s.subscription_period,
        trialDays: s.trial_days,
        entriesTotal: s.entries_total,
        imageUrl: s.image_url,
      })),
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, business }),
    };
  },
});

export { handler };
