/**
 * Mute User Lambda Handler
 */

import { withAuthHandler } from '../utils/with-auth-handler';
import { requireRateLimit } from '../utils/rate-limit';
import { isValidUUID } from '../utils/security';

export const handler = withAuthHandler('profiles-mute', async (event, { headers, cognitoSub, profileId: muterId, db }) => {
  const targetUserId = event.pathParameters?.id;
  if (!targetUserId || !isValidUUID(targetUserId)) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid user ID format' }) };
  }

  const rateLimitResponse = await requireRateLimit({
    prefix: 'mute-user',
    identifier: cognitoSub,
    windowSeconds: 60,
    maxRequests: 20,
  }, headers);
  if (rateLimitResponse) return rateLimitResponse;

  if (muterId === targetUserId) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Cannot mute yourself' }) };
  }

  // Verify target exists
  const targetResult = await db.query('SELECT id FROM profiles WHERE id = $1', [targetUserId]);
  if (targetResult.rows.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ message: 'User not found' }) };
  }

  await db.query(
    `INSERT INTO muted_users (muter_id, muted_id) VALUES ($1, $2) ON CONFLICT (muter_id, muted_id) DO NOTHING`,
    [muterId, targetUserId]
  );

  // Return muted user info
  const mutedInfo = await db.query(
    `SELECT mu.id, mu.muted_id AS muted_user_id, mu.created_at AS muted_at,
            p.id AS "muted_user.id", p.username AS "muted_user.username",
            p.display_name AS "muted_user.display_name", p.avatar_url AS "muted_user.avatar_url"
     FROM muted_users mu
     JOIN profiles p ON p.id = mu.muted_id
     WHERE mu.muter_id = $1 AND mu.muted_id = $2`,
    [muterId, targetUserId]
  );

  const row = mutedInfo.rows[0];
  const response = row ? {
    id: row.id,
    mutedUserId: row.muted_user_id,
    mutedAt: row.muted_at,
    mutedUser: {
      id: row['muted_user.id'],
      username: row['muted_user.username'],
      displayName: row['muted_user.display_name'],
      avatarUrl: row['muted_user.avatar_url'],
    },
  } : { success: true };

  return { statusCode: 201, headers, body: JSON.stringify(response) };
});
