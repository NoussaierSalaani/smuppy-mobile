/**
 * Leave Group Lambda Handler
 * Leave an activity group
 */

import { cors } from '../utils/cors';
import { createGroupActionHandler } from '../utils/create-group-action-handler';

export const { handler } = createGroupActionHandler({
  action: 'leave',
  loggerName: 'groups-leave',
  rateLimitPrefix: 'groups-leave',
  rateLimitMax: 10,
  groupColumns: 'id, creator_id',
  onAction: async (client, group, profileId, groupId) => {
    // Check if user is the creator
    if (group.creator_id === profileId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group creator cannot leave the group' }),
      });
    }

    // Check if user is a member
    const memberResult = await client.query(
      `SELECT id FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    if (memberResult.rows.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'You are not a member of this group' }),
      });
    }

    // Remove participant
    await client.query(
      `DELETE FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    // Update participant count
    await client.query(
      `UPDATE groups SET current_participants = GREATEST(current_participants - 1, 0)
       WHERE id = $1`,
      [groupId]
    );

    return cors({
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Left group successfully' }),
    });
  },
});
