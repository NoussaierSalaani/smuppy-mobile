/**
 * Unblock User Lambda Handler
 */

import { createToggleDeleteHandler } from '../utils/create-toggle-handler';

export const handler = createToggleDeleteHandler({
  loggerName: 'profiles-unblock',
  tableName: 'blocked_users',
  actorColumn: 'blocker_id',
  targetColumn: 'blocked_id',
  rateLimitPrefix: 'unblock-user',
  rateLimitMax: 10,
  errorMessage: 'Error unblocking user',
});
