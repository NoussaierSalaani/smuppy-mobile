-- Fix Remaining Supabase Security Warnings
-- Date: 2026-01-23

-- =====================================================
-- 1. FIX FUNCTION SEARCH PATH
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_post_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.posts
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_post_likes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.posts
  SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
  WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$;

-- =====================================================
-- 2. FIX device_sessions policies
-- =====================================================

DROP POLICY IF EXISTS "Users can manage own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can view own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can select own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can insert own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can update own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can delete own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Allow all" ON public.device_sessions;
DROP POLICY IF EXISTS "device_sessions_select" ON public.device_sessions;
DROP POLICY IF EXISTS "device_sessions_insert" ON public.device_sessions;
DROP POLICY IF EXISTS "device_sessions_update" ON public.device_sessions;
DROP POLICY IF EXISTS "device_sessions_delete" ON public.device_sessions;

CREATE POLICY "device_sessions_select" ON public.device_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "device_sessions_insert" ON public.device_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "device_sessions_update" ON public.device_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "device_sessions_delete" ON public.device_sessions FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 3. FIX waitlist policies (public table - no user_id)
-- =====================================================

DROP POLICY IF EXISTS "Allow all" ON public.waitlist;
DROP POLICY IF EXISTS "Enable all" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_insert" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_select" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_update" ON public.waitlist;
DROP POLICY IF EXISTS "waitlist_delete" ON public.waitlist;

-- Waitlist: public insert, admin-only select
CREATE POLICY "waitlist_insert" ON public.waitlist FOR INSERT WITH CHECK (true);

-- =====================================================
-- 4. FIX notification_logs policies
-- =====================================================

DROP POLICY IF EXISTS "Users can view own notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "Users can insert own notification logs" ON public.notification_logs;
DROP POLICY IF EXISTS "notification_logs_select" ON public.notification_logs;
DROP POLICY IF EXISTS "notification_logs_insert" ON public.notification_logs;
DROP POLICY IF EXISTS "notification_logs_update" ON public.notification_logs;
DROP POLICY IF EXISTS "notification_logs_delete" ON public.notification_logs;

CREATE POLICY "notification_logs_select" ON public.notification_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notification_logs_insert" ON public.notification_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 5. FIX push_tokens policies
-- =====================================================

DROP POLICY IF EXISTS "Users can view own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_select" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_insert" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_update" ON public.push_tokens;
DROP POLICY IF EXISTS "push_tokens_delete" ON public.push_tokens;

CREATE POLICY "push_tokens_select" ON public.push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "push_tokens_insert" ON public.push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_tokens_update" ON public.push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "push_tokens_delete" ON public.push_tokens FOR DELETE USING (auth.uid() = user_id);
