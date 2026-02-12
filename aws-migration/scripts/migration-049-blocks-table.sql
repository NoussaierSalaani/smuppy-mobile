-- Migration 049: Create blocks table
-- Required by conversations/send-message.ts and conversations/create.ts
-- Allows users to block each other, preventing messaging and conversation creation

CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT blocks_unique UNIQUE (user_id, blocked_user_id),
    CONSTRAINT blocks_no_self CHECK (user_id != blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_user_id ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_user_id ON blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_blocks_pair ON blocks(user_id, blocked_user_id);

-- Rollback:
-- DROP INDEX IF EXISTS idx_blocks_pair;
-- DROP INDEX IF EXISTS idx_blocks_blocked_user_id;
-- DROP INDEX IF EXISTS idx_blocks_user_id;
-- DROP TABLE IF EXISTS blocks;
