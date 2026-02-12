/**
 * Create Comment Lambda Handler
 * Adds a comment to a post
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { requireAuth, validateUUIDParam, isErrorResponse } from '../utils/validators';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';
import { SYSTEM_MODERATOR_ID } from '../../shared/moderation/constants';
import { sendPushToUser } from '../services/push-notification';
import { sanitizeText, isValidUUID } from '../utils/security';

const log = createLogger('comments-create');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = requireAuth(event, headers);
    if (isErrorResponse(userId)) return userId;

    const rateLimit = await checkRateLimit({
      prefix: 'comment-create',
      identifier: userId,
      windowSeconds: 60,
      maxRequests: 20,
    });
    if (!rateLimit.allowed) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      };
    }

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

    // Backend content moderation check
    const filterResult = await filterText(sanitizedText);
    if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Content policy violation' }),
      };
    }

    // AI toxicity detection (AWS Comprehend)
    let contentFlagged = false;
    let flagCategory: string | null = null;
    let flagScore: number | null = null;

    const toxicity = await analyzeTextToxicity(sanitizedText);
    if (toxicity.action === 'block') {
      log.info('Comment blocked by Comprehend', { topCategory: toxicity.topCategory, score: toxicity.maxScore });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Content policy violation' }),
      };
    }
    if (toxicity.action === 'flag') {
      contentFlagged = true;
      flagCategory = toxicity.topCategory;
      flagScore = toxicity.maxScore;
    }

    // Check account moderation status
    const accountCheck = await requireActiveAccount(userId, headers);
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

    const db = await getPool();

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

      // Insert comment
      const commentResult = await client.query(
        `INSERT INTO comments (user_id, post_id, text, parent_comment_id, content_status, toxicity_score, toxicity_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, text, parent_comment_id, created_at, updated_at`,
        [profile.id, postId, sanitizedText, parentCommentId || null, contentFlagged ? 'flagged' : 'clean', flagScore, flagCategory]
      );

      const comment = commentResult.rows[0];

      // Create notification for post author (if not self-comment)
      if (post.author_id !== profile.id) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'comment', 'New Comment', $2, $3)`,
          [
            post.author_id,
            `${profile.username} commented on your post`,
            JSON.stringify({ postId, commentId: comment.id, commenterId: profile.id }),
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
          body: `${profile.username} commented on your post`,
          data: { type: 'comment', postId },
        }).catch(err => log.error('Push notification failed', err));
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
  } catch (error: unknown) {
    log.error('Error creating comment', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
