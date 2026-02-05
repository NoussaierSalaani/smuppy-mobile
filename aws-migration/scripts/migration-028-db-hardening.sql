-- Migration 028: Database hardening
-- Fixes audit findings B5, B6, and adds missing indexes/constraints

-- B5: Change payments.creator_id from CASCADE to RESTRICT
-- Prevents accidental deletion of payment history when deleting a creator
-- Note: Must drop existing FK first, then recreate
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_creator_id_fkey' AND table_name = 'payments'
  ) THEN
    ALTER TABLE payments DROP CONSTRAINT payments_creator_id_fkey;
    ALTER TABLE payments ADD CONSTRAINT payments_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- B6: Add NOT NULL to counter columns (they have DEFAULT 0 but are nullable)
ALTER TABLE posts ALTER COLUMN likes_count SET NOT NULL;
ALTER TABLE posts ALTER COLUMN comments_count SET NOT NULL;
ALTER TABLE posts ALTER COLUMN views_count SET NOT NULL;

-- Missing composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channel_subs_creator_status
  ON channel_subscriptions(creator_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_buyer_status_created
  ON private_sessions(buyer_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_challenges_timing
  ON peak_challenges(starts_at, ends_at);

-- Cleanup: Add TTL-based partitioning hint for unbounded tables
-- processed_webhook_events: auto-cleanup via scheduled Lambda
-- peak_views: auto-cleanup via scheduled Lambda
-- notifications: add read_at index for cleanup queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_read_created
  ON notifications(read_at, created_at DESC) WHERE read_at IS NOT NULL;
