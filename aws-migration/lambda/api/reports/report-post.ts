/**
 * Report Post Lambda Handler
 * Creates a report against a post for content moderation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';

const log = createLogger('reports-post');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 100;
const MAX_DETAILS_LENGTH = 1000;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'report-post',
      identifier: cognitoSub,
      windowSeconds: 300,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { postId, reason, details } = body;

    if (!postId || !UUID_REGEX.test(postId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid post ID format' }) };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Reason is required' }) };
    }

    // Sanitize inputs
    const sanitizedReason = reason.replace(/<[^>]*>/g, '').trim().slice(0, MAX_REASON_LENGTH);
    const sanitizedDetails = details
      ? String(details).replace(/<[^>]*>/g, '').trim().slice(0, MAX_DETAILS_LENGTH)
      : null;

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const reporterId = userResult.rows[0].id;

    // Verify post exists
    const postResult = await db.query('SELECT id FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Post not found' }) };
    }

    // Atomic duplicate check + insert in a single transaction
    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM post_reports WHERE reporter_id = $1 AND post_id = $2 FOR UPDATE`,
        [reporterId, postId]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return { statusCode: 409, headers, body: JSON.stringify({ message: 'You have already reported this post' }) };
      }

      result = await client.query(
        `INSERT INTO post_reports (reporter_id, post_id, reason, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [reporterId, postId, sanitizedReason, sanitizedDetails]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    log.info('Post report created', { reportId: result.rows[0].id });

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id: result.rows[0].id, success: true }),
    };
  } catch (error: unknown) {
    log.error('Error reporting post', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}
