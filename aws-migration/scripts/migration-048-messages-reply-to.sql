-- ============================================
-- MIGRATION 048: Messages Reply-To Support
-- Date: 2025-02-09
-- Description: Add reply_to_message_id column for swipe-to-reply feature
-- ============================================

BEGIN;

-- ============================================
-- ADD COLUMN TO MESSAGES TABLE
-- ============================================
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- ============================================
-- INDEX FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
ON messages(reply_to_message_id)
WHERE reply_to_message_id IS NOT NULL;

-- ============================================
-- UPDATE get_conversation_messages FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before_cursor TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  media_url TEXT,
  media_type VARCHAR(50),
  is_deleted BOOLEAN,
  reply_to_message_id UUID,
  reply_to_content TEXT,
  reply_to_sender_id UUID,
  reply_to_sender_username VARCHAR(50),
  reply_to_sender_display_name VARCHAR(100),
  reply_to_sender_avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  sender JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH message_data AS (
    SELECT 
      m.id,
      m.conversation_id,
      m.sender_id,
      m.content,
      m.media_url,
      m.media_type,
      m.is_deleted,
      m.reply_to_message_id,
      m.created_at,
      jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      ) AS sender
    FROM messages m
    JOIN profiles p ON m.sender_id = p.id
    WHERE m.conversation_id = p_conversation_id
      AND (p_before_cursor IS NULL OR m.created_at < p_before_cursor)
    ORDER BY m.created_at DESC
    LIMIT p_limit
  )
  SELECT 
    md.id,
    md.conversation_id,
    md.sender_id,
    md.content,
    md.media_url,
    md.media_type,
    md.is_deleted,
    md.reply_to_message_id,
    reply_msg.content AS reply_to_content,
    reply_msg.sender_id AS reply_to_sender_id,
    reply_sender.username AS reply_to_sender_username,
    reply_sender.display_name AS reply_to_sender_display_name,
    reply_sender.avatar_url AS reply_to_sender_avatar_url,
    md.created_at,
    md.sender
  FROM message_data md
  LEFT JOIN messages reply_msg ON md.reply_to_message_id = reply_msg.id
  LEFT JOIN profiles reply_sender ON reply_msg.sender_id = reply_sender.id
  ORDER BY md.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Rollback commands (for reference):
-- DROP INDEX IF EXISTS idx_messages_reply_to;
-- ALTER TABLE messages DROP COLUMN IF EXISTS reply_to_message_id;
-- DROP FUNCTION IF EXISTS get_conversation_messages(UUID, INTEGER, TIMESTAMP WITH TIME ZONE);
