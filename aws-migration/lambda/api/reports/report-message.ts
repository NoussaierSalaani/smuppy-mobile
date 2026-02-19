/**
 * Report Message Lambda Handler
 * Creates a report against a private message for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';

export const handler = createReportHandler({
  loggerName: 'reports-message',
  resourceType: 'message',
  idField: 'messageId',
  extraIdFields: ['conversationId'],
  customEntityCheck: async (db, messageId, reporterId, body) => {
    const result = await db.query(
      `SELECT m.id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = $1 AND m.conversation_id = $2
         AND (c.participant_1_id = $3 OR c.participant_2_id = $3)`,
      [messageId, body.conversationId, reporterId]
    );
    return result.rows.length > 0;
  },
  reportTable: 'message_reports',
  resourceIdColumn: 'message_id',
  extraInsertFields: [{ bodyField: 'conversationId', column: 'conversation_id' }],
  runEscalation: async (db, log, messageId) => {
    const senderResult = await db.query('SELECT sender_id FROM messages WHERE id = $1', [messageId]);
    if (senderResult.rows.length > 0) {
      const userEscalation = await checkUserEscalation(db, senderResult.rows[0].sender_id);
      if (userEscalation.action !== 'none') {
        log.info('User escalation triggered', userEscalation);
      }
    }
  },
});
