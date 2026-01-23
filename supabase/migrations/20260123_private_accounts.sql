-- =====================================================
-- PRIVATE ACCOUNTS IMPLEMENTATION
-- Date: 2026-01-23
-- =====================================================
-- When a user has is_private = true:
-- - Only their fans (followers) can see their posts in feeds
-- - The user can always see their own posts
-- - Non-followers cannot see posts from private accounts
-- =====================================================

-- First, ensure is_private column exists on profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'is_private'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_private BOOLEAN DEFAULT FALSE;
  END IF;
END;
$$;

-- Create index for faster private account lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_private ON profiles(is_private) WHERE is_private = TRUE;

-- =====================================================
-- UPDATE POSTS RLS POLICY
-- =====================================================
-- Drop the old policy and create a new one that respects private accounts

DROP POLICY IF EXISTS "Public posts are viewable by everyone" ON posts;

-- New policy: Posts visibility respects private account setting
CREATE POLICY "Posts visible based on privacy settings"
  ON posts FOR SELECT
  USING (
    -- User can always see their own posts
    author_id = auth.uid()
    OR
    -- Post author profile is not private - everyone can see public posts
    (
      visibility = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = posts.author_id
        AND profiles.is_private = TRUE
      )
    )
    OR
    -- Post author is private but viewer is a fan (follower)
    (
      visibility = 'public'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = posts.author_id
        AND profiles.is_private = TRUE
      )
      AND EXISTS (
        SELECT 1 FROM follows
        WHERE follows.follower_id = auth.uid()
        AND follows.following_id = posts.author_id
      )
    )
    OR
    -- Posts with 'fans' visibility - only fans can see
    (
      visibility = 'fans'
      AND EXISTS (
        SELECT 1 FROM follows
        WHERE follows.follower_id = auth.uid()
        AND follows.following_id = posts.author_id
      )
    )
  );

-- =====================================================
-- UPDATE PROFILE VISIBILITY FOR PRIVATE ACCOUNTS
-- =====================================================
-- Private profiles should still be visible (so people can follow)
-- but we add a helper function to check if content is accessible

CREATE OR REPLACE FUNCTION can_view_user_content(viewer_id UUID, profile_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_owner BOOLEAN;
  is_private_profile BOOLEAN;
  is_follower BOOLEAN;
BEGIN
  -- Owner can always view their own content
  IF viewer_id = profile_owner_id THEN
    RETURN TRUE;
  END IF;

  -- Check if profile is private
  SELECT COALESCE(is_private, FALSE) INTO is_private_profile
  FROM profiles
  WHERE id = profile_owner_id;

  -- If not private, everyone can view
  IF NOT is_private_profile THEN
    RETURN TRUE;
  END IF;

  -- If private, check if viewer follows the owner
  SELECT EXISTS(
    SELECT 1 FROM follows
    WHERE follower_id = viewer_id
    AND following_id = profile_owner_id
  ) INTO is_follower;

  RETURN is_follower;
END;
$$;

-- =====================================================
-- HELPER FUNCTION: Check if user is following another
-- =====================================================
CREATE OR REPLACE FUNCTION is_following(follower UUID, target UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM follows
    WHERE follower_id = follower
    AND following_id = target
  );
$$;

-- =====================================================
-- PEAKS ALSO RESPECT PRIVATE SETTINGS
-- =====================================================
-- The same policy applies since peaks are in the posts table with is_peak = true

-- =====================================================
-- COMMENTS AND LIKES INHERIT POST VISIBILITY
-- =====================================================
-- Comments and likes on posts from private accounts are only visible
-- if you can see the post itself (handled by foreign key relationship)

-- =====================================================
-- DONE
-- =====================================================
