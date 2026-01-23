-- =====================================================
-- MESSAGE ENHANCEMENTS: Voice Messages & Post Sharing
-- Date: 2026-01-23
-- =====================================================

-- Add shared_post_id column to messages table for post sharing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'messages'
    AND column_name = 'shared_post_id'
  ) THEN
    ALTER TABLE public.messages
    ADD COLUMN shared_post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- Index for fetching shared posts
CREATE INDEX IF NOT EXISTS idx_messages_shared_post
  ON public.messages(shared_post_id)
  WHERE shared_post_id IS NOT NULL;

-- =====================================================
-- STORAGE BUCKET FOR VOICE MESSAGES
-- =====================================================
-- Note: Run this in Supabase Dashboard > Storage > Create bucket
-- Bucket name: voice-messages
-- Public: false
-- Allowed MIME types: audio/m4a, audio/mp4, audio/mpeg, audio/wav

-- =====================================================
-- DONE
-- =====================================================
