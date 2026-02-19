/**
 * Vote on Challenge Response Lambda Handler
 * POST /challenges/{challengeId}/responses/{responseId}/vote
 * Toggle vote (up) on a challenge response — idempotent toggle.
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { cors, handleOptions, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { requireRateLimit } from '../utils/rate-limit';
import { resolveProfileId } from '../utils/auth';

const log = createLogger('challenges-vote');
const corsHeaders = getSecureHeaders();

export const handler: APIGatewayProxyHandler = async (event) => {
  log.initFromEvent(event);
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'challenge-vote', identifier: cognitoSub, windowSeconds: 60, maxRequests: 30 }, corsHeaders);
    if (rateLimitResponse) return rateLimitResponse;

    // Resolve cognito sub to profile ID
    const voterId = await resolveProfileId(client, cognitoSub);
    if (!voterId) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }

    const challengeId = event.pathParameters?.challengeId;
    const responseId = event.pathParameters?.responseId;

    if (!challengeId || !responseId || !isValidUUID(challengeId) || !isValidUUID(responseId)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    // Verify the response exists and belongs to this challenge
    const responseCheck = await client.query(
      `SELECT cr.id, cr.user_id
       FROM challenge_responses cr
       WHERE cr.id = $1 AND cr.challenge_id = $2`,
      [responseId, challengeId]
    );

    if (responseCheck.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Response not found' }),
      });
    }

    // Prevent voting on own response
    if (responseCheck.rows[0].user_id === voterId) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({ success: false, message: 'You cannot vote on your own response' }),
      });
    }

    await client.query('BEGIN');

    // Toggle vote: try to insert, if conflict (already voted) then delete
    const existingVote = await client.query(
      `SELECT id FROM challenge_votes WHERE response_id = $1 AND voter_id = $2`,
      [responseId, voterId]
    );

    let voted: boolean;

    if (existingVote.rows.length > 0) {
      // Remove vote
      await client.query(
        `DELETE FROM challenge_votes WHERE response_id = $1 AND voter_id = $2`,
        [responseId, voterId]
      );
      // Decrement vote_count
      await client.query(
        `UPDATE challenge_responses SET vote_count = GREATEST(0, vote_count - 1) WHERE id = $1`,
        [responseId]
      );
      voted = false;
    } else {
      // Add vote
      await client.query(
        `INSERT INTO challenge_votes (response_id, voter_id, vote_type) VALUES ($1, $2, 'up')`,
        [responseId, voterId]
      );
      // Increment vote_count
      await client.query(
        `UPDATE challenge_responses SET vote_count = vote_count + 1 WHERE id = $1`,
        [responseId]
      );
      voted = true;
    }

    // Get updated vote count
    const updatedResult = await client.query(
      `SELECT vote_count FROM challenge_responses WHERE id = $1`,
      [responseId]
    );

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        voted,
        voteCount: updatedResult.rows[0]?.vote_count || 0,
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Vote challenge response error', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to vote',
      }),
    });
  } finally {
    client.release();
  }
};
