-- Migration 008: Add Foreign Key for messages.conversation_id
-- Fixes the missing FK constraint between messages and conversations tables

-- Add the foreign key constraint
-- Note: conversation_id column already exists, we just need to add the FK reference
ALTER TABLE messages
ADD CONSTRAINT fk_messages_conversation_id
FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

COMMENT ON COLUMN messages.conversation_id IS 'Reference to the conversation this message belongs to';
