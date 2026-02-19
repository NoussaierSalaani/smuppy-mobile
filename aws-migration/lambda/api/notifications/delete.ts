/**
 * Delete Notification Lambda Handler
 * Deletes a single notification
 */

import { createNotificationHandler } from '../utils/create-notification-handler';

export const handler = createNotificationHandler({
  operation: 'delete',
  maxRequests: 30,
  loggerName: 'notifications-delete',
  successMessage: 'Notification deleted',
});
