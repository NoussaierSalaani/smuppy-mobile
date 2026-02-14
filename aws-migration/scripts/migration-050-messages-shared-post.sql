-- ============================================
-- MIGRATION 050: Messages Shared Post Support
-- Date: 2025-02-12
-- Description: Add shared_post_id column to messages table
--              for in-app post sharing between users
-- ============================================

BEGIN;

-- Add shared_post_id column (nullable FK to posts)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS shared_post_id UUID;

-- Index for lookups (only index non-null rows)
CREATE INDEX IF NOT EXISTS idx_messages_shared_post_id
ON messages(shared_post_id)
WHERE shared_post_id IS NOT NULL;

-- FK constraint: soft reference (SET NULL on delete so messages survive post deletion)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_shared_post_id'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT fk_messages_shared_post_id
        FOREIGN KEY (shared_post_id) REFERENCES posts(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;

-- Rollback commands (for reference):
-- ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_shared_post_id;
-- DROP INDEX IF EXISTS idx_messages_shared_post_id;
-- ALTER TABLE messages DROP COLUMN IF EXISTS shared_post_id;
