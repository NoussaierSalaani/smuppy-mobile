-- Migration 015: Counter triggers and missing indexes
-- Fixes audit issues #26 (race-safe counters) and #27 (missing indexes)

-- =====================================================
-- #26: Trigger-based counters (race-condition proof)
-- =====================================================

-- Generic updated_at trigger (reusable)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Likes counter trigger
CREATE OR REPLACE FUNCTION update_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_likes_count ON likes;
CREATE TRIGGER trigger_likes_count
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_likes_count();

-- Comments counter trigger
CREATE OR REPLACE FUNCTION update_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_comments_count ON comments;
CREATE TRIGGER trigger_comments_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comments_count();

-- Followers counter trigger
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'accepted' THEN
    UPDATE profiles SET fan_count = COALESCE(fan_count, 0) + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'accepted' THEN
    UPDATE profiles SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0) WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = OLD.follower_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status change: pending -> accepted
    IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET fan_count = COALESCE(fan_count, 0) + 1 WHERE id = NEW.following_id;
      UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = NEW.follower_id;
    -- Handle status change: accepted -> anything else
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
      UPDATE profiles SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0) WHERE id = OLD.following_id;
      UPDATE profiles SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0) WHERE id = OLD.follower_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_follow_counts ON follows;
CREATE TRIGGER trigger_follow_counts
  AFTER INSERT OR UPDATE OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Post count trigger
CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET post_count = COALESCE(post_count, 0) + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET post_count = GREATEST(COALESCE(post_count, 0) - 1, 0) WHERE id = OLD.author_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_post_count ON posts;
CREATE TRIGGER trigger_post_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_count();

-- =====================================================
-- #27: Missing composite indexes
-- =====================================================

-- Posts feed query
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_visibility_peak_created
  ON posts(visibility, created_at DESC) WHERE visibility = 'public';

-- Peak views dedup table (#37)
CREATE TABLE IF NOT EXISTS peak_views (
  peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (peak_id, user_id)
);

-- Comments by post
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at DESC);

-- Messages by conversation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

-- Payments by creator
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_creator_status_created
  ON payments(creator_id, status, created_at DESC);

-- CHECK constraints on profile counters (#52)
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_fan_count_positive CHECK (fan_count >= 0);
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_following_count_positive CHECK (following_count >= 0);
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_post_count_positive CHECK (post_count >= 0);

-- #58: updated_at triggers for tables missing them
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'profiles', 'posts', 'comments', 'follows',
    'conversations',
    'peak_challenges', 'events', 'challenge_tags'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trigger_updated_at_%I ON %I;
       CREATE TRIGGER trigger_updated_at_%I
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- #60: Messages must have content or media
ALTER TABLE messages ADD CONSTRAINT IF NOT EXISTS chk_message_has_content
  CHECK (content IS NOT NULL OR media_url IS NOT NULL);
