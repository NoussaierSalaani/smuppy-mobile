/**
 * Respond to Challenge Lambda Handler
 * Submit a response Peak to a challenge
 */

import { getPool } from '../../shared/db';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { resolveProfileId } from '../utils/auth';

export const handler = withErrorHandler('challenges-respond', async (event, { headers }) => {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'challenge-respond', identifier: cognitoSub, windowSeconds: 60, maxRequests: 20 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check + block business accounts from participating
    const accountCheck = await requireActiveAccount(cognitoSub, {});
    if (isAccountError(accountCheck)) {
      return { statusCode: accountCheck.statusCode, headers, body: accountCheck.body };
    }
    if (accountCheck.accountType === 'pro_business') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, message: 'Business accounts cannot participate in challenges' }),
      };
    }

    // Resolve cognito sub to profile ID
    const userId = await resolveProfileId(client, cognitoSub);
    if (!userId) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { challengeId, peakId, score, timeSeconds } = body;

    if (!challengeId || !peakId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Challenge ID and Peak ID are required',
        }),
      };
    }

    if (!isValidUUID(challengeId) || !isValidUUID(peakId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      };
    }

    // Get challenge details
    const challengeResult = await client.query(
      `SELECT pc.id, pc.creator_id, pc.status, pc.ends_at, pc.allow_anyone,
              pc.max_participants, pc.response_count,
              p.author_id as creator_user_id
       FROM peak_challenges pc
       JOIN peaks p ON pc.peak_id = p.id
       WHERE pc.id = $1`,
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: 'Challenge not found' }),
      };
    }

    const challenge = challengeResult.rows[0];

    // Block self-response: creator cannot respond to their own challenge
    if (challenge.creator_id === userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'You cannot respond to your own challenge',
        }),
      };
    }

    // Auto-expire: if ends_at has passed, update status to 'ended' and reject
    if (challenge.status === 'active' && challenge.ends_at && new Date(challenge.ends_at) < new Date()) {
      await client.query(
        `UPDATE peak_challenges SET status = 'ended', updated_at = NOW() WHERE id = $1 AND status = 'active'`,
        [challengeId]
      );
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'This challenge has ended',
        }),
      };
    }

    // Check if challenge is still active
    if (challenge.status !== 'active') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'This challenge is no longer active',
        }),
      };
    }

    // Check max participants
    if (challenge.max_participants && challenge.response_count >= challenge.max_participants) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Maximum participants reached',
        }),
      };
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
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'You were not invited to this challenge',
          }),
        };
      }
    }

    // Verify peak belongs to user
    const peakCheck = await client.query(
      `SELECT id, author_id FROM peaks WHERE id = $1`,
      [peakId]
    );

    if (peakCheck.rows.length === 0 || peakCheck.rows[0].author_id !== userId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid Peak',
        }),
      };
    }

    await client.query('BEGIN');

    // Check if already responded (inside transaction with FOR UPDATE to prevent race condition)
    const existingResponse = await client.query(
      `SELECT id FROM challenge_responses
       WHERE challenge_id = $1 AND user_id = $2
       FOR UPDATE`,
      [challengeId, userId]
    );

    if (existingResponse.rows.length > 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'You have already responded to this challenge',
        }),
      };
    }

    // Create response (ON CONFLICT prevents race condition if two requests pass the check simultaneously)
    const responseResult = await client.query(
      `INSERT INTO challenge_responses (
        challenge_id, peak_id, user_id, score, time_seconds
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (challenge_id, user_id) DO NOTHING
      RETURNING id, challenge_id, peak_id, user_id, score, time_seconds, status, created_at`,
      [challengeId, peakId, userId, score || null, timeSeconds || null]
    );

    if (responseResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'You have already responded to this challenge',
        }),
      };
    }

    const response = responseResult.rows[0];

    // Update challenge_tags if user was tagged
    await client.query(
      `UPDATE challenge_tags
       SET has_responded = TRUE, response_id = $1
       WHERE challenge_id = $2 AND tagged_user_id = $3`,
      [response.id, challengeId, userId]
    );

    // Get responder info for notification (inside transaction for atomicity)
    const userResult = await client.query(
      `SELECT username, display_name, avatar_url FROM profiles WHERE id = $1`,
      [userId]
    );
    const responderName = userResult.rows[0]?.display_name || 'Someone';

    // Notify challenge creator
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'challenge_response', 'New Challenge Response', $2, $3)`,
      [
        challenge.creator_id,
        `${responderName} responded to your challenge!`,
        JSON.stringify({
          challengeId,
          responseId: response.id,
          peakId,
          senderId: userId,
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        response: {
          id: response.id,
          challengeId: response.challenge_id,
          peakId: response.peak_id,
          score: response.score,
          timeSeconds: response.time_seconds ? Number.parseFloat(response.time_seconds) : null,
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
    };
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});
