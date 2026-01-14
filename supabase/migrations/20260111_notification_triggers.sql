-- SMUPPY Push Notification Triggers (idempotent)
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  success BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_recipient ON notification_logs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at DESC);

CREATE OR REPLACE FUNCTION call_send_notification(p_type TEXT, p_recipient_id UUID, p_data JSONB) RETURNS void AS $fn$
DECLARE v_url TEXT; v_service_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notification';
  v_service_key := current_setting('app.settings.service_role_key', true);
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key), body := jsonb_build_object('type', p_type, 'recipient_id', p_recipient_id::TEXT, 'data', p_data));
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Failed to send notification: %', SQLERRM;
END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_on_like() RETURNS TRIGGER AS $fn$
DECLARE v_post_owner_id UUID; v_sender_name TEXT; v_sender_avatar TEXT; v_post_title TEXT;
BEGIN
  SELECT user_id, title INTO v_post_owner_id, v_post_title FROM posts WHERE id = NEW.post_id;
  IF v_post_owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url INTO v_sender_name, v_sender_avatar FROM profiles WHERE id = NEW.user_id;
  PERFORM call_send_notification('new_like', v_post_owner_id, jsonb_build_object('sender_id', NEW.user_id, 'sender_name', v_sender_name, 'sender_avatar', v_sender_avatar, 'post_id', NEW.post_id, 'post_title', v_post_title));
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;

DO $x$ BEGIN IF to_regclass('public.likes') IS NOT NULL THEN DROP TRIGGER IF EXISTS trigger_notify_on_like ON public.likes; CREATE TRIGGER trigger_notify_on_like AFTER INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION notify_on_like(); END IF; END $x$;

CREATE OR REPLACE FUNCTION notify_on_follow() RETURNS TRIGGER AS $fn$
DECLARE v_sender_name TEXT; v_sender_avatar TEXT;
BEGIN
  IF NEW.following_id = NEW.follower_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url INTO v_sender_name, v_sender_avatar FROM profiles WHERE id = NEW.follower_id;
  PERFORM call_send_notification('new_follow', NEW.following_id, jsonb_build_object('sender_id', NEW.follower_id, 'sender_name', v_sender_name, 'sender_avatar', v_sender_avatar));
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;

DO $x$ BEGIN IF to_regclass('public.follows') IS NOT NULL THEN DROP TRIGGER IF EXISTS trigger_notify_on_follow ON public.follows; CREATE TRIGGER trigger_notify_on_follow AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION notify_on_follow(); END IF; END $x$;

CREATE OR REPLACE FUNCTION notify_on_message() RETURNS TRIGGER AS $fn$
DECLARE v_sender_name TEXT; v_sender_avatar TEXT; v_message_preview TEXT;
BEGIN
  IF NEW.recipient_id = NEW.sender_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url INTO v_sender_name, v_sender_avatar FROM profiles WHERE id = NEW.sender_id;
  v_message_preview := LEFT(NEW.content, 100);
  PERFORM call_send_notification('new_message', NEW.recipient_id, jsonb_build_object('sender_id', NEW.sender_id, 'sender_name', v_sender_name, 'sender_avatar', v_sender_avatar, 'message_preview', v_message_preview, 'conversation_id', NEW.conversation_id));
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;

DO $x$ BEGIN IF to_regclass('public.messages') IS NOT NULL THEN DROP TRIGGER IF EXISTS trigger_notify_on_message ON public.messages; CREATE TRIGGER trigger_notify_on_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION notify_on_message(); END IF; END $x$;

CREATE OR REPLACE FUNCTION notify_on_comment() RETURNS TRIGGER AS $fn$
DECLARE v_post_owner_id UUID; v_sender_name TEXT; v_sender_avatar TEXT; v_post_title TEXT; v_comment_preview TEXT;
BEGIN
  SELECT user_id, title INTO v_post_owner_id, v_post_title FROM posts WHERE id = NEW.post_id;
  IF v_post_owner_id = NEW.user_id THEN RETURN NEW; END IF;
  SELECT COALESCE(full_name, username, 'Someone'), avatar_url INTO v_sender_name, v_sender_avatar FROM profiles WHERE id = NEW.user_id;
  v_comment_preview := LEFT(NEW.content, 100);
  PERFORM call_send_notification('new_comment', v_post_owner_id, jsonb_build_object('sender_id', NEW.user_id, 'sender_name', v_sender_name, 'sender_avatar', v_sender_avatar, 'post_id', NEW.post_id, 'post_title', v_post_title, 'comment_text', v_comment_preview));
  RETURN NEW;
END; $fn$ LANGUAGE plpgsql SECURITY DEFINER;

DO $x$ BEGIN IF to_regclass('public.comments') IS NOT NULL THEN DROP TRIGGER IF EXISTS trigger_notify_on_comment ON public.comments; CREATE TRIGGER trigger_notify_on_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION notify_on_comment(); END IF; END $x$;

GRANT SELECT ON notification_logs TO authenticated;
GRANT INSERT ON notification_logs TO service_role;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own notification logs" ON notification_logs;
CREATE POLICY "Users can view own notification logs" ON notification_logs FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
DROP POLICY IF EXISTS "Service role can insert notification logs" ON notification_logs;
CREATE POLICY "Service role can insert notification logs" ON notification_logs FOR INSERT TO service_role WITH CHECK (true);
