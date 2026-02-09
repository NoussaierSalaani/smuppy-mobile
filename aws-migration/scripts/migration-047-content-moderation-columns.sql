-- Migration 047: Content moderation columns + system moderator profile
-- Adds content_status, toxicity_score, toxicity_category to posts/comments/peaks
-- Adds system moderator profile for auto-escalation log entries
-- Adds 'hidden' to posts visibility CHECK constraint
--
-- Idempotent: all operations use IF NOT EXISTS / IF EXISTS guards

BEGIN;

-- ============================================================
-- 1. System moderator profile for auto-escalation log entries
-- ============================================================
INSERT INTO profiles (id, cognito_sub, username, full_name, account_type)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system-moderator',
  'system',
  'System Moderator',
  'personal'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Content moderation columns on posts
-- ============================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS content_status VARCHAR(20) DEFAULT 'clean';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS toxicity_score DECIMAL(4,3);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS toxicity_category VARCHAR(50);

-- ============================================================
-- 3. Content moderation columns on comments
-- ============================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS content_status VARCHAR(20) DEFAULT 'clean';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS toxicity_score DECIMAL(4,3);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS toxicity_category VARCHAR(50);

-- ============================================================
-- 4. Content moderation columns on peaks
-- ============================================================
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS content_status VARCHAR(20) DEFAULT 'clean';
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS toxicity_score DECIMAL(4,3);
ALTER TABLE peaks ADD COLUMN IF NOT EXISTS toxicity_category VARCHAR(50);

-- ============================================================
-- 5. Add 'hidden' to posts visibility CHECK constraint
--    Drop existing constraint first (if it exists), then re-create
-- ============================================================
DO $$
BEGIN
  -- Try to drop the existing visibility check constraint
  -- The constraint name may vary; common patterns are checked
  BEGIN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_visibility_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- constraint doesn't exist, that's fine
  END;

  BEGIN
    ALTER TABLE posts DROP CONSTRAINT IF EXISTS check_visibility;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;

  -- Add new constraint that includes 'hidden'
  -- Only add if no check constraint on visibility exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%visibility%'
      AND constraint_schema = current_schema()
  ) THEN
    ALTER TABLE posts ADD CONSTRAINT posts_visibility_check
      CHECK (visibility IN ('public', 'fans', 'private', 'subscribers', 'hidden'));
  END IF;
END $$;

-- ============================================================
-- 6. Partial indexes for admin moderation queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_content_status_flagged
  ON posts (content_status) WHERE content_status != 'clean';

CREATE INDEX IF NOT EXISTS idx_comments_content_status_flagged
  ON comments (content_status) WHERE content_status != 'clean';

CREATE INDEX IF NOT EXISTS idx_peaks_content_status_flagged
  ON peaks (content_status) WHERE content_status != 'clean';

COMMIT;

-- ============================================================
-- ROLLBACK (manual — run if migration needs to be reverted)
-- ============================================================
-- BEGIN;
-- ALTER TABLE posts DROP COLUMN IF EXISTS content_status;
-- ALTER TABLE posts DROP COLUMN IF EXISTS toxicity_score;
-- ALTER TABLE posts DROP COLUMN IF EXISTS toxicity_category;
-- ALTER TABLE comments DROP COLUMN IF EXISTS content_status;
-- ALTER TABLE comments DROP COLUMN IF EXISTS toxicity_score;
-- ALTER TABLE comments DROP COLUMN IF EXISTS toxicity_category;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS content_status;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS toxicity_score;
-- ALTER TABLE peaks DROP COLUMN IF EXISTS toxicity_category;
-- DROP INDEX IF EXISTS idx_posts_content_status_flagged;
-- DROP INDEX IF EXISTS idx_comments_content_status_flagged;
-- DROP INDEX IF EXISTS idx_peaks_content_status_flagged;
-- DELETE FROM profiles WHERE id = '00000000-0000-0000-0000-000000000000';
-- COMMIT;
