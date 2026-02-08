/**
 * Peak Tag Handler
 * POST /peaks/{id}/tag - Tag a friend on a peak
 * DELETE /peaks/{id}/tag/{userId} - Remove tag from peak
 * GET /peaks/{id}/tags - Get all tags on a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('peaks-tag');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const taggedUserId = event.pathParameters?.userId;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { error: 'Unauthorized' });
  }

  const rateLimit = await checkRateLimit({
    prefix: 'peak-tag',
    identifier: userId,
    windowSeconds: 60,
    maxRequests: 10,
  });
  if (!rateLimit.allowed) {
    return createCorsResponse(429, { error: 'Too many requests. Please wait.' });
  }

  if (!peakId) {
    return createCorsResponse(400, { error: 'Peak ID is required' });
  }

  // Validate UUID format
  if (!isValidUUID(peakId)) {
    return createCorsResponse(400, { error: 'Invalid peak ID format' });
  }

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

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { error: 'Peak not found' });
    }

    const peakAuthorId = peakResult.rows[0].author_id;

    if (httpMethod === 'GET') {
      // Get all tags on this peak
      const tagsResult = await db.query(
        `SELECT pt.id, pt.tagged_user_id, pt.tagged_by_user_id, pt.created_at,
                p.username, p.display_name, p.avatar_url
         FROM peak_tags pt
         JOIN profiles p ON pt.tagged_user_id = p.id
         WHERE pt.peak_id = $1
         ORDER BY pt.created_at DESC`,
        [peakId]
      );

      return createCorsResponse(200, {
        tags: tagsResult.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          taggedUser: {
            id: row.tagged_user_id,
            username: row.username,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
          },
          taggedBy: row.tagged_by_user_id,
          createdAt: row.created_at,
        })),
      });

    } else if (httpMethod === 'POST') {
      // Tag a friend
      const body = event.body ? JSON.parse(event.body) : {};
      const { friendId } = body;

      if (!friendId || !isValidUUID(friendId)) {
        return createCorsResponse(400, { error: 'Valid friendId is required' });
      }

      // Verify friend exists
      const friendResult = await db.query(
        'SELECT id, username, display_name, avatar_url FROM profiles WHERE id = $1',
        [friendId]
      );

      if (friendResult.rows.length === 0) {
        return createCorsResponse(404, { error: 'User not found' });
      }

      // Check if already tagged
      const existingTag = await db.query(
        'SELECT id FROM peak_tags WHERE peak_id = $1 AND tagged_user_id = $2',
        [peakId, friendId]
      );

      if (existingTag.rows.length > 0) {
        return createCorsResponse(409, { error: 'User already tagged on this peak' });
      }

      // Get tagger info for notification
      const taggerResult = await db.query(
        'SELECT username, display_name, full_name FROM profiles WHERE id = $1',
        [profileId]
      );
      const tagger = taggerResult.rows[0];

      // Create tag
      const tagResult = await db.query(
        `INSERT INTO peak_tags (peak_id, tagged_user_id, tagged_by_user_id, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, created_at`,
        [peakId, friendId, profileId]
      );

      // Create notification for tagged user
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'peak_tag', 'Tagged in Peak', $2, $3)`,
        [
          friendId,
          `${tagger.display_name || tagger.full_name || tagger.username} tagged you in a Peak`,
          JSON.stringify({ peakId, taggedById: profileId })
        ]
      );

      const friend = friendResult.rows[0];
      log.info('Friend tagged on peak', { peakId: peakId.substring(0, 8) + '***', taggedUserId: friendId.substring(0, 8) + '***', taggedBy: userId.substring(0, 8) + '***' });

      return createCorsResponse(201, {
        success: true,
        tag: {
          id: tagResult.rows[0].id,
          taggedUser: {
            id: friend.id,
            username: friend.username,
            displayName: friend.display_name,
            avatarUrl: friend.avatar_url,
          },
          taggedBy: profileId,
          createdAt: tagResult.rows[0].created_at,
        },
      });

    } else if (httpMethod === 'DELETE') {
      // Remove tag - only peak author or tagger can remove
      if (!taggedUserId || !isValidUUID(taggedUserId)) {
        return createCorsResponse(400, { error: 'Tagged user ID is required' });
      }

      // Check if user can remove tag (peak author or original tagger)
      const tagResult = await db.query(
        'SELECT tagged_by_user_id FROM peak_tags WHERE peak_id = $1 AND tagged_user_id = $2',
        [peakId, taggedUserId]
      );

      if (tagResult.rows.length === 0) {
        return createCorsResponse(404, { error: 'Tag not found' });
      }

      const canRemove = profileId === peakAuthorId ||
                        profileId === tagResult.rows[0].tagged_by_user_id ||
                        profileId === taggedUserId; // Tagged user can remove themselves

      if (!canRemove) {
        return createCorsResponse(403, { error: 'Not authorized to remove this tag' });
      }

      await db.query(
        'DELETE FROM peak_tags WHERE peak_id = $1 AND tagged_user_id = $2',
        [peakId, taggedUserId]
      );

      log.info('Tag removed from peak', { peakId: peakId.substring(0, 8) + '***', taggedUserId: taggedUserId.substring(0, 8) + '***', removedBy: userId.substring(0, 8) + '***' });

      return createCorsResponse(200, {
        success: true,
        message: 'Tag removed',
      });
    }

    return createCorsResponse(405, { error: 'Method not allowed' });

  } catch (error: unknown) {
    log.error('Error in peak tag handler', error);
    return createCorsResponse(500, { error: 'Internal server error' });
  }
}
