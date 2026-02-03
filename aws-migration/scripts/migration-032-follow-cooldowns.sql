-- Migration 032: Follow Cooldowns
-- Tracks unfollow counts per follower-following pair for anti-spam cooldown

-- Create follow_cooldowns table
CREATE TABLE IF NOT EXISTS follow_cooldowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  unfollow_count INTEGER NOT NULL DEFAULT 0,
  last_unfollow_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_follow_cooldowns_follower ON follow_cooldowns(follower_id);
CREATE INDEX IF NOT EXISTS idx_follow_cooldowns_following ON follow_cooldowns(following_id);
CREATE INDEX IF NOT EXISTS idx_follow_cooldowns_pair ON follow_cooldowns(follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_follow_cooldowns_until ON follow_cooldowns(cooldown_until) WHERE cooldown_until IS NOT NULL;

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_follow_cooldowns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_follow_cooldowns_updated_at ON follow_cooldowns;
CREATE TRIGGER trigger_follow_cooldowns_updated_at
  BEFORE UPDATE ON follow_cooldowns
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_cooldowns_updated_at();

-- Add comment for documentation
COMMENT ON TABLE follow_cooldowns IS 'Tracks unfollow counts for anti-spam cooldown. After 2+ unfollows, user must wait 7 days before following again.';
COMMENT ON COLUMN follow_cooldowns.unfollow_count IS 'Number of times user unfollowed this specific target';
COMMENT ON COLUMN follow_cooldowns.cooldown_until IS 'If set, user cannot follow until this timestamp';

-- Rollback:
-- DROP TRIGGER IF EXISTS trigger_follow_cooldowns_updated_at ON follow_cooldowns;
-- DROP FUNCTION IF EXISTS update_follow_cooldowns_updated_at();
-- DROP TABLE IF EXISTS follow_cooldowns;
