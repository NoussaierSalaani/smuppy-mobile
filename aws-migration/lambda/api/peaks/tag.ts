/**
 * Peak Tag Handler
 * POST /peaks/{id}/tag - Tag a friend on a peak
 * DELETE /peaks/{id}/tag/{userId} - Remove tag from peak
 * GET /peaks/{id}/tags - Get all tags on a peak
 */

import { getPool } from '../../shared/db';
import { createCorsResponse } from '../utils/cors';
import { withErrorHandler } from '../utils/error-handler';
import { isValidUUID } from '../utils/security';
import { resolveProfileId } from '../utils/auth';
import { requireRateLimit } from '../utils/rate-limit';

export const handler = withErrorHandler('peaks-tag', async (event, { headers, log }) => {
  const userId = event.requestContext.authorizer?.claims?.sub;
  const peakId = event.pathParameters?.id;
  const taggedUserId = event.pathParameters?.userId;
  const httpMethod = event.httpMethod;

  if (!userId) {
    return createCorsResponse(401, { success: false, message: 'Unauthorized' });
  }

  const rateLimitResponse = await requireRateLimit({
    prefix: 'peak-tag',
    identifier: userId,
    windowSeconds: 60,
    maxRequests: 10,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  if (!peakId) {
    return createCorsResponse(400, { success: false, message: 'Peak ID is required' });
  }

  // Validate UUID format
  if (!isValidUUID(peakId)) {
    return createCorsResponse(400, { success: false, message: 'Invalid peak ID format' });
  }

    const db = await getPool();

    // Resolve cognito_sub to profile ID
    const profileId = await resolveProfileId(db, userId);
    if (!profileId) {
      return createCorsResponse(404, { success: false, message: 'Profile not found' });
    }

    // Verify peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return createCorsResponse(404, { success: false, message: 'Peak not found' });
    }

    const peakAuthorId = peakResult.rows[0].author_id;

    if (httpMethod === 'GET') {
      // Get all tags on this peak
      const tagsResult = await db.query(
        `SELECT pt.id, pt.tagged_user_id, pt.tagged_by_user_id, pt.created_at,
                p.username, p.display_name, p.full_name, p.avatar_url, p.is_verified,
                p.account_type, p.business_name
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
            displayName: row.display_name || row.full_name,
            avatarUrl: row.avatar_url,
            isVerified: row.is_verified || false,
            accountType: row.account_type || 'personal',
            businessName: row.business_name || null,
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
        return createCorsResponse(400, { success: false, message: 'Valid friendId is required' });
      }

      // Verify friend exists
      const friendResult = await db.query(
        'SELECT id, username, display_name, full_name, avatar_url, is_verified, account_type, business_name FROM profiles WHERE id = $1',
        [friendId]
      );

      if (friendResult.rows.length === 0) {
        return createCorsResponse(404, { success: false, message: 'User not found' });
      }

      // Check if already tagged
      const existingTag = await db.query(
        'SELECT id FROM peak_tags WHERE peak_id = $1 AND tagged_user_id = $2',
        [peakId, friendId]
      );

      if (existingTag.rows.length > 0) {
        return createCorsResponse(409, { success: false, message: 'User already tagged on this peak' });
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
          `${tagger.display_name || tagger.full_name || 'Someone'} tagged you in a Peak`,
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
            displayName: friend.display_name || friend.full_name,
            avatarUrl: friend.avatar_url,
            isVerified: friend.is_verified || false,
            accountType: friend.account_type || 'personal',
            businessName: friend.business_name || null,
          },
          taggedBy: profileId,
          createdAt: tagResult.rows[0].created_at,
        },
      });

    } else if (httpMethod === 'DELETE') {
      // Remove tag - only peak author or tagger can remove
      if (!taggedUserId || !isValidUUID(taggedUserId)) {
        return createCorsResponse(400, { success: false, message: 'Tagged user ID is required' });
      }

      // Check if user can remove tag (peak author or original tagger)
      const tagResult = await db.query(
        'SELECT tagged_by_user_id FROM peak_tags WHERE peak_id = $1 AND tagged_user_id = $2',
        [peakId, taggedUserId]
      );

      if (tagResult.rows.length === 0) {
        return createCorsResponse(404, { success: false, message: 'Tag not found' });
      }

      const canRemove = profileId === peakAuthorId ||
                        profileId === tagResult.rows[0].tagged_by_user_id ||
                        profileId === taggedUserId; // Tagged user can remove themselves

      if (!canRemove) {
        return createCorsResponse(403, { success: false, message: 'Not authorized to remove this tag' });
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

    return createCorsResponse(405, { success: false, message: 'Method not allowed' });
});
