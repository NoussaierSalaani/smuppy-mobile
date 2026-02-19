/**
 * Report Post Lambda Handler
 * Creates a report against a post for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkPostEscalation, checkUserEscalation } from '../../shared/moderation/autoEscalation';

export const handler = createReportHandler({
  loggerName: 'reports-post',
  resourceType: 'post',
  idField: 'postId',
  entityTable: 'posts',
  reportTable: 'post_reports',
  resourceIdColumn: 'post_id',
  runEscalation: async (db, log, postId) => {
    const postEscalation = await checkPostEscalation(db, postId);
    if (postEscalation.action !== 'none') {
      log.info('Auto-escalation triggered', postEscalation);
    }
    const authorResult = await db.query('SELECT author_id FROM posts WHERE id = $1', [postId]);
    if (authorResult.rows.length > 0) {
      const userEscalation = await checkUserEscalation(db, authorResult.rows[0].author_id);
      if (userEscalation.action !== 'none') {
        log.info('User escalation triggered', userEscalation);
      }
    }
  },
});
