-- =====================================================
-- MESSAGING SYSTEM
-- Date: 2026-01-23
-- Tables: conversations, conversation_participants, messages
-- =====================================================

-- =====================================================
-- 1. CONVERSATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,
  is_group BOOLEAN DEFAULT FALSE,
  group_name TEXT,
  group_avatar_url TEXT
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. CONVERSATION PARTICIPANTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT FALSE,
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. MESSAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT, -- 'image', 'video', 'audio'
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. RLS POLICIES
-- =====================================================

-- Conversations: users can only see conversations they participate in
CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id
      AND cp.user_id = auth.uid()
    )
  );

-- Conversation participants
CREATE POLICY "Users can view participants of own conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own participation"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave conversations"
  ON public.conversation_participants FOR DELETE
  USING (user_id = auth.uid());

-- Messages
CREATE POLICY "Users can view messages in own conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to own conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());

-- =====================================================
-- 5. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON public.conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation
  ON public.conversation_participants(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages(sender_id);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON public.conversations(last_message_at DESC);

-- =====================================================
-- 6. TRIGGER: Update conversation on new message
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_insert ON public.messages;
CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_on_message();

-- =====================================================
-- 7. FUNCTION: Get or create direct conversation
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Check if a direct conversation already exists between these users
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM public.conversation_participants cp1
  INNER JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  INNER JOIN public.conversations c
    ON c.id = cp1.conversation_id
  WHERE cp1.user_id = p_user_id
    AND cp2.user_id = p_other_user_id
    AND c.is_group = FALSE
  LIMIT 1;

  -- If found, return existing conversation
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- Create new conversation
  INSERT INTO public.conversations (is_group)
  VALUES (FALSE)
  RETURNING id INTO v_conversation_id;

  -- Add both participants
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES
    (v_conversation_id, p_user_id),
    (v_conversation_id, p_other_user_id);

  RETURN v_conversation_id;
END;
$$;

-- =====================================================
-- 8. FUNCTION: Get unread count for user
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_unread_messages_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.messages m
  INNER JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = p_user_id
    AND m.sender_id != p_user_id
    AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at);

  RETURN COALESCE(v_count, 0);
END;
$$;

-- =====================================================
-- 9. Enable Realtime for messages
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- =====================================================
-- DONE
-- =====================================================
