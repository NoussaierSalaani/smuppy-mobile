/**
 * Report Live Stream Lambda Handler
 * Creates a report against a live stream for content moderation.
 */

import { createReportHandler } from '../utils/create-report-handler';
import { checkUserEscalation } from '../../shared/moderation/autoEscalation';

export const handler = createReportHandler({
  loggerName: 'reports-livestream',
  resourceType: 'live stream',
  idField: 'liveStreamId',
  entityTable: 'live_streams',
  reportTable: 'live_stream_reports',
  resourceIdColumn: 'live_stream_id',
  runEscalation: async (db, log, liveStreamId) => {
    const streamerResult = await db.query('SELECT host_id FROM live_streams WHERE id = $1', [liveStreamId]);
    if (streamerResult.rows.length > 0) {
      const userEscalation = await checkUserEscalation(db, streamerResult.rows[0].host_id);
      if (userEscalation.action !== 'none') {
        log.info('User escalation triggered', userEscalation);
      }
    }
  },
});
