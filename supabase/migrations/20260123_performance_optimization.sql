-- =====================================================
-- PERFORMANCE OPTIMIZATION MIGRATION
-- Date: 2026-01-23
-- This migration adds all necessary indexes for optimal performance
-- All table references are guarded to handle missing tables gracefully
-- =====================================================

-- Enable pg_trgm extension for text search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- 1. POSTS TABLE - CRITICAL INDEXES
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') THEN
    -- Composite index for public feed queries
    DROP INDEX IF EXISTS idx_posts_visibility_created_at;
    CREATE INDEX idx_posts_visibility_created_at ON posts(visibility, created_at DESC) WHERE visibility = 'public';

    -- Index for discovery feed with likes sorting
    DROP INDEX IF EXISTS idx_posts_visibility_likes_created;
    CREATE INDEX idx_posts_visibility_likes_created ON posts(visibility, likes_count DESC, created_at DESC) WHERE visibility = 'public';

    -- Composite index for author + visibility
    DROP INDEX IF EXISTS idx_posts_author_visibility_created;
    CREATE INDEX idx_posts_author_visibility_created ON posts(author_id, visibility, created_at DESC);

    -- Index for fan feed
    DROP INDEX IF EXISTS idx_posts_author_created;
    CREATE INDEX idx_posts_author_created ON posts(author_id, created_at DESC);
  END IF;
END;
$$;

-- =====================================================
-- 2. PROFILES TABLE - SEARCH & SUGGESTIONS
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    -- Trigram index for fast username search
    DROP INDEX IF EXISTS idx_profiles_username_trgm;
    CREATE INDEX idx_profiles_username_trgm ON profiles USING gin(username gin_trgm_ops);

    -- Trigram index for fast full_name search
    DROP INDEX IF EXISTS idx_profiles_full_name_trgm;
    CREATE INDEX idx_profiles_full_name_trgm ON profiles USING gin(full_name gin_trgm_ops);

    -- Index for suggested profiles (verified + popular)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_verified') THEN
      DROP INDEX IF EXISTS idx_profiles_verified_fan_count;
      CREATE INDEX idx_profiles_verified_fan_count ON profiles(is_verified DESC, fan_count DESC) WHERE is_verified = TRUE;
    END IF;

    -- Index for pro accounts discovery
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'account_type') THEN
      DROP INDEX IF EXISTS idx_profiles_pro_accounts;
      CREATE INDEX idx_profiles_pro_accounts ON profiles(account_type, fan_count DESC, created_at DESC) WHERE account_type IN ('pro_creator', 'pro_local');
    END IF;

    -- GIN index for interests overlap queries
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'interests') THEN
      DROP INDEX IF EXISTS idx_profiles_interests;
      CREATE INDEX idx_profiles_interests ON profiles USING gin(interests);
    END IF;
  END IF;
END;
$$;

-- =====================================================
-- 3. FOLLOWS TABLE - SOCIAL GRAPH
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    DROP INDEX IF EXISTS idx_follows_follower_following;
    CREATE INDEX idx_follows_follower_following ON follows(follower_id, following_id);

    DROP INDEX IF EXISTS idx_follows_following_created;
    CREATE INDEX idx_follows_following_created ON follows(following_id, created_at DESC);
  END IF;
END;
$$;

-- =====================================================
-- 4. LIKES TABLE - INTERACTION CHECKS
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'likes') THEN
    DROP INDEX IF EXISTS idx_likes_user_post;
    CREATE INDEX idx_likes_user_post ON likes(user_id, post_id);

    DROP INDEX IF EXISTS idx_likes_post_created;
    CREATE INDEX idx_likes_post_created ON likes(post_id, created_at DESC);
  END IF;
END;
$$;

-- =====================================================
-- 5. COMMENTS TABLE - THREADED DISCUSSIONS
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    DROP INDEX IF EXISTS idx_comments_post_parent_created;
    CREATE INDEX idx_comments_post_parent_created ON comments(post_id, parent_comment_id NULLS FIRST, created_at ASC);

    DROP INDEX IF EXISTS idx_comments_user_created;
    CREATE INDEX idx_comments_user_created ON comments(user_id, created_at DESC);
  END IF;
END;
$$;

-- =====================================================
-- 6. POST_SAVES TABLE - BOOKMARKS (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'post_saves') THEN
    DROP INDEX IF EXISTS idx_post_saves_user_post;
    CREATE INDEX idx_post_saves_user_post ON post_saves(user_id, post_id);

    DROP INDEX IF EXISTS idx_post_saves_user_created;
    CREATE INDEX idx_post_saves_user_created ON post_saves(user_id, created_at DESC);
  END IF;
END;
$$;

-- =====================================================
-- 7. SPOTS TABLE - GEOGRAPHIC QUERIES (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spots') THEN
    DROP INDEX IF EXISTS idx_spots_category_visibility_created;
    CREATE INDEX idx_spots_category_visibility_created ON spots(category, visibility, created_at DESC) WHERE visibility = 'public';

    DROP INDEX IF EXISTS idx_spots_sport_visibility;
    CREATE INDEX idx_spots_sport_visibility ON spots(sport_type, visibility, created_at DESC) WHERE visibility = 'public';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'spots' AND column_name = 'rating_average') THEN
      DROP INDEX IF EXISTS idx_spots_rating_saves;
      CREATE INDEX idx_spots_rating_saves ON spots(rating_average DESC, save_count DESC) WHERE visibility = 'public';
    END IF;
  END IF;
END;
$$;

-- =====================================================
-- 8. SPOT_SAVES & SPOT_REVIEWS (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spot_saves') THEN
    DROP INDEX IF EXISTS idx_spot_saves_user_spot;
    CREATE INDEX idx_spot_saves_user_spot ON spot_saves(user_id, spot_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'spot_reviews') THEN
    DROP INDEX IF EXISTS idx_spot_reviews_spot_rating;
    CREATE INDEX idx_spot_reviews_spot_rating ON spot_reviews(spot_id, rating);
  END IF;
END;
$$;

-- =====================================================
-- 9. BLOCKED & MUTED USERS (if exists)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'blocked_users') THEN
    DROP INDEX IF EXISTS idx_blocked_users_composite;
    CREATE INDEX idx_blocked_users_composite ON blocked_users(user_id, blocked_user_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muted_users') THEN
    DROP INDEX IF EXISTS idx_muted_users_composite;
    CREATE INDEX idx_muted_users_composite ON muted_users(user_id, muted_user_id);
  END IF;
END;
$$;

-- =====================================================
-- 10. OTHER TABLES (if exists with required columns)
-- =====================================================

DO $$
BEGIN
  -- Notifications: only if user_id column exists
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id') THEN
    DROP INDEX IF EXISTS idx_notifications_user_read;
    DROP INDEX IF EXISTS idx_notifications_user_created;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'is_read') THEN
      CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
    END IF;
    CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
  END IF;
END;
$$;

DO $$
BEGIN
  -- Conversations
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'last_message_at') THEN
    DROP INDEX IF EXISTS idx_conversations_last_message;
    CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
  END IF;
END;
$$;

DO $$
BEGIN
  -- Messages
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'conversation_id') THEN
    DROP INDEX IF EXISTS idx_messages_conversation_created;
    CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
  END IF;
END;
$$;

DO $$
BEGIN
  -- User interests
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_interests' AND column_name = 'user_id') THEN
    DROP INDEX IF EXISTS idx_user_interests_user_interest;
    CREATE INDEX idx_user_interests_user_interest ON user_interests(user_id, interest_id);
  END IF;
END;
$$;

DO $$
BEGIN
  -- Reports
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'status') THEN
    DROP INDEX IF EXISTS idx_reports_status_created;
    CREATE INDEX idx_reports_status_created ON reports(status, created_at DESC);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'report_type') THEN
      DROP INDEX IF EXISTS idx_reports_type_status;
      CREATE INDEX idx_reports_type_status ON reports(report_type, status, created_at DESC);
    END IF;
  END IF;
END;
$$;

-- =====================================================
-- 11. ANALYZE EXISTING TABLES
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'posts') THEN
    ANALYZE posts;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ANALYZE profiles;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'follows') THEN
    ANALYZE follows;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'likes') THEN
    ANALYZE likes;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    ANALYZE comments;
  END IF;
END;
$$;

-- =====================================================
-- 12. OPTIMIZED FUNCTIONS
-- =====================================================

-- Function to check multiple likes at once (batch operation)
CREATE OR REPLACE FUNCTION public.check_likes_batch(
  p_user_id UUID,
  p_post_ids UUID[]
)
RETURNS TABLE (post_id UUID, has_liked BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pid,
    EXISTS(SELECT 1 FROM public.likes l WHERE l.post_id = pid AND l.user_id = p_user_id)
  FROM unnest(p_post_ids) AS pid;
END;
$$;

-- Function for optimized profile search
CREATE OR REPLACE FUNCTION public.search_profiles_optimized(
  p_search_term TEXT,
  p_current_user_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN,
  account_type TEXT,
  fan_count INT,
  is_following BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.username,
    pr.full_name,
    pr.avatar_url,
    COALESCE(pr.is_verified, FALSE),
    pr.account_type::TEXT,
    COALESCE(pr.fan_count, 0)::INT,
    EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_id = p_current_user_id AND f.following_id = pr.id)
  FROM public.profiles pr
  WHERE pr.id != p_current_user_id
    AND (
      pr.username ILIKE '%' || p_search_term || '%'
      OR pr.full_name ILIKE '%' || p_search_term || '%'
    )
  ORDER BY
    pr.is_verified DESC,
    pr.fan_count DESC
  LIMIT p_limit;
END;
$$;

-- =====================================================
-- DONE
-- =====================================================
