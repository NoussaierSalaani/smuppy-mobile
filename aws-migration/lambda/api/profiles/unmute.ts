/**
 * Unmute User Lambda Handler
 */

import { createToggleDeleteHandler } from '../utils/create-toggle-handler';

export const handler = createToggleDeleteHandler({
  loggerName: 'profiles-unmute',
  tableName: 'muted_users',
  actorColumn: 'muter_id',
  targetColumn: 'muted_id',
  rateLimitPrefix: 'unmute-user',
  rateLimitMax: 20,
  errorMessage: 'Error unmuting user',
});
