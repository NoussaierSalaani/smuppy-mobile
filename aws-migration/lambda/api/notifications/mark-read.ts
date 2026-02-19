/**
 * Mark Notification Read Lambda Handler
 * Marks a single notification as read
 */

import { createNotificationHandler } from '../utils/create-notification-handler';

export const handler = createNotificationHandler({
  operation: 'read',
  maxRequests: 60,
  loggerName: 'notifications-mark-read',
  successMessage: 'Notification marked as read',
});
