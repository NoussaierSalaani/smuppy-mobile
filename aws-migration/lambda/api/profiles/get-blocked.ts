/**
 * Get Blocked Users Lambda Handler
 */

import { createToggleListHandler } from '../utils/create-toggle-handler';

export const handler = createToggleListHandler({
  loggerName: 'profiles-get-blocked',
  tableName: 'blocked_users',
  tableAlias: 'bu',
  actorColumn: 'blocker_id',
  targetColumn: 'blocked_id',
  mapRow: (row: Record<string, unknown>) => ({
    id: row.id,
    blocked_user_id: row.target_user_id,
    blocked_at: row.action_at,
    blocked_user: {
      id: row['target_user.id'],
      username: row['target_user.username'],
      display_name: row['target_user.display_name'],
      avatar_url: row['target_user.avatar_url'],
    },
  }),
  errorMessage: 'Error getting blocked users',
});
