-- Migration 057: Performance indexes identified by database audit 2026-02-15
-- All indexes use CONCURRENTLY to avoid table locks on production
-- Idempotent: IF NOT EXISTS on all statements

-- P0: CRITICAL — notifications JSONB data queries (10s+ on deletes at scale)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_data_gin
  ON notifications USING GIN (data jsonb_path_ops);

-- P1: moderation_status partial index (200-500ms overhead on every feed query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_moderation_banned
  ON profiles(id) WHERE moderation_status IN ('banned', 'shadow_banned');

-- P2: peak_hidden composite for NOT EXISTS optimization (500ms+ on peaks feed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peak_hidden_user_peak
  ON peak_hidden(user_id, peak_id);

-- P2: peak_comments composite for cursor pagination (200-500ms on popular peaks)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peak_comments_peak_created
  ON peak_comments(peak_id, created_at DESC);

-- P2: peak_reactions composite for GROUP BY aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peak_reactions_peak_type
  ON peak_reactions(peak_id, reaction_type);

-- P2: post_tags for batch fetch with ANY() (used in posts/list.ts tagged users)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_tags_post_id
  ON post_tags(post_id);

-- P2: posts engagement score for explore feed optimization
-- Supports ORDER BY (likes_count + comments_count) DESC, created_at DESC
-- with 30-day window filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_engagement_recent
  ON posts(created_at DESC, likes_count DESC, comments_count DESC)
  WHERE visibility != 'hidden' AND created_at > NOW() - INTERVAL '30 days';

-- Rollback:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_data_gin;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_moderation_banned;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_peak_hidden_user_peak;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_peak_comments_peak_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_peak_reactions_peak_type;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_post_tags_post_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_engagement_recent;
