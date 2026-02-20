/**
 * Get Optimized Feed Lambda Handler
 * Retrieves feed with is_liked and is_saved status per post
 */

import { createFeedHandler } from '../utils/create-feed-handler';

const { handler } = createFeedHandler({
  loggerName: 'feed-optimized',
  rateLimitPrefix: 'feed-optimized',
  rateLimitMax: 60,
  includeVideoFields: false,
  buildQuery: (_userId, params, cursorCondition, limitParamIndex) => ({
    sql: `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.media_meta, p.tags,
            p.likes_count, p.comments_count, p.created_at,
            pr.id as profile_id, pr.username, pr.full_name, pr.display_name, pr.avatar_url, pr.is_verified, pr.account_type, pr.business_name
     FROM posts p
     LEFT JOIN profiles pr ON p.author_id = pr.id
     WHERE pr.id IS NOT NULL
       AND p.visibility = 'public'
       AND pr.moderation_status NOT IN ('banned', 'shadow_banned')
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = p.author_id)
            OR (blocker_id = p.author_id AND blocked_id = $1)
       )
       ${cursorCondition}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${limitParamIndex}`,
    params,
  }),
});

export { handler };
