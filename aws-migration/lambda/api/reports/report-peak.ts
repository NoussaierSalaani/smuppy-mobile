/**
 * Report Peak Lambda Handler
 * Creates a report against a peak for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkPeakEscalation, checkUserEscalation } from '../../shared/moderation/autoEscalation';

const VALID_REASONS = [
  'inappropriate',
  'spam',
  'harassment',
  'violence',
  'misinformation',
  'copyright',
  'other',
];

export const handler = createReportHandler({
  loggerName: 'reports-peak',
  resourceType: 'peak',
  idField: 'peakId',
  entityTable: 'peaks',
  reportTable: 'peak_reports',
  resourceIdColumn: 'peak_id',
  validReasons: VALID_REASONS,
  runEscalation: async (db, log, peakId) => {
    const peakEscalation = await checkPeakEscalation(db, peakId);
    if (peakEscalation.action !== 'none') {
      log.info('Peak escalation triggered', peakEscalation);
    }
    const authorResult = await db.query('SELECT author_id FROM peaks WHERE id = $1', [peakId]);
    if (authorResult.rows.length > 0) {
      const userEscalation = await checkUserEscalation(db, authorResult.rows[0].author_id);
      if (userEscalation.action !== 'none') {
        log.info('User escalation triggered from peak report', userEscalation);
      }
    }
  },
});
