-- Migration 021: Add Foreign Key for messages.conversation_id
-- Fixes the missing FK constraint between messages and conversations tables

-- Add the foreign key constraint (idempotent)
-- Note: conversation_id column already exists, we just need to add the FK reference
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_conversation_id') THEN
    ALTER TABLE messages
    ADD CONSTRAINT fk_messages_conversation_id
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN messages.conversation_id IS 'Reference to the conversation this message belongs to';
