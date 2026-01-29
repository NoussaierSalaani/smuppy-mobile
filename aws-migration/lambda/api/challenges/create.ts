/**
 * Create Challenge Lambda Handler
 * Create a Peak Challenge
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

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

    // Verify peak exists and belongs to user
    const peakResult = await client.query(
      `SELECT id, user_id FROM peaks WHERE id = $1`,
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Peak not found' }),
      });
    }

    if (peakResult.rows[0].user_id !== userId) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: 'You can only create challenges for your own Peaks',
        }),
      });
    }

    // If tips enabled, verify user is a verified Pro Creator
    if (tipsEnabled) {
      const userResult = await client.query(
        `SELECT account_type, is_verified, subscription_tier
         FROM profiles WHERE id = $1`,
        [userId]
      );

      const user = userResult.rows[0];
      if (
        !user ||
        (user.account_type !== 'pro_creator' && user.account_type !== 'pro_business') ||
        !user.is_verified ||
        !user.subscription_tier
      ) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: 'Tips are only available for verified Pro Creators',
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
      RETURNING *`,
      [
        peakId,
        userId,
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
      const tagValues = taggedUserIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');

      await client.query(
        `INSERT INTO challenge_tags (challenge_id, tagged_user_id)
         VALUES ${tagValues}
         ON CONFLICT DO NOTHING`,
        [challenge.id, ...taggedUserIds]
      );

      // Create notifications for tagged users
      for (const taggedUserId of taggedUserIds) {
        await client.query(
          `INSERT INTO notifications (
            user_id, type, title, message, data, from_user_id
          ) VALUES ($1, 'challenge_tag', 'Challenge Invitation',
            'You have been challenged!', $2, $3)`,
          [
            taggedUserId,
            JSON.stringify({
              challengeId: challenge.id,
              peakId,
              title,
            }),
            userId,
          ]
        );
      }
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
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create challenge error:', error);
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
