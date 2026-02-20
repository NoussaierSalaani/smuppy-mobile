/**
 * Unsave Spot Lambda Handler
 * Removes a spot from the user's saved list
 */

import { createSaveHandler } from '../utils/create-save-handler';

export const handler = createSaveHandler({
  action: 'unsave',
  resourceType: 'spot',
  loggerName: 'spots-unsave',
  rateLimitPrefix: 'spot-unsave',
  rateLimitMax: 30,
});
