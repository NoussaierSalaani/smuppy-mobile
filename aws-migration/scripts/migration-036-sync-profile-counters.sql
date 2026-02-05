-- Migration 036: Sync all profile counters with actual data
-- Fixes fan_count, following_count, and post_count that may be out of sync
-- This migration is idempotent and safe to run multiple times

-- =====================================================
-- Recalculate fan_count for all profiles
-- fan_count = number of accepted followers (people following this user)
-- =====================================================
UPDATE profiles p
SET fan_count = COALESCE((
  SELECT COUNT(*)
  FROM follows f
  WHERE f.following_id = p.id
    AND f.status = 'accepted'
), 0);

-- =====================================================
-- Recalculate following_count for all profiles
-- following_count = number of users this profile follows
-- =====================================================
UPDATE profiles p
SET following_count = COALESCE((
  SELECT COUNT(*)
  FROM follows f
  WHERE f.follower_id = p.id
    AND f.status = 'accepted'
), 0);

-- =====================================================
-- Recalculate post_count for all profiles
-- post_count = number of posts authored by this user
-- =====================================================
UPDATE profiles p
SET post_count = COALESCE((
  SELECT COUNT(*)
  FROM posts
  WHERE author_id = p.id
), 0);

-- =====================================================
-- Recalculate likes_count for all posts
-- =====================================================
UPDATE posts p
SET likes_count = COALESCE((
  SELECT COUNT(*)
  FROM likes l
  WHERE l.post_id = p.id
), 0);

-- =====================================================
-- Recalculate comments_count for all posts
-- =====================================================
UPDATE posts p
SET comments_count = COALESCE((
  SELECT COUNT(*)
  FROM comments c
  WHERE c.post_id = p.id
), 0);

-- =====================================================
-- Log the sync operation (optional, for audit purposes)
-- =====================================================
DO $$
DECLARE
  profiles_updated INT;
  posts_updated INT;
BEGIN
  SELECT COUNT(*) INTO profiles_updated FROM profiles;
  SELECT COUNT(*) INTO posts_updated FROM posts;
  RAISE NOTICE 'Counter sync complete: % profiles, % posts updated', profiles_updated, posts_updated;
END $$;

-- =====================================================
-- ROLLBACK INSTRUCTIONS (if needed):
-- This migration only updates counters to correct values.
-- There is no rollback needed as the data is now accurate.
-- Re-running this migration will simply recalculate all counters again.
-- =====================================================
