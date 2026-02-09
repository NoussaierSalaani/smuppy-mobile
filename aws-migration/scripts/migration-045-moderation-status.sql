-- Migration 045: Add moderation status to profiles
-- Phase 1B of content moderation plan
-- Enables account suspension and banning

-- Add moderation columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'active'
    CHECK (moderation_status IN ('active', 'suspended', 'banned', 'shadow_banned')),
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Index for quick lookups on moderation status
CREATE INDEX IF NOT EXISTS idx_profiles_moderation_status
  ON profiles(moderation_status)
  WHERE moderation_status != 'active';

-- Rollback:
-- ALTER TABLE profiles
--   DROP COLUMN IF EXISTS moderation_status,
--   DROP COLUMN IF EXISTS suspended_until,
--   DROP COLUMN IF EXISTS ban_reason;
-- DROP INDEX IF EXISTS idx_profiles_moderation_status;
