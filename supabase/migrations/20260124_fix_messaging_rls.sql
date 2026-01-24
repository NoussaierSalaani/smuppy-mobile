-- =====================================================
-- Fix infinite recursion in conversation_participants RLS policy
-- =====================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view participants of own conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view messages in own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to own conversations" ON public.messages;

-- =====================================================
-- Create a SECURITY DEFINER function to check participation
-- This avoids the infinite recursion by bypassing RLS
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
  );
$$;

-- =====================================================
-- Recreate policies using the helper function
-- =====================================================

-- conversation_participants: Simple policy - user can see rows where they are a participant
CREATE POLICY "Users can view participants of own conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
  );

-- messages: Use the helper function to check participation
CREATE POLICY "Users can view messages in own conversations"
  ON public.messages FOR SELECT
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Users can send messages to own conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;
