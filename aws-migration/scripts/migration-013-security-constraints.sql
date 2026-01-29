-- Migration 013: Security constraints and missing indexes
-- Fixes audit issues #21-24

-- =====================================================
-- #21: CHECK constraints on financial amounts
-- =====================================================
ALTER TABLE payments ADD CONSTRAINT chk_gross_amount_positive CHECK (gross_amount >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_net_amount_positive CHECK (net_amount >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_platform_fee_positive CHECK (platform_fee >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_creator_amount_positive CHECK (creator_amount >= 0);

-- =====================================================
-- #22: Prevent duplicate conversations (A,B) and (B,A)
-- =====================================================
-- Ensure participant_1_id < participant_2_id to canonicalize order
ALTER TABLE conversations ADD CONSTRAINT chk_participants_ordered
  CHECK (participant_1_id < participant_2_id);

-- =====================================================
-- #23: Missing composite indexes for performance
-- =====================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_visibility_created
  ON posts(visibility, created_at DESC);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_likes_post_user
  ON likes(post_id, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_status
  ON follows(follower_id, following_id, status);

-- =====================================================
-- #24: Ensure messages FK exists (idempotent, already in migration-002)
-- =====================================================
-- Already handled by migration-002 and migration-008-messages-fk
