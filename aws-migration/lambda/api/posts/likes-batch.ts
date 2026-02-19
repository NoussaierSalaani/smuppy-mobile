/**
 * Batch Check Likes Lambda Handler
 * Returns which posts in a batch the current user has liked
 */

import { createBatchCheckHandler } from '../utils/create-batch-check-handler';

export const handler = createBatchCheckHandler({
  tableName: 'likes',
  responseKey: 'likes',
  loggerName: 'posts-likes-batch',
});
