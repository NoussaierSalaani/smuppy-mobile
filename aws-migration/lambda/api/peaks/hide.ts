/**
 * Peak Hide Handler
 * POST /peaks/{id}/hide - Hide a peak from user's feed (not interested)
 * DELETE /peaks/{id}/hide - Unhide a peak
 * GET /peaks/hidden - Get list of hidden peaks for user
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse, getSecureHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-hide');
const corsHeaders = getSecureHeaders();

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.initFromEvent(event);
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { success: false, message: 'Unauthorized' });
  }

  const rateLimitResponse = await requireRateLimit({
    prefix: 'peak-hide',
    identifier: userId,
    windowSeconds: 60,
    maxRequests: 20,
  }, corsHeaders);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return createCorsResponse(404, { success: false, message: 'Profile not found' });
    }

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
        hiddenPeaks: hiddenResult.rows.map((row: Record<string, unknown>) => ({
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
      return createCorsResponse(400, { success: false, message: 'Peak ID is required' });
    }

    if (!isValidUUID(peakId)) {
      return createCorsResponse(400, { success: false, message: 'Invalid peak ID format' });
    }

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { success: false, message: 'Peak not found' });
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
        return createCorsResponse(404, { success: false, message: 'Peak was not hidden' });
      }

      log.info('Peak unhidden', { peakId: peakId.substring(0, 8) + '***', userId: userId.substring(0, 8) + '***' });

      return createCorsResponse(200, {
        success: true,
        message: 'Peak restored to your feed',
      });
    }

    return createCorsResponse(405, { success: false, message: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak hide handler', error);
    return createCorsResponse(500, { success: false, message: 'Internal server error' });
  }
}
