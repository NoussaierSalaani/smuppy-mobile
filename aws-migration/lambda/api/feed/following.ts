/**
 * Get Following Feed Lambda Handler
 * Retrieves posts from users the current user follows
 */

import { createFeedHandler } from '../utils/create-feed-handler';

const { handler } = createFeedHandler({
  loggerName: 'feed-following',
  rateLimitPrefix: 'feed-following',
  rateLimitMax: 60,
  includeVideoFields: true,
  buildQuery: (userId, params, cursorCondition, limitParamIndex) => ({
    sql: `SELECT p.id, p.author_id, p.content, p.media_urls, p.media_type, p.media_meta, p.tags,
            p.likes_count, p.comments_count, p.created_at,
            p.video_status, p.hls_url, p.thumbnail_url, p.video_variants, p.video_duration,
            pr.id as profile_id, pr.username, pr.full_name, pr.display_name, pr.avatar_url, pr.is_verified, pr.account_type, pr.business_name
     FROM posts p
     LEFT JOIN profiles pr ON p.author_id = pr.id
     WHERE pr.id IS NOT NULL
       AND p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $1 AND status = 'accepted')
       AND COALESCE(pr.moderation_status, 'active') NOT IN ('banned', 'shadow_banned')
       AND p.visibility NOT IN ('private', 'hidden')
       AND NOT EXISTS (
         SELECT 1 FROM blocked_users
         WHERE (blocker_id = $1 AND blocked_id = p.author_id)
            OR (blocker_id = p.author_id AND blocked_id = $1)
       )
       AND NOT EXISTS (
         SELECT 1 FROM muted_users WHERE muter_id = $1 AND muted_id = p.author_id
       )
       AND (
         p.visibility IN ('public', 'fans')
         OR (p.visibility = 'subscribers' AND EXISTS(
           SELECT 1 FROM channel_subscriptions
           WHERE fan_id = $1 AND creator_id = p.author_id AND status = 'active'
         ))
       )
       ${cursorCondition}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $${limitParamIndex}`,
    params,
  }),
});

export { handler };
