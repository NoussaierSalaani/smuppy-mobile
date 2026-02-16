/**
 * Report Message Lambda Handler
 * Creates a report against a private message for content moderation.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { checkRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';
import { RATE_WINDOW_5_MIN, MAX_REPORT_REASON_LENGTH, MAX_REPORT_DETAILS_LENGTH } from '../utils/constants';

const log = createLogger('reports-message');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const rateLimit = await checkRateLimit({
      prefix: 'report-all',
      identifier: cognitoSub,
      windowSeconds: RATE_WINDOW_5_MIN,
      maxRequests: 5,
    });
    if (!rateLimit.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ message: 'Too many requests. Please try again later.' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { messageId, conversationId, reason, details } = body;

    if (!messageId || !isValidUUID(messageId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid message ID format' }) };
    }

    if (!conversationId || !isValidUUID(conversationId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid conversation ID format' }) };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Reason is required' }) };
    }

    const sanitizedReason = reason.replace(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_REASON_LENGTH);
    const sanitizedDetails = details
      ? String(details).replace(/<[^>]*>/g, '').trim().slice(0, MAX_REPORT_DETAILS_LENGTH)
      : null;

    const db = await getPool();

    const userResult = await db.query('SELECT id FROM profiles WHERE cognito_sub = $1', [cognitoSub]);
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }
    const reporterId = userResult.rows[0].id;

    // Verify message exists and reporter is a participant
    const messageResult = await db.query(
      `SELECT m.id, m.conversation_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND m.conversation_id = $2
         AND (c.participant_1_id = $3 OR c.participant_2_id = $3)`,
      [messageId, conversationId, reporterId]
    );
    if (messageResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Message not found or you are not a participant' }) };
    }

    const client = await db.connect();
    let result;
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT id FROM message_reports WHERE reporter_id = $1 AND message_id = $2 FOR UPDATE`,
        [reporterId, messageId]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        client.release();
        return { statusCode: 409, headers, body: JSON.stringify({ message: 'You have already reported this message' }) };
      }

      result = await client.query(
        `INSERT INTO message_reports (reporter_id, message_id, conversation_id, reason, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [reporterId, messageId, conversationId, sanitizedReason, sanitizedDetails]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    log.info('Message report created', { reportId: result.rows[0].id });

    // Auto-escalation: check if message sender should be escalated
    try {
      const senderResult = await db.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
      if (senderResult.rows.length > 0) {
        const userEscalation = await checkUserEscalation(db, senderResult.rows[0].sender_id);
        if (userEscalation.action !== 'none') {
          log.info('User escalation triggered', userEscalation);
        }
      }
    } catch (escErr) {
      log.error('Auto-escalation check failed (non-blocking)', escErr);
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id: result.rows[0].id, success: true }),
    };
  } catch (error: unknown) {
    log.error('Error reporting message', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal server error' }) };
  }
}
