/**
 * Update Comment Lambda Handler
 * Updates a comment (only author can update)
 */

import { requireRateLimit } from '../utils/rate-limit';
import { withAuthHandler } from '../utils/with-auth-handler';
import { sanitizeText, isValidUUID } from '../utils/security';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { moderateText } from '../utils/text-moderation';

export const handler = withAuthHandler('comments-update', async (event, { headers, log, cognitoSub, profileId, db }) => {
    const rateLimitResponse = await requireRateLimit({ prefix: 'comments-update', identifier: cognitoSub, maxRequests: 20 }, headers);
    if (rateLimitResponse) return rateLimitResponse;

    // Account status check
    const accountCheck = await requireActiveAccount(cognitoSub, headers);
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

    // Moderate comment text (keyword filter + Comprehend toxicity)
    const modResult = await moderateText(sanitizedText, headers, log, 'comment update');
    if (modResult.blocked) return modResult.blockResponse!;

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
});
