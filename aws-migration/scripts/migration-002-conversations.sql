-- Migration 002: Conversations & Messaging
-- Tables for direct messaging between users

-- =====================================================
-- CONVERSATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    participant_2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(participant_1_id, participant_2_id)
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(participant_1_id, participant_2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT,
    media_type VARCHAR(20),
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);

-- Add FK constraint for messages.conversation_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_messages_conversation_id'
    ) THEN
        ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation_id
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    END IF;
END $$;
