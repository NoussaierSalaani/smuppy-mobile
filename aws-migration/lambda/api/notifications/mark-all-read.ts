/**
 * Mark All Notifications Read Lambda Handler
 * Marks all user's notifications as read
 */

import { withNotificationContext } from '../utils/create-notification-handler';

export const handler = withNotificationContext(
  {
    loggerName: 'notifications-mark-all-read',
    rateLimitPrefix: 'notif-mark-read',
    maxRequests: 10,
    windowSeconds: 60,
    failOpen: true,
    errorLabel: 'Error marking all notifications read',
  },
  async ({ profileId, db, headers }) => {
    const result = await db.query(
      `UPDATE notifications
       SET read = true
       WHERE user_id = $1 AND read = false`,
      [profileId],
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'All notifications marked as read',
        count: result.rowCount,
      }),
    };
  },
);
