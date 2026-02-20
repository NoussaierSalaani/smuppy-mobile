/**
 * Unsave Post Lambda Handler
 * Removes a post from user's saved/bookmarks
 */

import { createSaveHandler } from '../utils/create-save-handler';

export const handler = createSaveHandler({
  action: 'unsave',
  resourceType: 'post',
  loggerName: 'posts-unsave',
  rateLimitPrefix: 'posts-unsave',
  rateLimitMax: 30,
});
