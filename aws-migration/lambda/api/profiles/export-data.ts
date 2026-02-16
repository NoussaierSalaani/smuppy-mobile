/**
 * Export User Data Lambda Handler
 * GET /api/profiles/export-data
 *
 * GDPR Article 15 / App Store 5.1.1(vi) compliance:
 * Returns all personal data associated with the authenticated user as JSON.
 *
 * Exported categories:
 * - Profile, posts, comments, likes, saved posts
 * - Followers, following, blocks, mutes
 * - Messages, conversations
 * - Peaks
 * - Notifications
 * - Tips (sent/received), payments
 * - Events (created/participated)
 * - Consent history
 * - Business subscriptions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('profiles-export-data');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    // Rate limit: 3 exports per hour (expensive query)
    const { allowed } = await checkRateLimit({
      prefix: 'profile-export',
      identifier: cognitoSub,
      windowSeconds: 3600,
      maxRequests: 3,
    });
    if (!allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ success: false, message: 'Too many export requests. Please try again later.' }),
      };
    }

    const db = await getPool();

    // Get user profile
    const profileResult = await db.query(
      `SELECT id, username, full_name, display_name, email, bio, avatar_url,
              account_type, is_verified, created_at, updated_at,
              business_name, business_category, location, website, phone_number
       FROM profiles WHERE cognito_sub = $1`,
      [cognitoSub]
    );

    if (profileResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }

    const profile = profileResult.rows[0];
    const profileId = profile.id;

    // Fetch all user data in parallel (read-only queries, no transaction needed)
    const [
      postsResult,
      commentsResult,
      likesResult,
      savedPostsResult,
      followersResult,
      followingResult,
      blocksResult,
      mutesResult,
      conversationsResult,
      messagesResult,
      peaksResult,
      notificationsResult,
      tipsReceivedResult,
      tipsSentResult,
      paymentsResult,
      eventsCreatedResult,
      eventsParticipatedResult,
      consentsResult,
      subscriptionsResult,
    ] = await Promise.all([
      db.query(
        `SELECT id, content, media_urls, media_type, tags, likes_count, comments_count, visibility, created_at
         FROM posts WHERE author_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT c.id, c.content, c.post_id, c.created_at
         FROM comments c WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT l.post_id, l.created_at
         FROM likes l WHERE l.user_id = $1 ORDER BY l.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT sp.post_id, sp.created_at
         FROM saved_posts sp WHERE sp.user_id = $1 ORDER BY sp.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT p.username, f.created_at
         FROM follows f JOIN profiles p ON f.follower_id = p.id
         WHERE f.following_id = $1 AND f.status = 'accepted'
         ORDER BY f.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT p.username, f.created_at
         FROM follows f JOIN profiles p ON f.following_id = p.id
         WHERE f.follower_id = $1 AND f.status = 'accepted'
         ORDER BY f.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT p.username, b.created_at
         FROM blocked_users b JOIN profiles p ON b.blocked_id = p.id
         WHERE b.blocker_id = $1
         ORDER BY b.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT p.username, m.created_at
         FROM muted_users m JOIN profiles p ON m.muted_id = p.id
         WHERE m.muter_id = $1
         ORDER BY m.created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT c.id, p.username AS other_user,
                c.created_at, c.updated_at
         FROM conversations c
         JOIN profiles p ON p.id = CASE
           WHEN c.participant_1_id = $1 THEN c.participant_2_id
           ELSE c.participant_1_id
         END
         WHERE c.participant_1_id = $1 OR c.participant_2_id = $1
         ORDER BY c.updated_at DESC
         LIMIT 200`,
        [profileId]
      ),
      db.query(
        `SELECT m.id, m.conversation_id, m.content, m.media_url, m.media_type,
                m.message_type, m.created_at
         FROM messages m
         WHERE m.sender_id = $1 AND (m.is_deleted IS NULL OR m.is_deleted = false)
         ORDER BY m.created_at DESC
         LIMIT 5000`,
        [profileId]
      ),
      db.query(
        `SELECT id, media_url, media_type, caption, created_at, expires_at
         FROM peaks WHERE user_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT type, title, body, created_at, read
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [profileId]
      ),
      db.query(
        `SELECT amount, currency, context_type, message, is_anonymous, created_at
         FROM tips WHERE receiver_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT amount, currency, context_type, message, created_at
         FROM tips WHERE sender_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT type, gross_amount, currency, status, created_at
         FROM payments WHERE buyer_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT id, title, description, location_name, starts_at, ends_at,
                max_participants, is_free, price, currency, status, created_at
         FROM events WHERE creator_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT e.title, ep.status, ep.joined_at
         FROM event_participants ep
         JOIN events e ON ep.event_id = e.id
         WHERE ep.user_id = $1
         ORDER BY ep.joined_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT consent_type, accepted, version, ip_address, user_agent, created_at
         FROM user_consents WHERE user_id = $1 ORDER BY created_at DESC`,
        [profileId]
      ),
      db.query(
        `SELECT bs.id, bs.status, bs.current_period_start, bs.current_period_end,
                bs.created_at, p.username AS business_username
         FROM business_subscriptions bs
         JOIN profiles p ON bs.business_id = p.id
         WHERE bs.user_id = $1
         ORDER BY bs.created_at DESC`,
        [profileId]
      ),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      gdprNotice: 'This export contains all personal data stored by Smuppy in compliance with GDPR Article 15 (Right of Access). To request deletion, use the "Delete Account" option in Settings.',
      profile: {
        username: profile.username,
        fullName: profile.full_name,
        displayName: profile.display_name,
        email: profile.email,
        phoneNumber: profile.phone_number,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        accountType: profile.account_type,
        isVerified: profile.is_verified,
        businessName: profile.business_name,
        businessCategory: profile.business_category,
        location: profile.location,
        website: profile.website,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
      posts: postsResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        content: r.content,
        mediaUrls: r.media_urls,
        mediaType: r.media_type,
        tags: r.tags,
        likesCount: r.likes_count,
        commentsCount: r.comments_count,
        visibility: r.visibility,
        createdAt: r.created_at,
      })),
      comments: commentsResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        content: r.content,
        postId: r.post_id,
        createdAt: r.created_at,
      })),
      likes: likesResult.rows.map((r: Record<string, unknown>) => ({
        postId: r.post_id,
        createdAt: r.created_at,
      })),
      savedPosts: savedPostsResult.rows.map((r: Record<string, unknown>) => ({
        postId: r.post_id,
        createdAt: r.created_at,
      })),
      followers: followersResult.rows.map((r: Record<string, unknown>) => ({
        username: r.username,
        followedAt: r.created_at,
      })),
      following: followingResult.rows.map((r: Record<string, unknown>) => ({
        username: r.username,
        followedAt: r.created_at,
      })),
      blockedUsers: blocksResult.rows.map((r: Record<string, unknown>) => ({
        username: r.username,
        blockedAt: r.created_at,
      })),
      mutedUsers: mutesResult.rows.map((r: Record<string, unknown>) => ({
        username: r.username,
        mutedAt: r.created_at,
      })),
      conversations: conversationsResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        otherUser: r.other_user,
        createdAt: r.created_at,
        lastActivity: r.updated_at,
      })),
      messagesSent: messagesResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        conversationId: r.conversation_id,
        content: r.content,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        messageType: r.message_type,
        createdAt: r.created_at,
      })),
      peaks: peaksResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        mediaUrl: r.media_url,
        mediaType: r.media_type,
        caption: r.caption,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      })),
      notifications: notificationsResult.rows.map((r: Record<string, unknown>) => ({
        type: r.type,
        title: r.title,
        body: r.body,
        read: r.read,
        createdAt: r.created_at,
      })),
      tipsReceived: tipsReceivedResult.rows.map((r: Record<string, unknown>) => ({
        amount: r.amount,
        currency: r.currency,
        contextType: r.context_type,
        message: r.message,
        isAnonymous: r.is_anonymous,
        createdAt: r.created_at,
      })),
      tipsSent: tipsSentResult.rows.map((r: Record<string, unknown>) => ({
        amount: r.amount,
        currency: r.currency,
        contextType: r.context_type,
        message: r.message,
        createdAt: r.created_at,
      })),
      payments: paymentsResult.rows.map((r: Record<string, unknown>) => ({
        type: r.type,
        amount: r.gross_amount,
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
      })),
      eventsCreated: eventsCreatedResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        locationName: r.location_name,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        maxParticipants: r.max_participants,
        isFree: r.is_free,
        price: r.price,
        currency: r.currency,
        status: r.status,
        createdAt: r.created_at,
      })),
      eventsParticipated: eventsParticipatedResult.rows.map((r: Record<string, unknown>) => ({
        eventTitle: r.title,
        status: r.status,
        joinedAt: r.joined_at,
      })),
      consentHistory: consentsResult.rows.map((r: Record<string, unknown>) => ({
        type: r.consent_type,
        accepted: r.accepted,
        version: r.version,
        ipAddress: r.ip_address,
        userAgent: r.user_agent,
        recordedAt: r.created_at,
      })),
      businessSubscriptions: subscriptionsResult.rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        businessUsername: r.business_username,
        status: r.status,
        periodStart: r.current_period_start,
        periodEnd: r.current_period_end,
        createdAt: r.created_at,
      })),
    };

    log.info('Data export completed', {
      profileId: profileId.substring(0, 8) + '***',
      categories: Object.keys(exportData).length - 2, // exclude exportedAt and gdprNotice
    });

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Disposition': `attachment; filename="smuppy-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
      body: JSON.stringify({ success: true, data: exportData }),
    };
  } catch (error: unknown) {
    log.error('Error exporting user data', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Internal server error' }),
    };
  }
}
