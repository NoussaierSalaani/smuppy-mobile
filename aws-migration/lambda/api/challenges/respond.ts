/**
 * Respond to Challenge Lambda Handler
 * Submit a response Peak to a challenge
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('challenges-respond');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
});

interface RespondChallengeRequest {
  challengeId: string;
  peakId: string;
  score?: number;
  timeSeconds?: number;
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

    const body: RespondChallengeRequest = JSON.parse(event.body || '{}');
    const { challengeId, peakId, score, timeSeconds } = body;

    if (!challengeId || !peakId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Challenge ID and Peak ID are required',
        }),
      });
    }

    // Get challenge details
    const challengeResult = await client.query(
      `SELECT pc.*, p.user_id as creator_user_id
       FROM peak_challenges pc
       JOIN peaks p ON pc.peak_id = p.id
       WHERE pc.id = $1`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Challenge not found' }),
      });
    }

    const challenge = challengeResult.rows[0];

    // Check if challenge is still active
    if (challenge.status !== 'active') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'This challenge is no longer active',
        }),
      });
    }

    // Check if challenge has ended
    if (challenge.ends_at && new Date(challenge.ends_at) < new Date()) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'This challenge has ended',
        }),
      });
    }

    // Check max participants
    if (challenge.max_participants && challenge.response_count >= challenge.max_participants) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'Maximum participants reached',
        }),
      });
    }

    // Check if user can participate
    if (!challenge.allow_anyone) {
      // Check if user was tagged
      const tagCheck = await client.query(
        `SELECT id FROM challenge_tags
         WHERE challenge_id = $1 AND tagged_user_id = $2`,
        [challengeId, userId]
      );

      if (tagCheck.rows.length === 0) {
        return cors({
          statusCode: 403,
          body: JSON.stringify({
            success: false,
            message: 'You were not invited to this challenge',
          }),
        });
      }
    }

    // Check if already responded
    const existingResponse = await client.query(
      `SELECT id FROM challenge_responses
       WHERE challenge_id = $1 AND user_id = $2`,
      [challengeId, userId]
    );

    if (existingResponse.rows.length > 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'You have already responded to this challenge',
        }),
      });
    }

    // Verify peak belongs to user
    const peakCheck = await client.query(
      `SELECT id, user_id FROM peaks WHERE id = $1`,
      [peakId]
    );

    if (peakCheck.rows.length === 0 || peakCheck.rows[0].user_id !== userId) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: 'Invalid Peak',
        }),
      });
    }

    await client.query('BEGIN');

    // Create response
    const responseResult = await client.query(
      `INSERT INTO challenge_responses (
        challenge_id, peak_id, user_id, score, time_seconds
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, challenge_id, peak_id, user_id, score, time_seconds, status, created_at`,
      [challengeId, peakId, userId, score || null, timeSeconds || null]
    );

    const response = responseResult.rows[0];

    // Update challenge_tags if user was tagged
    await client.query(
      `UPDATE challenge_tags
       SET has_responded = TRUE, response_id = $1
       WHERE challenge_id = $2 AND tagged_user_id = $3`,
      [response.id, challengeId, userId]
    );

    // Notify challenge creator
    await client.query(
      `INSERT INTO notifications (
        user_id, type, title, message, data, from_user_id
      ) VALUES ($1, 'challenge_response', 'New Challenge Response',
        'Someone responded to your challenge!', $2, $3)`,
      [
        challenge.creator_id,
        JSON.stringify({
          challengeId,
          responseId: response.id,
          peakId,
        }),
        userId,
      ]
    );

    await client.query('COMMIT');

    // Get responder info
    const userResult = await client.query(
      `SELECT username, display_name, avatar_url FROM profiles WHERE id = $1`,
      [userId]
    );

    return cors({
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        response: {
          id: response.id,
          challengeId: response.challenge_id,
          peakId: response.peak_id,
          score: response.score,
          timeSeconds: response.time_seconds ? parseFloat(response.time_seconds) : null,
          voteCount: 0,
          tipAmount: 0,
          status: response.status,
          createdAt: response.created_at,
          user: {
            id: userId,
            username: userResult.rows[0].username,
            displayName: userResult.rows[0].display_name,
            avatarUrl: userResult.rows[0].avatar_url,
          },
        },
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Respond challenge error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to submit response',
      }),
    });
  } finally {
    client.release();
  }
};
