/**
 * Save Spot Lambda Handler
 * Saves a spot to the user's saved list
 */

import { createSaveHandler } from '../utils/create-save-handler';

export const handler = createSaveHandler({
  action: 'save',
  resourceType: 'spot',
  loggerName: 'spots-save',
  rateLimitPrefix: 'spot-save',
  rateLimitMax: 30,
});
