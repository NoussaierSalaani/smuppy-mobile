-- SMUPPY DATABASE SETUP

-- PART 0: ADD MISSING COLUMNS TO PROFILES
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'post_count') THEN
    ALTER TABLE profiles ADD COLUMN post_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'fan_count') THEN
    ALTER TABLE profiles ADD COLUMN fan_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'interests') THEN
    ALTER TABLE profiles ADD COLUMN interests TEXT[] DEFAULT '{}';
  END IF;
END $$;

-- PART 1: ADD TAGS COLUMN TO POSTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'tags') THEN
    ALTER TABLE posts ADD COLUMN tags TEXT[] DEFAULT '{}';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN (tags);

-- PART 2: ADD TAGS TO EXISTING POSTS
DO $$
DECLARE
  post_record RECORD;
  caption_lower TEXT;
  tags_array TEXT[];
BEGIN
  FOR post_record IN SELECT id, caption FROM posts WHERE tags IS NULL OR tags = '{}' LOOP
    caption_lower := LOWER(COALESCE(post_record.caption, ''));
    tags_array := ARRAY[]::TEXT[];
    IF caption_lower LIKE '%workout%' OR caption_lower LIKE '%gym%' OR caption_lower LIKE '%training%' THEN
      tags_array := array_cat(tags_array, ARRAY['Fitness', 'Gym']);
    END IF;
    IF caption_lower LIKE '%yoga%' OR caption_lower LIKE '%stretch%' THEN
      tags_array := array_cat(tags_array, ARRAY['Yoga', 'Wellness']);
    END IF;
    IF caption_lower LIKE '%run%' OR caption_lower LIKE '%cardio%' THEN
      tags_array := array_cat(tags_array, ARRAY['Running', 'Cardio']);
    END IF;
    IF caption_lower LIKE '%meditation%' OR caption_lower LIKE '%mindful%' THEN
      tags_array := array_cat(tags_array, ARRAY['Meditation', 'Wellness']);
    END IF;
    IF caption_lower LIKE '%nutrition%' OR caption_lower LIKE '%protein%' OR caption_lower LIKE '%healthy%' THEN
      tags_array := array_cat(tags_array, ARRAY['Nutrition', 'Wellness']);
    END IF;
    IF array_length(tags_array, 1) IS NULL THEN
      tags_array := ARRAY['Fitness', 'Wellness'];
    END IF;
    UPDATE posts SET tags = tags_array WHERE id = post_record.id;
  END LOOP;
END $$;

-- PART 3: POST COUNT TRIGGER
CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET post_count = COALESCE(post_count, 0) + 1 WHERE id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET post_count = GREATEST(COALESCE(post_count, 0) - 1, 0) WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_post_count ON posts;
CREATE TRIGGER trigger_update_post_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_count();

-- PART 4: FAN COUNT TRIGGER
CREATE OR REPLACE FUNCTION update_fan_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET fan_count = COALESCE(fan_count, 0) + 1 WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0) WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fan_count ON follows;
CREATE TRIGGER trigger_update_fan_count
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_fan_count();

-- PART 5: UPDATE CURRENT STATS
UPDATE profiles p SET post_count = (SELECT COUNT(*) FROM posts WHERE posts.author_id = p.id);
UPDATE profiles p SET fan_count = (SELECT COUNT(*) FROM follows WHERE follows.following_id = p.id);

-- PART 6: ENABLE RLS ON TABLES (without policies for now)
ALTER TABLE IF EXISTS notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deleted_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS spots ENABLE ROW LEVEL SECURITY;

-- VERIFICATION
SELECT 'Posts' as metric, COUNT(*) as total FROM posts
UNION ALL SELECT 'Profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'Follows', COUNT(*) FROM follows;

SELECT tablename, CASE WHEN rowsecurity THEN 'RLS ON' ELSE 'RLS OFF' END as status
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
