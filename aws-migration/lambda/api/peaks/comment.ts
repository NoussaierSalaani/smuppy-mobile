/**
 * Comment on Peak Lambda Handler
 * Adds a comment to a peak
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';

const log = createLogger('peaks-comment');

// Simple input sanitization
function sanitizeText(text: string): string {
  return text
    .trim()
    .slice(0, 1000) // Max 1000 characters for peak comments
    .replace(/\0/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const peakId = event.pathParameters?.id;
    if (!peakId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Peak ID is required' }),
      };
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(peakId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid peak ID format' }),
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

    const sanitizedText = sanitizeText(text);

    if (sanitizedText.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Comment text cannot be empty' }),
      };
    }

    const db = await getPool();

    // Get user's profile
    const userResult = await db.query(
      'SELECT id, username, full_name, avatar_url, is_verified FROM profiles WHERE cognito_sub = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User profile not found' }),
      };
    }

    const profile = userResult.rows[0];

    // Check if peak exists
    const peakResult = await db.query(
      'SELECT id, author_id FROM peaks WHERE id = $1',
      [peakId]
    );

    if (peakResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Peak not found' }),
      };
    }

    const peak = peakResult.rows[0];

    // Create comment in transaction
    // CRITICAL: Use dedicated client for transaction isolation with connection pooling
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Insert comment
      const commentResult = await client.query(
        `INSERT INTO peak_comments (user_id, peak_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, text, created_at`,
        [profile.id, peakId, sanitizedText]
      );

      const comment = commentResult.rows[0];

      // Update comments count on peak
      await client.query(
        'UPDATE peaks SET comments_count = comments_count + 1 WHERE id = $1',
        [peakId]
      );

      // Create notification for peak author (if not self-comment)
      if (peak.author_id !== profile.id) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'peak_comment', 'New Comment', $2, $3)`,
          [
            peak.author_id,
            `${profile.username} commented on your peak`,
            JSON.stringify({ peakId, commentId: comment.id, commenterId: profile.id }),
          ]
        );
      }

      await client.query('COMMIT');

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          comment: {
            id: comment.id,
            text: comment.text,
            createdAt: comment.created_at,
            author: {
              id: profile.id,
              username: profile.username,
              fullName: profile.full_name,
              avatarUrl: profile.avatar_url,
              isVerified: profile.is_verified || false,
            },
          },
        }),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    log.error('Error creating peak comment', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
