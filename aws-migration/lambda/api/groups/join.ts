/**
 * Join Group Lambda Handler
 * Join an activity group
 */

import { cors } from '../utils/cors';
import { createGroupActionHandler } from '../utils/create-group-action-handler';

export const { handler } = createGroupActionHandler({
  action: 'join',
  loggerName: 'groups-join',
  rateLimitPrefix: 'groups-join',
  rateLimitMax: 10,
  groupColumns: 'id, status, max_participants, current_participants, is_free, price, currency',
  onAction: async (client, group, profileId, groupId) => {
    // Check group is active
    if (group.status !== 'active') {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Group is no longer active' }),
      });
    }

    // Check if paid group — return payment required signal (same pattern as events/join.ts)
    if (!group.is_free && (group.price as number) > 0) {
      return cors({
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          requiresPayment: true,
          price: typeof group.price === 'number' ? group.price : Number.parseInt(group.price as string, 10),
          currency: (group.currency as string) || 'EUR',
          message: 'Payment required to join this group',
        }),
      });
    }

    // Check if already joined
    const existingResult = await client.query(
      `SELECT id FROM group_participants
       WHERE group_id = $1 AND user_id = $2`,
      [groupId, profileId]
    );

    if (existingResult.rows.length > 0) {
      return cors({
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Already a member of this group' }),
      });
    }

    // BUG-2026-02-14: Atomic capacity check + increment to prevent race conditions
    if (group.max_participants) {
      const capacityResult = await client.query(
        `UPDATE groups SET current_participants = current_participants + 1
         WHERE id = $1 AND current_participants < max_participants
         RETURNING current_participants`,
        [groupId]
      );
      if (capacityResult.rowCount === 0) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({ success: false, message: 'Group is full' }),
        });
      }
    } else {
      await client.query(
        `UPDATE groups SET current_participants = current_participants + 1
         WHERE id = $1`,
        [groupId]
      );
    }

    // Insert participant
    await client.query(
      `INSERT INTO group_participants (group_id, user_id)
       VALUES ($1, $2)`,
      [groupId, profileId]
    );

    return cors({
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Joined group successfully' }),
    });
  },
});
