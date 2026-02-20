/**
 * Is Spot Saved Lambda Handler
 * Checks if a spot is saved by the current user
 */

import { createSaveHandler } from '../utils/create-save-handler';

export const handler = createSaveHandler({
  action: 'check',
  resourceType: 'spot',
  loggerName: 'spots-is-saved',
  rateLimitPrefix: 'spot-check-saved',
});
