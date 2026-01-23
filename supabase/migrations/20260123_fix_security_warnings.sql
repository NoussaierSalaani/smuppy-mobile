-- Fix Remaining Supabase Security Advisor Warnings
-- Date: 2026-01-23
-- This complements 20260123_fix_rls_security.sql

-- =====================================================
-- 1. FIX FUNCTION SEARCH PATH (set search_path = '')
-- These functions are flagged as "Function Search Path Mutable"
-- =====================================================

-- Fix cleanup_old_oaxa_chains if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_old_oaxa_chains') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.cleanup_old_oaxa_chains()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        DELETE FROM public.oaxa_chains
        WHERE created_at < NOW() - INTERVAL ''24 hours'';
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix update_post_count
CREATE OR REPLACE FUNCTION public.update_post_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET post_count = COALESCE(post_count, 0) + 1
    WHERE id = NEW.author_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET post_count = GREATEST(COALESCE(post_count, 0) - 1, 0)
    WHERE id = OLD.author_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Fix update_fan_count
CREATE OR REPLACE FUNCTION public.update_fan_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET fan_count = COALESCE(fan_count, 0) + 1
    WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET fan_count = GREATEST(COALESCE(fan_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Fix trigger_on_new_like
CREATE OR REPLACE FUNCTION public.trigger_on_new_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Fix trigger_on_new_follow if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_on_new_follow') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.trigger_on_new_follow()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        RETURN NULL;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix trigger_on_new_message if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_on_new_message') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.trigger_on_new_message()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        UPDATE public.conversations
        SET last_message_at = NEW.created_at
        WHERE id = NEW.conversation_id;
        RETURN NULL;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix trigger_on_new_comment if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_on_new_comment') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.trigger_on_new_comment()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        IF TG_OP = ''INSERT'' THEN
          UPDATE public.posts
          SET comments_count = COALESCE(comments_count, 0) + 1
          WHERE id = NEW.post_id;
        ELSIF TG_OP = ''DELETE'' THEN
          UPDATE public.posts
          SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0)
          WHERE id = OLD.post_id;
        END IF;
        RETURN NULL;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix increment_count if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_count') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.increment_count(table_name text, column_name text, row_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        EXECUTE format(''UPDATE public.%I SET %I = COALESCE(%I, 0) + 1 WHERE id = $1'', table_name, column_name, column_name)
        USING row_id;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- Fix decrement_count if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decrement_count') THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.decrement_count(table_name text, column_name text, row_id uuid)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''''
      AS $func$
      BEGIN
        EXECUTE format(''UPDATE public.%I SET %I = GREATEST(COALESCE(%I, 0) - 1, 0) WHERE id = $1'', table_name, column_name, column_name)
        USING row_id;
      END;
      $func$;
    ';
  END IF;
END;
$$;

-- =====================================================
-- 2. CREATE RLS POLICIES FOR REMAINING TABLES
-- Tables flagged as "RLS Enabled No Policy"
-- =====================================================

-- business_details policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'business_details') THEN
    ALTER TABLE public.business_details ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view all business details" ON public.business_details;
    CREATE POLICY "Users can view all business details"
      ON public.business_details FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Users can manage own business details" ON public.business_details;
    CREATE POLICY "Users can manage own business details"
      ON public.business_details FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- expertise policies (read-only lookup table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expertise') THEN
    ALTER TABLE public.expertise ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view expertise" ON public.expertise;
    CREATE POLICY "Anyone can view expertise"
      ON public.expertise FOR SELECT
      USING (true);
  END IF;
END;
$$;

-- interests policies (read-only lookup table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'interests') THEN
    ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view interests" ON public.interests;
    CREATE POLICY "Anyone can view interests"
      ON public.interests FOR SELECT
      USING (true);
  END IF;
END;
$$;

-- post_tags policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'post_tags') THEN
    ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Anyone can view post tags" ON public.post_tags;
    CREATE POLICY "Anyone can view post tags"
      ON public.post_tags FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Post authors can manage tags" ON public.post_tags;
    CREATE POLICY "Post authors can manage tags"
      ON public.post_tags FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.posts
          WHERE posts.id = post_tags.post_id
          AND posts.author_id = auth.uid()
        )
      );
  END IF;
END;
$$;

-- user_expertise policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_expertise') THEN
    ALTER TABLE public.user_expertise ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view all user expertise" ON public.user_expertise;
    CREATE POLICY "Users can view all user expertise"
      ON public.user_expertise FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Users can manage own expertise" ON public.user_expertise;
    CREATE POLICY "Users can manage own expertise"
      ON public.user_expertise FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- user_interests policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_interests') THEN
    ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view all user interests" ON public.user_interests;
    CREATE POLICY "Users can view all user interests"
      ON public.user_interests FOR SELECT
      USING (true);

    DROP POLICY IF EXISTS "Users can manage own interests" ON public.user_interests;
    CREATE POLICY "Users can manage own interests"
      ON public.user_interests FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- =====================================================
-- DONE - Run this migration on Supabase Dashboard
-- =====================================================
