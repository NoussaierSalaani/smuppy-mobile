-- =====================================================
-- Fix Security Definer View Warning
-- Date: 2026-01-24
-- Issue: View conversation_participants_view has SECURITY DEFINER
-- Solution: Recreate view without SECURITY DEFINER
-- =====================================================

-- Drop the problematic view if it exists
DROP VIEW IF EXISTS public.conversation_participants_view CASCADE;

-- Recreate the view without SECURITY DEFINER
-- This view provides a simple way to get conversation participants with user info
CREATE OR REPLACE VIEW public.conversation_participants_view AS
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

-- Grant access to authenticated users
GRANT SELECT ON public.conversation_participants_view TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW public.conversation_participants_view IS 'View to get conversation participants with profile info. RLS is applied through the underlying tables.';

-- =====================================================
-- IMPORTANT: Run this migration in Supabase SQL Editor
-- This fixes the "Security Definer View" warning
-- =====================================================
