-- Migration 054: Resilience & performance indexes
-- Date: 2026-02-14
-- Purpose: Add composite indexes for feed EXISTS checks and WebSocket cleanup
-- All indexes use IF NOT EXISTS for idempotency

-- ==========================================
-- 1. peak_views: Feed isViewed check needs composite index
-- Query: EXISTS(SELECT 1 FROM peak_views WHERE peak_id = $1 AND user_id = $2)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_peak_views_peak_user
  ON peak_views (peak_id, user_id);

-- ==========================================
-- 2. websocket_connections: TTL-based cleanup for stale connections
-- Used by scheduled cleanup to remove connections older than threshold
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_ws_connections_connected_at
  ON websocket_connections (connected_at);

-- ==========================================
-- 3. processed_webhook_events: Cleanup old dedup entries
-- Used by periodic cleanup to remove events older than 24h
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON processed_webhook_events (created_at);

-- ==========================================
-- 4. channel_subscriptions: Fan lookup for active subscriptions
-- Query: WHERE fan_id = $1 AND creator_id = $2 AND status = 'active'
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_channel_subs_fan_creator_status
  ON channel_subscriptions (fan_id, creator_id, status);

-- ==========================================
-- 5. platform_subscriptions: User lookup for active subscription
-- Query: WHERE user_id = $1 AND status = 'active'
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_platform_subs_user_status
  ON platform_subscriptions (user_id, status);

-- ==========================================
-- 6. business_subscriptions: User lookup for active subscription
-- Query: WHERE user_id = $1 AND status = 'active'
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_business_subs_user_status
  ON business_subscriptions (user_id, business_id, status);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_peak_views_peak_user;
-- DROP INDEX IF EXISTS idx_ws_connections_connected_at;
-- DROP INDEX IF EXISTS idx_webhook_events_created_at;
-- DROP INDEX IF EXISTS idx_channel_subs_fan_creator_status;
-- DROP INDEX IF EXISTS idx_platform_subs_user_status;
-- DROP INDEX IF EXISTS idx_business_subs_user_status;
