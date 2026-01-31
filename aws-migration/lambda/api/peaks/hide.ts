/**
 * Peak Hide Handler
 * POST /peaks/{id}/hide - Hide a peak from user's feed (not interested)
 * DELETE /peaks/{id}/hide - Unhide a peak
 * GET /peaks/hidden - Get list of hidden peaks for user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-hide');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { error: 'Unauthorized' });
  }

  // Validate UUID format if peakId provided
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Profile not found' });
    }
    const profileId = profileResult.rows[0].id;

    // GET /peaks/hidden - List hidden peaks
    if (httpMethod === 'GET' && !peakId) {
      const hiddenResult = await db.query(
        `SELECT ph.peak_id, ph.reason, ph.created_at,
                p.thumbnail_url, p.author_id,
                pr.username, pr.display_name, pr.avatar_url
         FROM peak_hidden ph
         JOIN peaks p ON ph.peak_id = p.id
         JOIN profiles pr ON p.author_id = pr.id
         WHERE ph.user_id = $1
         ORDER BY ph.created_at DESC
         LIMIT 100`,
        [profileId]
      );

      return createCorsResponse(200, {
        hiddenPeaks: hiddenResult.rows.map(row => ({
          peakId: row.peak_id,
          reason: row.reason,
          hiddenAt: row.created_at,
          thumbnail: row.thumbnail_url,
          author: {
            id: row.author_id,
            username: row.username,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
          },
        })),
      });
    }

    if (!peakId) {
      return createCorsResponse(400, { error: 'Peak ID is required' });
    }

    if (!uuidRegex.test(peakId)) {
      return createCorsResponse(400, { error: 'Invalid peak ID format' });
    }

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Peak not found' });
    }

    if (httpMethod === 'POST') {
      // Hide peak from feed
      const body = event.body ? JSON.parse(event.body) : {};
      const reason = body.reason || 'not_interested';

      // Valid reasons
      const validReasons = ['not_interested', 'seen_too_often', 'irrelevant', 'other'];
      if (!validReasons.includes(reason)) {
        return createCorsResponse(400, {
          error: 'Invalid reason',
          validReasons,
        });
      }

      // Upsert hidden record
      await db.query(
        `INSERT INTO peak_hidden (user_id, peak_id, reason, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, peak_id) DO UPDATE SET reason = $3, created_at = NOW()`,
        [profileId, peakId, reason]
      );

      log.info('Peak hidden from feed', { peakId: peakId.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***', reason });

      return createCorsResponse(200, {
        success: true,
        message: 'Peak hidden from your feed',
        reason,
      });

    } else if (httpMethod === 'DELETE') {
      // Unhide peak
      const result = await db.query(
        'DELETE FROM peak_hidden WHERE user_id = $1 AND peak_id = $2 RETURNING id',
        [profileId, peakId]
      );

      if (result.rows.length === 0) {
        return createCorsResponse(404, { error: 'Peak was not hidden' });
      }

      log.info('Peak unhidden', { peakId: peakId.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***' });

      return createCorsResponse(200, {
        success: true,
        message: 'Peak restored to your feed',
      });
    }

    return createCorsResponse(405, { error: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak hide handler', error);
    return createCorsResponse(500, { error: 'Internal server error' });
  }
}
