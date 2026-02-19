/**
 * Report Comment Lambda Handler
 * Creates a report against a comment for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';

export const handler = createReportHandler({
  loggerName: 'reports-comment',
  resourceType: 'comment',
  idField: 'commentId',
  entityTable: 'comments',
  reportTable: 'comment_reports',
  resourceIdColumn: 'comment_id',
  runEscalation: async (db, log, commentId) => {
    const authorResult = await db.query('SELECT user_id FROM comments WHERE id = $1', [commentId]);
    if (authorResult.rows.length > 0) {
      const userEscalation = await checkUserEscalation(db, authorResult.rows[0].user_id);
      if (userEscalation.action !== 'none') {
        log.info('User escalation triggered', userEscalation);
      }
    }
  },
});
