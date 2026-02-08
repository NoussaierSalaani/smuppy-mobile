/**
 * Create Challenge Lambda Handler
 * Create a Peak Challenge
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('challenges-create');

interface CreateChallengeRequest {
  peakId: string;
  title: string;
  description?: string;
  rules?: string;
  challengeTypeId?: string;
  durationSeconds?: number;
  endsAt?: string;
  isPublic?: boolean;
  allowAnyone?: boolean;
  maxParticipants?: number;
  taggedUserIds?: string[];
  hasPrize?: boolean;
  prizeDescription?: string;
  prizeAmount?: number;
  tipsEnabled?: boolean;
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

    const { allowed } = await checkRateLimit({ prefix: 'challenge-create', identifier: userId, windowSeconds: 60, maxRequests: 5 });
    if (!allowed) {
      return cors({ statusCode: 429, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) });
    }

    // Resolve cognito_sub to profile ID
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    const body: CreateChallengeRequest = JSON.parse(event.body || '{}');
    const {
      peakId,
      title,
      description,
      rules,
      challengeTypeId,
      durationSeconds,
      endsAt,
      isPublic = true,
      allowAnyone = true,
      maxParticipants,
      taggedUserIds = [],
      hasPrize = false,
      prizeDescription,
      prizeAmount,
      tipsEnabled = false,
    } = body;

    if (!peakId || !title) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Peak ID and title are required',
        }),
      });
    }

    if (!isValidUUID(peakId) || (challengeTypeId && !isValidUUID(challengeTypeId)) || !taggedUserIds.every(isValidUUID)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Verify peak exists and belongs to user
    const peakResult = await client.query(
      `SELECT id, author_id FROM peaks WHERE id = $1`,
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Peak not found' }),
      });
    }

    if (peakResult.rows[0].author_id !== profileId) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: 'You can only create challenges for your own Peaks',
        }),
      });
    }

    // If tips enabled, verify user is a verified Pro Creator with an active subscription tier
    if (tipsEnabled) {
      const userResult = await client.query(
        `SELECT account_type, is_verified FROM profiles WHERE id = $1`,
        [profileId]
      );

      const user = userResult.rows[0];
      if (
        !user ||
        (user.account_type !== 'pro_creator' && user.account_type !== 'pro_business') ||
        !user.is_verified
      ) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: 'Tips are only available for verified Pro Creators',
          }),
        });
      }

      // Verify creator has at least one active subscription tier
      const tierCheck = await client.query(
        `SELECT EXISTS(SELECT 1 FROM subscription_tiers WHERE creator_id = $1 AND is_active = true) AS has_tier`,
        [profileId]
      );
      if (!tierCheck.rows[0]?.has_tier) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: 'You must set up a subscription tier before enabling tips',
          }),
        });
      }
    }

    await client.query('BEGIN');

    // Create challenge
    const challengeResult = await client.query(
      `INSERT INTO peak_challenges (
        peak_id, creator_id, challenge_type_id, title, description, rules,
        duration_seconds, ends_at, is_public, allow_anyone, max_participants,
        has_prize, prize_description, prize_amount, tips_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, peak_id, creator_id, challenge_type_id, title, description, rules, duration_seconds, ends_at, is_public, allow_anyone, max_participants, has_prize, prize_description, prize_amount, tips_enabled, status, created_at`,
      [
        peakId,
        profileId,
        challengeTypeId || null,
        title,
        description || null,
        rules || null,
        durationSeconds || null,
        endsAt ? new Date(endsAt) : null,
        isPublic,
        allowAnyone,
        maxParticipants || null,
        hasPrize,
        prizeDescription || null,
        prizeAmount || null,
        tipsEnabled,
      ]
    );

    const challenge = challengeResult.rows[0];

    // Tag users if provided (limit to 50 to prevent abuse)
    if (taggedUserIds.length > 50) {
      await client.query('ROLLBACK');
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Cannot tag more than 50 users' }),
      });
    }
    if (taggedUserIds.length > 0) {
      const placeholders: string[] = [];
      const params: (string)[] = [];

      for (let i = 0; i < taggedUserIds.length; i++) {
        const base = i * 2 + 1;
        placeholders.push(`($${base}, $${base + 1})`);
        params.push(challenge.id, taggedUserIds[i]);
      }

      await client.query(
        `INSERT INTO challenge_tags (challenge_id, tagged_user_id)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        params
      );

      // Batch insert notifications for all tagged users (single query instead of N queries)
      const notifData = JSON.stringify({ challengeId: challenge.id, peakId, title });
      const notifPlaceholders: string[] = [];
      const notifParams: string[] = [];
      for (let i = 0; i < taggedUserIds.length; i++) {
        const base = i * 3 + 1;
        notifPlaceholders.push(`($${base}, 'challenge_tag', 'Challenge Invitation', 'You have been challenged!', $${base + 1}, $${base + 2})`);
        notifParams.push(taggedUserIds[i], notifData, profileId);
      }
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, data, from_user_id) VALUES ${notifPlaceholders.join(', ')}`,
        notifParams
      );
    }

    await client.query('COMMIT');

    // Get challenge type info if exists
    let challengeType = null;
    if (challenge.challenge_type_id) {
      const typeResult = await client.query(
        `SELECT name, slug, icon, category FROM challenge_types WHERE id = $1`,
        [challenge.challenge_type_id]
      );
      if (typeResult.rows.length > 0) {
        challengeType = typeResult.rows[0];
      }
    }

    return cors({
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        challenge: {
          id: challenge.id,
          peakId: challenge.peak_id,
          title: challenge.title,
          description: challenge.description,
          rules: challenge.rules,
          durationSeconds: challenge.duration_seconds,
          endsAt: challenge.ends_at,
          isPublic: challenge.is_public,
          allowAnyone: challenge.allow_anyone,
          maxParticipants: challenge.max_participants,
          hasPrize: challenge.has_prize,
          prizeDescription: challenge.prize_description,
          prizeAmount: challenge.prize_amount ? parseFloat(challenge.prize_amount) : null,
          tipsEnabled: challenge.tips_enabled,
          responseCount: 0,
          viewCount: 0,
          status: challenge.status,
          createdAt: challenge.created_at,
          challengeType,
          taggedUsers: taggedUserIds.length,
        },
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Create challenge error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to create challenge',
      }),
    });
  } finally {
    client.release();
  }
};
