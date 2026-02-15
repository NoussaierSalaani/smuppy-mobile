-- Migration 060: Messaging performance indexes
-- Adds composite indexes for conversation message listing and unread count queries.
-- All CREATE INDEX IF NOT EXISTS — safe to re-run (idempotent).

-- Messages: conversation listing ordered by created_at (used by GET /conversations/{id}/messages)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

-- Messages: unread count per conversation (used by GET /conversations subquery)
CREATE INDEX IF NOT EXISTS idx_messages_conv_sender_read
  ON messages (conversation_id, sender_id, read)
  WHERE read = false;

-- Conversations: list ordered by last_message_at (used by GET /conversations)
CREATE INDEX IF NOT EXISTS idx_conversations_participant1_last_msg
  ON conversations (participant_1_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_participant2_last_msg
  ON conversations (participant_2_id, last_message_at DESC);

-- Rollback:
-- DROP INDEX IF EXISTS idx_messages_conv_created;
-- DROP INDEX IF EXISTS idx_messages_conv_sender_read;
-- DROP INDEX IF EXISTS idx_conversations_participant1_last_msg;
-- DROP INDEX IF EXISTS idx_conversations_participant2_last_msg;
