/**
 * Peak React Handler
 * POST /peaks/{id}/react - Add reaction to a peak
 * DELETE /peaks/{id}/react - Remove reaction from a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { RATE_WINDOW_1_MIN } from '../utils/constants';

const log = createLogger('peaks-react');

const ALLOWED_REACTIONS = ['fire', 'flex', 'heart', 'clap', 'mindblown', 'energy', 'trophy', 'lightning'];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { success: false, message: 'Unauthorized' });
  }

  const rateLimit = await checkRateLimit({
    prefix: 'peak-react',
    identifier: userId,
    windowSeconds: RATE_WINDOW_1_MIN,
    maxRequests: 30,
  });
  if (!rateLimit.allowed) {
    return createCorsResponse(429, { success: false, message: 'Too many requests. Please wait.' });
  }

  if (!peakId) {
    return createCorsResponse(400, { success: false, message: 'Peak ID is required' });
  }

  // Validate UUID format
  if (!isValidUUID(peakId)) {
    return createCorsResponse(400, { success: false, message: 'Invalid peak ID format' });
  }

  try {
    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return createCorsResponse(404, { success: false, message: 'Profile not found' });
    }
    const profileId = profileResult.rows[0].id;

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { success: false, message: 'Peak not found' });
    }

    if (httpMethod === 'POST') {
      // Add reaction
      const body = event.body ? JSON.parse(event.body) : {};
      const { reaction } = body;

      if (!reaction || !ALLOWED_REACTIONS.includes(reaction)) {
        return createCorsResponse(400, {
          error: 'Invalid reaction',
          allowedReactions: ALLOWED_REACTIONS
        });
      }

      // Upsert reaction (update if exists, insert if not)
      await db.query(
        `INSERT INTO peak_reactions (peak_id, user_id, reaction_type, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (peak_id, user_id) DO UPDATE SET reaction_type = $3, created_at = NOW()`,
        [peakId, profileId, reaction]
      );

      // Get reaction counts
      const countsResult = await db.query(
        `SELECT reaction_type, COUNT(*) as count
         FROM peak_reactions WHERE peak_id = $1
         GROUP BY reaction_type`,
        [peakId]
      );

      const reactionCounts: Record<string, number> = {};
      countsResult.rows.forEach((row: { reaction_type: string; count: string }) => {
        reactionCounts[row.reaction_type] = parseInt(row.count);
      });

      log.info('Reaction added', { peakId: peakId.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***', reaction });

      return createCorsResponse(200, {
        success: true,
        reaction,
        reactionCounts,
      });

    } else if (httpMethod === 'DELETE') {
      // Remove reaction
      await db.query(
        'DELETE FROM peak_reactions WHERE peak_id = $1 AND user_id = $2',
        [peakId, profileId]
      );

      log.info('Reaction removed', { peakId: peakId.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***' });

      return createCorsResponse(200, {
        success: true,
        message: 'Reaction removed',
      });
    }

    return createCorsResponse(405, { success: false, message: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak react handler', error);
    return createCorsResponse(500, { success: false, message: 'Internal server error' });
  }
}
