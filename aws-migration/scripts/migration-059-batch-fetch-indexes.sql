-- Migration 059: Composite indexes for batch is_liked / is_saved fetch pattern
-- Date: 2026-02-15
-- Purpose: Support the new batch fetch pattern that replaced per-row EXISTS subqueries
--   Query: SELECT post_id FROM likes WHERE user_id = $1 AND post_id = ANY($2::uuid[])
--   Query: SELECT post_id FROM saved_posts WHERE user_id = $1 AND post_id = ANY($2::uuid[])
-- All indexes use IF NOT EXISTS for idempotency

-- ==========================================
-- 1. likes: Composite (user_id, post_id) for batch is_liked lookup
-- Existing indexes may have (post_id, user_id) or separate single-column indexes.
-- This composite has user_id first for the equality filter + post_id for ANY() scan.
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_likes_user_post
  ON likes (user_id, post_id);

-- ==========================================
-- 2. saved_posts: Composite (user_id, post_id) for batch is_saved lookup
-- Existing idx_saved_posts_post_user is (post_id, user_id) — wrong order for batch fetch.
-- This composite has user_id first for the equality filter + post_id for ANY() scan.
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_post
  ON saved_posts (user_id, post_id);

-- ==========================================
-- 3. follows: Covering indexes for CTE connection lookups in suggested.ts and posts/list.ts
-- Adds following_id/follower_id to existing (follower_id, status) / (following_id, status)
-- so the CTE SELECT can be satisfied from the index alone (index-only scan).
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_follows_follower_status_following
  ON follows (follower_id, status, following_id);

CREATE INDEX IF NOT EXISTS idx_follows_following_status_follower
  ON follows (following_id, status, follower_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_likes_user_post;
-- DROP INDEX IF EXISTS idx_saved_posts_user_post;
-- DROP INDEX IF EXISTS idx_follows_follower_status_following;
-- DROP INDEX IF EXISTS idx_follows_following_status_follower;
