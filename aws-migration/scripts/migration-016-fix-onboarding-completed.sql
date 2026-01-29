-- Migration 016: Fix onboarding_completed for existing profiles
-- Marks legitimate profiles as completed and removes ghost/duplicate profiles

BEGIN;

-- 1. Mark completed profiles (have name + username + account_type = real users)
UPDATE profiles
SET onboarding_completed = true, updated_at = NOW()
WHERE onboarding_completed = false
  AND account_type IS NOT NULL
  AND full_name IS NOT NULL AND full_name != ''
  AND username IS NOT NULL AND username != '';

-- 2. Delete ghost profiles (failed signup attempts with no real data)
DELETE FROM profiles
WHERE onboarding_completed = false
  AND (full_name IS NULL OR full_name = '')
  AND created_at < NOW() - INTERVAL '1 hour';

COMMIT;
