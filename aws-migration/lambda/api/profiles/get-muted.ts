/**
 * Get Muted Users Lambda Handler
 */

import { createToggleListHandler } from '../utils/create-toggle-handler';

export const handler = createToggleListHandler({
  loggerName: 'profiles-get-muted',
  tableName: 'muted_users',
  tableAlias: 'mu',
  actorColumn: 'muter_id',
  targetColumn: 'muted_id',
  mapRow: (row: Record<string, unknown>) => ({
    id: row.id,
    mutedUserId: row.target_user_id,
    mutedAt: row.action_at,
    mutedUser: {
      id: row['target_user.id'],
      username: row['target_user.username'],
      displayName: row['target_user.display_name'],
      avatarUrl: row['target_user.avatar_url'],
    },
  }),
  errorMessage: 'Error getting muted users',
});
