/**
 * Peak React Handler
 * POST /peaks/{id}/react - Add reaction to a peak
 * DELETE /peaks/{id}/react - Remove reaction from a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-react');

const ALLOWED_REACTIONS = ['fire', 'flex', 'heart', 'clap', 'mindblown', 'energy', 'trophy', 'lightning'];

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { error: 'Unauthorized' });
  }

  if (!peakId) {
    return createCorsResponse(400, { error: 'Peak ID is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(peakId)) {
    return createCorsResponse(400, { error: 'Invalid peak ID format' });
  }

  try {
    const db = await getPool();

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM posts WHERE id = $1 AND is_peak = true',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Peak not found' });
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
        [peakId, userId, reaction]
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

      log.info('Reaction added', { peakId, userId, reaction });

      return createCorsResponse(200, {
        success: true,
        reaction,
        reactionCounts,
      });

    } else if (httpMethod === 'DELETE') {
      // Remove reaction
      await db.query(
        'DELETE FROM peak_reactions WHERE peak_id = $1 AND user_id = $2',
        [peakId, userId]
      );

      log.info('Reaction removed', { peakId, userId });

      return createCorsResponse(200, {
        success: true,
        message: 'Reaction removed',
      });
    }

    return createCorsResponse(405, { error: 'Method not allowed' });

  } catch (error: any) {
    log.error('Error in peak react handler', error);
    return createCorsResponse(500, { error: 'Internal server error' });
  }
}
