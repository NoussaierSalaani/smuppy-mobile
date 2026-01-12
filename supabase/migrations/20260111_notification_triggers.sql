-- =============================================
-- SMUPPY Push Notification Triggers
-- =============================================
-- This migration creates:
-- 1. notification_logs table for tracking
-- 2. Triggers for automatic notifications on:
--    - likes (new_like)
--    - follows (new_follow)
--    - messages (new_message)
--    - comments (new_comment)
-- =============================================

-- =============================================
-- 1. Create notification_logs table
-- =============================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at DESC);

-- =============================================
-- 2. Helper function to call Edge Function
-- =============================================
CREATE OR REPLACE FUNCTION call_send_notification(
  p_type TEXT,
  p_recipient_id UUID,
  p_data JSONB
) RETURNS void AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Get the Edge Function URL
  v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification';
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Make HTTP request to Edge Function
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'type', p_type,
      'recipient_id', p_recipient_id::TEXT,
      'data', p_data
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to send notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. Trigger function for LIKES
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner_id UUID;
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_post_title TEXT;
BEGIN
  -- Get post owner ID
  SELECT user_id, title INTO v_post_owner_id, v_post_title
  FROM posts
  WHERE id = NEW.post_id;

  -- Don't notify if liking own post
  IF v_post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT
    COALESCE(full_name, username, 'Someone') as name,
    avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles
  WHERE id = NEW.user_id;

  -- Call notification function
  PERFORM call_send_notification(
    'new_like',
    v_post_owner_id,
    jsonb_build_object(
      'sender_id', NEW.user_id,
      'sender_name', v_sender_name,
      'sender_avatar', v_sender_avatar,
      'post_id', NEW.post_id,
      'post_title', v_post_title
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for likes
DROP TRIGGER IF EXISTS trigger_notify_on_like ON likes;
CREATE TRIGGER trigger_notify_on_like
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_like();

-- =============================================
-- 4. Trigger function for FOLLOWS
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
BEGIN
  -- Don't notify if following self (shouldn't happen but safety check)
  IF NEW.following_id = NEW.follower_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT
    COALESCE(full_name, username, 'Someone') as name,
    avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles
  WHERE id = NEW.follower_id;

  -- Call notification function
  PERFORM call_send_notification(
    'new_follow',
    NEW.following_id,
    jsonb_build_object(
      'sender_id', NEW.follower_id,
      'sender_name', v_sender_name,
      'sender_avatar', v_sender_avatar
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for follows
DROP TRIGGER IF EXISTS trigger_notify_on_follow ON follows;
CREATE TRIGGER trigger_notify_on_follow
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_follow();

-- =============================================
-- 5. Trigger function for MESSAGES
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_message_preview TEXT;
BEGIN
  -- Don't notify if messaging self
  IF NEW.recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT
    COALESCE(full_name, username, 'Someone') as name,
    avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles
  WHERE id = NEW.sender_id;

  -- Get message preview (first 100 chars)
  v_message_preview := LEFT(NEW.content, 100);

  -- Call notification function
  PERFORM call_send_notification(
    'new_message',
    NEW.recipient_id,
    jsonb_build_object(
      'sender_id', NEW.sender_id,
      'sender_name', v_sender_name,
      'sender_avatar', v_sender_avatar,
      'message_preview', v_message_preview,
      'conversation_id', NEW.conversation_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for messages
DROP TRIGGER IF EXISTS trigger_notify_on_message ON messages;
CREATE TRIGGER trigger_notify_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_message();

-- =============================================
-- 6. Trigger function for COMMENTS
-- =============================================
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner_id UUID;
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_post_title TEXT;
  v_comment_preview TEXT;
BEGIN
  -- Get post owner ID and title
  SELECT user_id, title INTO v_post_owner_id, v_post_title
  FROM posts
  WHERE id = NEW.post_id;

  -- Don't notify if commenting on own post
  IF v_post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT
    COALESCE(full_name, username, 'Someone') as name,
    avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles
  WHERE id = NEW.user_id;

  -- Get comment preview (first 100 chars)
  v_comment_preview := LEFT(NEW.content, 100);

  -- Call notification function
  PERFORM call_send_notification(
    'new_comment',
    v_post_owner_id,
    jsonb_build_object(
      'sender_id', NEW.user_id,
      'sender_name', v_sender_name,
      'sender_avatar', v_sender_avatar,
      'post_id', NEW.post_id,
      'post_title', v_post_title,
      'comment_text', v_comment_preview
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for comments
DROP TRIGGER IF EXISTS trigger_notify_on_comment ON comments;
CREATE TRIGGER trigger_notify_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_comment();

-- =============================================
-- 7. Grant permissions
-- =============================================
GRANT SELECT ON notification_logs TO authenticated;
GRANT INSERT ON notification_logs TO service_role;

-- =============================================
-- 8. RLS Policies
-- =============================================
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification logs
CREATE POLICY "Users can view own notification logs"
  ON notification_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

-- Only service role can insert
CREATE POLICY "Service role can insert notification logs"
  ON notification_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =============================================
-- NOTE: If your tables have different column names,
-- adjust the triggers accordingly:
--
-- likes: post_id, user_id
-- follows: follower_id, following_id
-- messages: sender_id, recipient_id, content, conversation_id
-- comments: post_id, user_id, content
-- profiles: id, full_name, username, avatar_url
-- posts: id, user_id, title
-- =============================================
