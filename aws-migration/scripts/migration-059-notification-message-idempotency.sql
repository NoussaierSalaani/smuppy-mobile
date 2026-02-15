-- Migration 059: Add idempotency_key to notifications and client_message_id to messages
-- Prevents duplicate notifications on Lambda retries and message duplicates on network retries
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- =====================================================
-- NOTIFICATIONS IDEMPOTENCY
-- =====================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);

-- Partial unique index: only enforce uniqueness for non-null keys
-- Allows existing rows (without key) to coexist
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency_key
  ON notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- =====================================================
-- MESSAGES DEDUPLICATION
-- =====================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(64);

-- Partial unique index: (conversation_id, sender_id, client_message_id) for non-null keys
-- Prevents duplicate messages from network retries within the same conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_dedup
  ON messages (conversation_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS idx_notifications_idempotency_key;
-- ALTER TABLE notifications DROP COLUMN IF EXISTS idempotency_key;
-- DROP INDEX IF EXISTS idx_messages_client_dedup;
-- ALTER TABLE messages DROP COLUMN IF EXISTS client_message_id;
