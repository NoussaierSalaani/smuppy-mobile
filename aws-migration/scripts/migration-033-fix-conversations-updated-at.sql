-- Migration 031: Add missing updated_at column to conversations and messages tables
-- Fix: trigger update_updated_at_column() was applied to these tables by migration-015
-- but the column didn't exist, causing "record 'new' has no field 'updated_at'" error
--
-- Rollback: ALTER TABLE conversations DROP COLUMN IF EXISTS updated_at;
--           ALTER TABLE messages DROP COLUMN IF EXISTS updated_at;

-- Add updated_at to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add updated_at to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill conversations.updated_at from last_message_at or created_at
UPDATE conversations SET updated_at = COALESCE(last_message_at, created_at) WHERE updated_at IS NULL;

-- Backfill messages.updated_at from created_at
UPDATE messages SET updated_at = created_at WHERE updated_at IS NULL;
