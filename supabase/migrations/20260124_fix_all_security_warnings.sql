-- =====================================================
-- FIX ALL SUPABASE SECURITY ADVISOR WARNINGS
-- Date: 2026-01-24
-- =====================================================

-- =====================================================
-- 1. FIX SECURITY DEFINER VIEW
-- =====================================================

-- Drop and recreate without SECURITY DEFINER
DROP VIEW IF EXISTS public.conversation_participants_view CASCADE;

CREATE VIEW public.conversation_participants_view AS
SELECT
  cp.id,
  cp.conversation_id,
  cp.user_id,
  cp.joined_at,
  cp.last_read_at,
  cp.is_muted,
  p.username,
  p.full_name,
  p.avatar_url,
  p.is_verified,
  p.account_type
FROM public.conversation_participants cp
LEFT JOIN public.profiles p ON p.id = cp.user_id;

GRANT SELECT ON public.conversation_participants_view TO authenticated;

-- =====================================================
-- 2. FIX FUNCTION SEARCH PATH MUTABLE
-- All SECURITY DEFINER functions need SET search_path = ''
-- =====================================================

-- Fix update_reports_updated_at
CREATE OR REPLACE FUNCTION public.update_reports_updated_at()
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

-- Fix get_hidden_user_ids
CREATE OR REPLACE FUNCTION public.get_hidden_user_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result UUID[];
BEGIN
  SELECT ARRAY_AGG(blocked_user_id) INTO result
  FROM public.blocked_users
  WHERE user_id = p_user_id;

  RETURN COALESCE(result, ARRAY[]::UUID[]);
END;
$$;

-- Fix is_following
CREATE OR REPLACE FUNCTION public.is_following(follower UUID, following UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = follower AND following_id = following
  );
END;
$$;

-- Fix is_user_muted
CREATE OR REPLACE FUNCTION public.is_user_muted(muter_id UUID, target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.muted_users
    WHERE user_id = muter_id AND muted_user_id = target_id
  );
END;
$$;

-- Fix get_blocked_user_ids
CREATE OR REPLACE FUNCTION public.get_blocked_user_ids(p_user_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result UUID[];
BEGIN
  SELECT ARRAY_AGG(blocked_user_id) INTO result
  FROM public.blocked_users
  WHERE user_id = p_user_id;

  RETURN COALESCE(result, ARRAY[]::UUID[]);
END;
$$;

-- Fix is_user_hidden
CREATE OR REPLACE FUNCTION public.is_user_hidden(checker_id UUID, target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE user_id = checker_id AND blocked_user_id = target_id
  );
END;
$$;

-- Fix can_view_user_content
CREATE OR REPLACE FUNCTION public.can_view_user_content(viewer_id UUID, content_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Can't view if blocked
  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (user_id = viewer_id AND blocked_user_id = content_owner_id)
       OR (user_id = content_owner_id AND blocked_user_id = viewer_id)
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Fix send_push_notification
CREATE OR REPLACE FUNCTION public.send_push_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- This function is a placeholder for push notification logic
  -- The actual notification is sent via Edge Function
  INSERT INTO public.notifications_logs (user_id, title, body, data, created_at)
  VALUES (p_user_id, p_title, p_body, p_data, NOW())
  ON CONFLICT DO NOTHING;
END;
$$;

-- Fix is_user_blocked
CREATE OR REPLACE FUNCTION public.is_user_blocked(blocker_id UUID, target_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE user_id = blocker_id AND blocked_user_id = target_id
  );
END;
$$;

-- Fix handle_new_user (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_new_user') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.handle_new_user()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        INSERT INTO public.profiles (id, email, created_at, updated_at)
        VALUES (NEW.id, NEW.email, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix update_updated_at_column (generic trigger function)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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

-- =====================================================
-- 3. FIX RLS POLICIES WITH TRUE
-- Replace overly permissive policies with proper checks
-- =====================================================

-- conversation_participants: Fix INSERT policy
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;
CREATE POLICY "Users can add participants to own conversations"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    -- User can only add participants to conversations they're part of
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
    )
    OR
    -- Or it's a new conversation being created (user adding themselves)
    user_id = auth.uid()
  );

-- device_sessions: Fix policies
DROP POLICY IF EXISTS "Users can view own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can insert own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can update own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users can delete own device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Allow all for device_sessions" ON public.device_sessions;

CREATE POLICY "Users can view own device sessions"
  ON public.device_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own device sessions"
  ON public.device_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own device sessions"
  ON public.device_sessions FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own device sessions"
  ON public.device_sessions FOR DELETE
  USING (user_id = auth.uid());

-- notifications_logs: Fix policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications_logs;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications_logs;
DROP POLICY IF EXISTS "Allow all for notifications_logs" ON public.notifications_logs;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications_logs') THEN
    ALTER TABLE public.notifications_logs ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view own notifications"
      ON public.notifications_logs FOR SELECT
      USING (user_id = auth.uid());

    CREATE POLICY "System can insert notifications"
      ON public.notifications_logs FOR INSERT
      WITH CHECK (true); -- Notifications are inserted by system/triggers
  END IF;
END;
$$;

-- push_tokens: Fix policies
DROP POLICY IF EXISTS "Users can view own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can insert own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete own push tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Allow all for push_tokens" ON public.push_tokens;

CREATE POLICY "Users can view own push tokens"
  ON public.push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own push tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own push tokens"
  ON public.push_tokens FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own push tokens"
  ON public.push_tokens FOR DELETE
  USING (user_id = auth.uid());

-- profiles: Ensure proper policies (SELECT should be allowed for all authenticated)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================
-- 4. GRANT EXECUTE PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION public.is_following(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_muted(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_blocked(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_hidden(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_content(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hidden_user_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_blocked_user_ids(UUID) TO authenticated;

-- =====================================================
-- NOTE: For "Leaked Password Protection" and "MFA Options"
-- These must be configured in Supabase Dashboard:
-- 1. Go to Authentication > Settings
-- 2. Enable "Leaked Password Protection"
-- 3. Configure MFA settings as needed
-- =====================================================

-- =====================================================
-- DONE - Run this migration in Supabase SQL Editor
-- =====================================================
