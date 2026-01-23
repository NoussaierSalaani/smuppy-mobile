-- =====================================================
-- FIX FAN COUNT SYNC
-- Date: 2026-01-23
-- =====================================================
-- This migration ensures fan_count is properly synced
-- and the trigger is working correctly
-- =====================================================

-- Ensure fan_count column exists with default value
ALTER TABLE profiles
  ALTER COLUMN fan_count SET DEFAULT 0;

-- Update all NULL fan_counts to 0
UPDATE profiles SET fan_count = 0 WHERE fan_count IS NULL;

-- Drop existing triggers to recreate them properly
DROP TRIGGER IF EXISTS trigger_update_fan_count ON follows;
DROP TRIGGER IF EXISTS update_fan_count_trigger ON follows;

-- Create/Replace the function with proper logic
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER trigger_update_fan_count
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW
  EXECUTE FUNCTION update_fan_count();

-- =====================================================
-- SYNC ALL FAN COUNTS FROM ACTUAL FOLLOWS
-- =====================================================
UPDATE profiles p
SET fan_count = (
  SELECT COUNT(*)
  FROM follows f
  WHERE f.following_id = p.id
);

-- Log the sync
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count FROM profiles WHERE fan_count > 0;
  RAISE NOTICE 'Fan counts synced. Profiles with fans: %', updated_count;
END;
$$;
