-- Migration 038: Add live_enabled column to notification_preferences
-- This column controls push notifications for live stream events
-- Idempotent: uses IF NOT EXISTS

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS live_enabled BOOLEAN DEFAULT TRUE;

-- Rollback:
-- ALTER TABLE notification_preferences DROP COLUMN IF EXISTS live_enabled;
