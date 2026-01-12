-- ============================================
-- Push Tokens Table
-- Stores Expo push notification tokens for users
-- ============================================

-- Create push_tokens table
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android')),
    device_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: one token per device per user
    UNIQUE(user_id, device_id)
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);

-- Index for active tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON public.push_tokens(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see/manage their own tokens
CREATE POLICY "Users can view own push tokens"
    ON public.push_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push tokens"
    ON public.push_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push tokens"
    ON public.push_tokens
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own push tokens"
    ON public.push_tokens
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_push_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
CREATE TRIGGER trigger_update_push_token_timestamp
    BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_push_token_timestamp();

-- ============================================
-- Notifications Table (optional - for notification history)
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'message', 'mention', 'post')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- Helper function to send push notification
-- Call this from Edge Functions or database triggers
-- ============================================

-- Note: Actual push sending should be done via Supabase Edge Function
-- This function just creates the notification record
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type VARCHAR(50),
    p_title TEXT,
    p_body TEXT,
    p_data JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (p_user_id, p_type, p_title, p_body, p_data)
    RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
