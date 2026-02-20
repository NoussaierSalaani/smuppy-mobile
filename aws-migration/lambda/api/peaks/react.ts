/**
 * Peak React Handler
 * POST /peaks/{id}/react - Add reaction to a peak
 * DELETE /peaks/{id}/react - Remove reaction from a peak
 */

import { createPeakActionHandler } from '../utils/create-peak-action-handler';

const ALLOWED_REACTIONS = ['fire', 'flex', 'heart', 'clap', 'mindblown', 'energy', 'trophy', 'lightning'];

export const { handler } = createPeakActionHandler({
  loggerName: 'peaks-react',
  rateLimitPrefix: 'peak-react',
  rateLimitMax: 30,
  onAction: async (client, peak, profileId, _db, headers, log, event) => {
    const peakId = peak.id;
    const httpMethod = event.httpMethod;

    if (httpMethod === 'POST') {
      // Add reaction
      const body = event.body ? JSON.parse(event.body) : {};
      const { reaction } = body;

      if (!reaction || !ALLOWED_REACTIONS.includes(reaction)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid reaction',
            allowedReactions: ALLOWED_REACTIONS,
          }),
        };
      }

      // Upsert reaction (update if exists, insert if not)
      await client.query(
        `INSERT INTO peak_reactions (peak_id, user_id, reaction_type, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (peak_id, user_id) DO UPDATE SET reaction_type = $3, created_at = NOW()`,
        [peakId, profileId, reaction]
      );

      // Get reaction counts
      const countsResult = await client.query(
        `SELECT reaction_type, COUNT(*) as count
         FROM peak_reactions WHERE peak_id = $1
         GROUP BY reaction_type`,
        [peakId]
      );

      const reactionCounts: Record<string, number> = {};
      countsResult.rows.forEach((row: { reaction_type: string; count: string }) => {
        reactionCounts[row.reaction_type] = Number.parseInt(row.count);
      });

      log.info('Reaction added', {
        peakId: peakId.substring(0, 8) + '***',
        reaction,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          reaction,
          reactionCounts,
        }),
      };
    }

    if (httpMethod === 'DELETE') {
      // Remove reaction
      await client.query(
        'DELETE FROM peak_reactions WHERE peak_id = $1 AND user_id = $2',
        [peakId, profileId]
      );

      log.info('Reaction removed', {
        peakId: peakId.substring(0, 8) + '***',
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Reaction removed',
        }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  },
});
