/**
 * Create Comment Lambda Handler
 * Adds a comment to a post
 */

import { requireRateLimit } from '../utils/rate-limit';
import { withAuthHandler } from '../utils/with-auth-handler';
import { validateUUIDParam, isErrorResponse } from '../utils/validators';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateText } from '../utils/text-moderation';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';
import { sendPushToUser } from '../services/push-notification';
import { sanitizeText, isValidUUID } from '../utils/security';
import { isBidirectionallyBlocked } from '../utils/block-filter';
import { RATE_WINDOW_1_DAY } from '../utils/constants';

export const handler = withAuthHandler('comments-create', async (event, { headers, log, cognitoSub, db }) => {
    const rateLimitResponse = await requireRateLimit({
      prefix: 'comment-create',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 20,
    }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Daily cap: 200 comments/day (consistent with likes/follows daily limits)
    const dailyRateLimitResponse = await requireRateLimit({
      prefix: 'comment-daily',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_1_DAY,
      maxRequests: 200,
    }, headers);
    if (dailyRateLimitResponse) return dailyRateLimitResponse;

    const postId = validateUUIDParam(event, headers, 'id', 'Post');
    if (isErrorResponse(postId)) return postId;

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { text, parentCommentId } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment text is required' }),
      };
    }

    // Validate parent comment ID if provided
    if (parentCommentId && !isValidUUID(parentCommentId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid parent comment ID format' }),
      };
    }

    const sanitizedText = sanitizeText(text, 2000);

    if (sanitizedText.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment text cannot be empty' }),
      };
    }

    // Backend content moderation check (keyword filter + Comprehend toxicity)
    const modResult = await moderateText(sanitizedText, headers, log, 'comment');
    if (modResult.blocked) return modResult.blockResponse!;
    const { contentFlagged, flagCategory, flagScore } = modResult;

    // Check account moderation status
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
    if (isAccountError(accountCheck)) return accountCheck;
    const profile = {
      id: accountCheck.profileId,
      username: accountCheck.username,
      full_name: accountCheck.fullName,
      avatar_url: accountCheck.avatarUrl,
      is_verified: accountCheck.isVerified,
      account_type: accountCheck.accountType,
      business_name: accountCheck.businessName,
    };

    // Check if post exists
    const postResult = await db.query(
      'SELECT id, author_id FROM posts WHERE id = $1',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Post not found' }),
      };
    }

    const post = postResult.rows[0];

    // Bidirectional block check: prevent commenting on posts from blocked/blocking users
    if (await isBidirectionallyBlocked(db, profile.id, post.author_id)) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Action not allowed' }),
      };
    }

    // Validate parent comment if provided
    if (parentCommentId) {
      const parentResult = await db.query(
        'SELECT id FROM comments WHERE id = $1 AND post_id = $2',
        [parentCommentId, postId]
      );

      if (parentResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Parent comment not found' }),
        };
      }
    }

    // Create comment in transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Prevent duplicate comments (same user, same post, same text within 60 seconds)
      const dupeCheck = await client.query(
        `SELECT id FROM comments WHERE user_id = $1 AND post_id = $2 AND text = $3 AND created_at > NOW() - INTERVAL '60 seconds' LIMIT 1`,
        [profile.id, postId, sanitizedText]
      );
      if (dupeCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return { statusCode: 409, headers, body: JSON.stringify({ success: false, message: 'Duplicate comment' }) };
      }

      // Insert comment
      const commentResult = await client.query(
        `INSERT INTO comments (user_id, post_id, text, parent_comment_id, content_status, toxicity_score, toxicity_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, text, parent_comment_id, created_at, updated_at`,
        [profile.id, postId, sanitizedText, parentCommentId || null, contentFlagged ? 'flagged' : 'clean', flagScore, flagCategory]
      );

      const comment = commentResult.rows[0];

      // Create notification for post author (if not self-comment)
      // Idempotent: ON CONFLICT prevents duplicates from Lambda retries
      if (post.author_id !== profile.id) {
        const idempotencyKey = `comment:${profile.id}:${comment.id}`;
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data, idempotency_key)
           VALUES ($1, 'comment', 'New Comment', $2, $3, $4)
           ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
          [
            post.author_id,
            `${profile.full_name || 'Someone'} commented on your post`,
            JSON.stringify({ postId, commentId: comment.id, commenterId: profile.id }),
            idempotencyKey,
          ]
        );
      }

      await client.query('COMMIT');

      // Log flagged comment for moderator review (non-blocking)
      if (contentFlagged) {
        try {
          await db.query(
            `INSERT INTO moderation_log (moderator_id, action_type, target_user_id, reason)
             VALUES ($1, 'flag_content', $2, $3)`,
            [SYSTEM_MODERATOR_ID, profile.id, `Comprehend toxicity on comment ${comment.id}: ${flagCategory} score=${flagScore}`],
          );
        } catch (flagErr) {
          log.error('Failed to log flagged comment (non-blocking)', flagErr);
        }
      }

      // Send push notification to post author (non-blocking)
      if (post.author_id !== profile.id) {
        sendPushToUser(db, post.author_id, {
          title: 'New Comment',
          body: `${profile.full_name || 'Someone'} commented on your post`,
          data: { type: 'comment', postId },
        }, profile.id).catch(err => log.error('Push notification failed', err));
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          comment: {
            id: comment.id,
            text: comment.text,
            parentCommentId: comment.parent_comment_id,
            createdAt: comment.created_at,
            updatedAt: comment.updated_at,
            author: {
              id: profile.id,
              username: profile.username,
              fullName: profile.full_name,
              avatarUrl: profile.avatar_url,
              isVerified: profile.is_verified || false,
              accountType: profile.account_type || 'personal',
              businessName: profile.business_name || null,
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
