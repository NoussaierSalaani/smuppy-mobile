/**
 * Report User Lambda Handler
 * Creates a report against a user for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';

export const handler = createReportHandler({
  loggerName: 'reports-user',
  resourceType: 'user',
  idField: 'userId',
  entityTable: 'profiles',
  reportTable: 'user_reports',
  resourceIdColumn: 'reported_user_id',
  preventSelfReport: true,
  runEscalation: async (db, log, userId) => {
    const userEscalation = await checkUserEscalation(db, userId);
    if (userEscalation.action !== 'none') {
      log.info('User escalation triggered from user report', userEscalation);
    }
  },
});
