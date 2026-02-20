/**
 * Save Post Lambda Handler
 * Saves/bookmarks a post for the user
 */

import { createSaveHandler } from '../utils/create-save-handler';

export const handler = createSaveHandler({
  action: 'save',
  resourceType: 'post',
  loggerName: 'posts-save',
  rateLimitPrefix: 'post-save',
  rateLimitMax: 30,
});
