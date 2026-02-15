-- Migration 053: Add missing critical indexes for query performance
-- Date: 2026-02-14
-- Purpose: Add indexes identified during deep security & scalability audit
-- All indexes use IF NOT EXISTS for idempotency

-- ==========================================
-- 1. saved_posts: Feed EXISTS check needs composite index
-- Query: EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = $1)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_saved_posts_post_user
  ON saved_posts (post_id, user_id);

-- ==========================================
-- 2. peak_likes: Peaks list isLiked check needs composite index
-- Query: EXISTS(SELECT 1 FROM peak_likes pl WHERE pl.peak_id = pk.id AND pl.user_id = $1)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_peak_likes_user_peak
  ON peak_likes (user_id, peak_id);

-- ==========================================
-- 3. conversations: OR clause per participant needs individual indexes
-- Query: WHERE c.participant_1_id = $1 OR c.participant_2_id = $1
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1
  ON conversations (participant_1_id);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_2
  ON conversations (participant_2_id);

-- ==========================================
-- 4. Full-text search indexes for posts and peaks
-- Query: WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_posts_content_fts
  ON posts USING GIN (to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_peaks_caption_fts
  ON peaks USING GIN (to_tsvector('english', caption));

-- ==========================================
-- 5. Profile search: display_name trigram index (username and full_name already have one)
-- Query: WHERE display_name ILIKE '%query%'
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON profiles USING GIN (display_name gin_trgm_ops);

-- ==========================================
-- 6. Messages unread count: conversation + read status for unread count subquery
-- Query: SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND read = false
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_messages_conv_unread
  ON messages (conversation_id, sender_id, read)
  WHERE read = false;

-- ==========================================
-- 7. Notification dedup: type + data + created_at for the new dedup queries
-- Query: SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND data = $3::jsonb AND created_at > ...
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
  ON notifications (user_id, type, created_at DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_saved_posts_post_user;
-- DROP INDEX IF EXISTS idx_peak_likes_user_peak;
-- DROP INDEX IF EXISTS idx_conversations_participant_1;
-- DROP INDEX IF EXISTS idx_conversations_participant_2;
-- DROP INDEX IF EXISTS idx_posts_content_fts;
-- DROP INDEX IF EXISTS idx_peaks_caption_fts;
-- DROP INDEX IF EXISTS idx_profiles_display_name_trgm;
-- DROP INDEX IF EXISTS idx_messages_conv_unread;
-- DROP INDEX IF EXISTS idx_notifications_dedup;
