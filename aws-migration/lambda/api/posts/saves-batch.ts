/**
 * Batch Check Saves Lambda Handler
 * Returns which posts in a batch the current user has saved
 */

import { createBatchCheckHandler } from '../utils/create-batch-check-handler';

export const handler = createBatchCheckHandler({
  tableName: 'saved_posts',
  responseKey: 'saves',
  loggerName: 'posts-saves-batch',
});
