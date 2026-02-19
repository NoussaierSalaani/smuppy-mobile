/**
 * Update Comment Lambda Handler
 * Updates a comment (only author can update)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { requireRateLimit } from '../utils/rate-limit';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

const log = createLogger('comments-update');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const rateLimitResponse = await requireRateLimit({ prefix: 'comments-update', identifier: userId, maxRequests: 20 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check
    const accountCheck = await requireActiveAccount(userId, headers);
    if (isAccountError(accountCheck)) return accountCheck;

    const commentId = event.pathParameters?.id;
    if (!commentId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment ID is required' }),
      };
    }

    // Validate UUID format
    if (!isValidUUID(commentId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid comment ID format' }),
      };
    }

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment text is required' }),
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

    // Moderate comment text
    const filterResult = await filterText(sanitizedText);
    if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
      log.warn('Comment update blocked by filter', { userId: userId.substring(0, 8) + '***' });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Your comment contains content that violates our community guidelines.' }),
      };
    }
    const toxicityResult = await analyzeTextToxicity(sanitizedText);
    if (toxicityResult.action === 'block') {
      log.warn('Comment update blocked by toxicity', { userId: userId.substring(0, 8) + '***' });
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Your comment contains content that violates our community guidelines.' }),
      };
    }

    const db = await getPool();

    // Get user's profile ID (check both id and cognito_sub for consistency)
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profileId = userResult.rows[0].id;

    // Check if comment exists and user owns it
    const commentResult = await db.query(
      'SELECT id, user_id FROM comments WHERE id = $1',
      [commentId]
    );

    if (commentResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Comment not found' }),
      };
    }

    const comment = commentResult.rows[0];

    // Only author can update
    if (comment.user_id !== profileId) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Not authorized to update this comment' }),
      };
    }

    // Update comment
    const updateResult = await db.query(
      `UPDATE comments
       SET text = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, text, created_at, updated_at`,
      [sanitizedText, commentId]
    );

    const updatedComment = updateResult.rows[0];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        comment: {
          id: updatedComment.id,
          text: updatedComment.text,
          createdAt: updatedComment.created_at,
          updatedAt: updatedComment.updated_at,
        },
      }),
    };
  } catch (error: unknown) {
    log.error('Error updating comment', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
