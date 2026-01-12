-- =============================================
-- SMUPPY Push Notifications Setup
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. Enable pg_net extension for HTTP calls
-- =============================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- =============================================
-- 2. Create push_tokens table (if not exists)
-- =============================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);

-- RLS for push_tokens
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own tokens" ON push_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 3. Create notification_logs table
-- =============================================
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);

-- RLS for notification_logs
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" ON notification_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

-- =============================================
-- 4. Function to send notification via Edge Function
-- =============================================
CREATE OR REPLACE FUNCTION send_push_notification(
  p_type TEXT,
  p_recipient_id UUID,
  p_data JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_request_id BIGINT;
BEGIN
  -- Build the Edge Function URL
  -- Replace with your actual Supabase project URL
  v_url := 'https://wbgfaeytioxnkdsuvvlx.supabase.co/functions/v1/send-notification';

  -- Make async HTTP request using pg_net
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', p_type,
      'recipient_id', p_recipient_id::TEXT,
      'data', p_data
    )::jsonb
  ) INTO v_request_id;

  -- Log the request (optional)
  RAISE NOTICE 'Notification request sent: % (request_id: %)', p_type, v_request_id;

EXCEPTION WHEN OTHERS THEN
  -- Don't fail the transaction, just log the error
  RAISE WARNING 'Failed to send notification: %', SQLERRM;
END;
$$;

-- =============================================
-- 5. Trigger for NEW LIKE
-- =============================================
CREATE OR REPLACE FUNCTION trigger_on_new_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_owner_id UUID;
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_post_title TEXT;
BEGIN
  -- Get post info
  SELECT user_id, COALESCE(title, 'your post')
  INTO v_post_owner_id, v_post_title
  FROM posts WHERE id = NEW.post_id;

  -- Skip self-like
  IF v_post_owner_id IS NULL OR v_post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles WHERE id = NEW.user_id;

  -- Send notification
  PERFORM send_push_notification(
    'new_like',
    v_post_owner_id,
    jsonb_build_object(
      'sender_id', NEW.user_id,
      'sender_name', COALESCE(v_sender_name, 'Someone'),
      'sender_avatar', v_sender_avatar,
      'post_id', NEW.post_id,
      'post_title', v_post_title
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_like ON likes;
CREATE TRIGGER on_new_like
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_on_new_like();

-- =============================================
-- 6. Trigger for NEW FOLLOW
-- =============================================
CREATE OR REPLACE FUNCTION trigger_on_new_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
BEGIN
  -- Skip self-follow
  IF NEW.following_id = NEW.follower_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles WHERE id = NEW.follower_id;

  -- Send notification
  PERFORM send_push_notification(
    'new_follow',
    NEW.following_id,
    jsonb_build_object(
      'sender_id', NEW.follower_id,
      'sender_name', COALESCE(v_sender_name, 'Someone'),
      'sender_avatar', v_sender_avatar
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_follow ON follows;
CREATE TRIGGER on_new_follow
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION trigger_on_new_follow();

-- =============================================
-- 7. Trigger for NEW MESSAGE
-- =============================================
CREATE OR REPLACE FUNCTION trigger_on_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
BEGIN
  -- Skip self-message
  IF NEW.recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles WHERE id = NEW.sender_id;

  -- Send notification
  PERFORM send_push_notification(
    'new_message',
    NEW.recipient_id,
    jsonb_build_object(
      'sender_id', NEW.sender_id,
      'sender_name', COALESCE(v_sender_name, 'Someone'),
      'sender_avatar', v_sender_avatar,
      'message_preview', LEFT(NEW.content, 100),
      'conversation_id', NEW.conversation_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_message ON messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_on_new_message();

-- =============================================
-- 8. Trigger for NEW COMMENT
-- =============================================
CREATE OR REPLACE FUNCTION trigger_on_new_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_owner_id UUID;
  v_sender_name TEXT;
  v_sender_avatar TEXT;
  v_post_title TEXT;
BEGIN
  -- Get post info
  SELECT user_id, COALESCE(title, 'your post')
  INTO v_post_owner_id, v_post_title
  FROM posts WHERE id = NEW.post_id;

  -- Skip self-comment
  IF v_post_owner_id IS NULL OR v_post_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get sender info
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url
  INTO v_sender_name, v_sender_avatar
  FROM profiles WHERE id = NEW.user_id;

  -- Send notification
  PERFORM send_push_notification(
    'new_comment',
    v_post_owner_id,
    jsonb_build_object(
      'sender_id', NEW.user_id,
      'sender_name', COALESCE(v_sender_name, 'Someone'),
      'sender_avatar', v_sender_avatar,
      'post_id', NEW.post_id,
      'post_title', v_post_title,
      'comment_text', LEFT(NEW.content, 100)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_comment ON comments;
CREATE TRIGGER on_new_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_on_new_comment();

-- =============================================
-- DONE!
-- =============================================
-- After running this migration:
-- 1. Deploy the Edge Function: supabase functions deploy send-notification
-- 2. Test by inserting a row in likes/follows/messages/comments
-- =============================================
