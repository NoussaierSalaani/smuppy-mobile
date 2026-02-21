-- Migration 064: Bidirectional block & creator subscription indexes
-- Date: 2026-02-21
-- Purpose: Optimize high-frequency query patterns identified by SQL audit
-- All indexes use IF NOT EXISTS for idempotency

-- ==========================================
-- 1. blocked_users: Reverse composite index for bidirectional lookups
--
-- The UNIQUE(blocker_id, blocked_id) constraint creates an implicit index
-- with blocker_id as the leading column. This handles the first branch of:
--   WHERE (bu.blocker_id = $N AND bu.blocked_id = col)
--      OR (bu.blocker_id = col AND bu.blocked_id = $N)
--
-- The second branch needs blocked_id as the leading column to avoid
-- falling back to the single-column idx_blocked_users_blocked index.
-- This reverse composite allows PostgreSQL to seek on blocked_id = $N
-- AND immediately check blocker_id = col in the same index scan.
--
-- Affected queries: blockExclusionSQL() in utils/block-filter.ts,
-- feed/following.ts, feed/optimized.ts, peaks/list.ts, peaks/get.ts,
-- conversations/list.ts (~10M+ executions/day across all feeds)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_blocker
  ON blocked_users (blocked_id, blocker_id);

-- ==========================================
-- 2. channel_subscriptions: Creator-side composite index
--
-- Existing idx_channel_subs_fan_creator_status covers fan-side queries.
-- Creator-side queries (list subscribers, subscriber count) filter on
-- (creator_id, status) but only have single-column indexes available.
--
-- Queries:
--   SELECT COUNT(*) FROM channel_subscriptions WHERE creator_id = $1 AND status = 'active'
--   SELECT ... FROM channel_subscriptions WHERE creator_id = $1 AND status IN ('active', 'canceling')
--
-- Affected: channel-subscription.ts (subscriber count, list subscribers)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_channel_subs_creator_status
  ON channel_subscriptions (creator_id, status);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_blocked_users_blocked_blocker;
-- DROP INDEX IF EXISTS idx_channel_subs_creator_status;
