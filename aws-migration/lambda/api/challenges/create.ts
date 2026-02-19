/**
 * Create Challenge Lambda Handler
 * Create a Peak Challenge
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID, sanitizeInput } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('challenges-create');

interface CreateChallengeRequest {
  peakId: string;
  title: string;
  description?: string;
  rules?: string;
  challengeTypeId?: string;
  challengeTypeSlug?: string;
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
  log.initFromEvent(event);
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

    // Account status check (suspended/banned users cannot create challenges)
    const accountCheck = await requireActiveAccount(userId, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    // Only pro_creator can create challenges — personal and pro_business are blocked
    if (accountCheck.accountType !== 'pro_creator') {
      return cors({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'Only Pro Creators can create challenges' }),
      });
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
      challengeTypeId: rawChallengeTypeId,
      challengeTypeSlug,
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

    // Sanitize text fields
    const sanitizedTitle = title ? sanitizeInput(title, 200) : '';
    const sanitizedDescription = description ? sanitizeInput(description, 2000) : undefined;
    const sanitizedRules = rules ? sanitizeInput(rules, 2000) : undefined;
    const sanitizedPrizeDescription = prizeDescription ? sanitizeInput(prizeDescription, 500) : undefined;

    if (!peakId || !sanitizedTitle) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Peak ID and title are required',
        }),
      });
    }

    // Moderation: check text fields for violations
    const textsToCheck = [sanitizedTitle, sanitizedDescription, sanitizedRules].filter(Boolean) as string[];
    for (const text of textsToCheck) {
      const filterResult = await filterText(text);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Challenge text blocked by filter', { userId: userId.substring(0, 8) + '***', severity: filterResult.severity });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
      const toxicityResult = await analyzeTextToxicity(text);
      if (toxicityResult.action === 'block') {
        log.warn('Challenge text blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
    }

    if (!isValidUUID(peakId) || (rawChallengeTypeId && !isValidUUID(rawChallengeTypeId)) || !taggedUserIds.every(isValidUUID)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Resolve challenge type: accept UUID directly, or resolve from slug
    let challengeTypeId = rawChallengeTypeId || null;
    if (!challengeTypeId && challengeTypeSlug && typeof challengeTypeSlug === 'string') {
      const slug = challengeTypeSlug.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 50); // NOSONAR — intentional control char sanitization
      const typeResult = await client.query(
        'SELECT id FROM challenge_types WHERE slug = $1',
        [slug]
      );
      if (typeResult.rows.length > 0) {
        challengeTypeId = typeResult.rows[0].id;
      }
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
        user.account_type !== 'pro_creator' ||
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
        sanitizedTitle,
        sanitizedDescription || null,
        sanitizedRules || null,
        durationSeconds || null,
        endsAt ? new Date(endsAt) : null,
        isPublic,
        allowAnyone,
        maxParticipants || null,
        hasPrize,
        sanitizedPrizeDescription || null,
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
      // Batch insert challenge_tags: $1 = challenge_id (shared), $2..$N = tagged user IDs
      const tagPlaceholders: string[] = [];
      const tagParams: string[] = [challenge.id];

      for (let i = 0; i < taggedUserIds.length; i++) {
        tagPlaceholders.push(`($1, $${i + 2})`);
        tagParams.push(taggedUserIds[i]);
      }

      await client.query(
        `INSERT INTO challenge_tags (challenge_id, tagged_user_id)
         VALUES ${tagPlaceholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        tagParams
      );

      // Batch insert notifications for all tagged users (single query instead of N queries)
      // Each row needs 2 dynamic params: user_id and data (type/title/body are constant)
      const notifPlaceholders: string[] = [];
      const notifParams: string[] = [];
      let paramIdx = 1;
      const notifData = JSON.stringify({ challengeId: challenge.id, peakId, title: sanitizedTitle, senderId: profileId });
      for (let i = 0; i < taggedUserIds.length; i++) {
        notifPlaceholders.push(`($${paramIdx}, 'challenge_tag', 'Challenge Invitation', 'You have been challenged!', $${paramIdx + 1})`);
        notifParams.push(taggedUserIds[i], notifData);
        paramIdx += 2;
      }
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data) VALUES ${notifPlaceholders.join(', ')}`,
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
