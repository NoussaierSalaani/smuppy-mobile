-- Migration: Stats triggers and bot social network
-- Date: 2026-01-23

-- ============================================
-- PART 1: POST COUNT TRIGGER
-- ============================================

-- Function to update post_count when posts are inserted/deleted
CREATE OR REPLACE FUNCTION update_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
    SET post_count = COALESCE(post_count, 0) + 1
    WHERE id = NEW.user_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
    SET post_count = GREATEST(COALESCE(post_count, 0) - 1, 0)
    WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for posts table
DROP TRIGGER IF EXISTS trigger_update_post_count ON posts;
CREATE TRIGGER trigger_update_post_count
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_post_count();

-- ============================================
-- PART 2: FAN COUNT TRIGGER
-- ============================================

-- Function to update fan_count when follows are inserted/deleted
CREATE OR REPLACE FUNCTION update_fan_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment fan_count for the followed user
    UPDATE profiles
    SET fan_count = COALESCE(fan_count, 0) + 1
    WHERE id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement fan_count for the unfollowed user
    UPDATE profiles
    SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for follows table
DROP TRIGGER IF EXISTS trigger_update_fan_count ON follows;
CREATE TRIGGER trigger_update_fan_count
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW
  EXECUTE FUNCTION update_fan_count();

-- ============================================
-- PART 3: UPDATE CURRENT STATS
-- ============================================

-- Update post_count for all profiles based on actual posts
UPDATE profiles p
SET post_count = (
  SELECT COUNT(*)
  FROM posts
  WHERE posts.user_id = p.id
);

-- Update fan_count for all profiles based on actual follows
UPDATE profiles p
SET fan_count = (
  SELECT COUNT(*)
  FROM follows
  WHERE follows.following_id = p.id
);

-- ============================================
-- PART 4: CREATE BOT SOCIAL NETWORK
-- Each bot follows 5-15 random other bots
-- ============================================

DO $$
DECLARE
  bot_record RECORD;
  target_bot_id UUID;
  follow_count INT;
  i INT;
BEGIN
  -- Loop through all bot profiles (those with is_bot = true or name like 'fit_%')
  FOR bot_record IN
    SELECT id
    FROM profiles
    WHERE is_bot = true
       OR username LIKE 'fit_%'
       OR username LIKE 'wellness_%'
       OR username LIKE 'yoga_%'
       OR username LIKE 'runner_%'
       OR email LIKE '%@smuppy-bot.local'
  LOOP
    -- Random number of follows between 5 and 15
    follow_count := 5 + floor(random() * 11)::int;

    FOR i IN 1..follow_count LOOP
      -- Get a random bot that this bot doesn't already follow
      SELECT id INTO target_bot_id
      FROM profiles
      WHERE (is_bot = true OR username LIKE 'fit_%' OR username LIKE 'wellness_%'
             OR username LIKE 'yoga_%' OR username LIKE 'runner_%' OR email LIKE '%@smuppy-bot.local')
        AND id != bot_record.id
        AND id NOT IN (
          SELECT following_id
          FROM follows
          WHERE follower_id = bot_record.id
        )
      ORDER BY random()
      LIMIT 1;

      -- Insert follow relationship if we found a target
      IF target_bot_id IS NOT NULL THEN
        INSERT INTO follows (follower_id, following_id)
        VALUES (bot_record.id, target_bot_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================
-- PART 5: RECALCULATE FAN_COUNT AFTER BOT FOLLOWS
-- ============================================

UPDATE profiles p
SET fan_count = (
  SELECT COUNT(*)
  FROM follows
  WHERE follows.following_id = p.id
);

-- Log the results
DO $$
DECLARE
  total_follows INT;
  total_bots INT;
  avg_fans NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_follows FROM follows;
  SELECT COUNT(*) INTO total_bots FROM profiles WHERE is_bot = true OR email LIKE '%@smuppy-bot.local';
  SELECT AVG(fan_count) INTO avg_fans FROM profiles WHERE is_bot = true OR email LIKE '%@smuppy-bot.local';

  RAISE NOTICE 'Migration complete:';
  RAISE NOTICE '  Total follows: %', total_follows;
  RAISE NOTICE '  Total bots: %', total_bots;
  RAISE NOTICE '  Average fans per bot: %', COALESCE(avg_fans, 0);
END $$;
