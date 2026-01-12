-- ============================================================================
-- DEVICE SESSIONS TABLE
-- Track user devices for security alerts
-- ============================================================================

-- Create device_sessions table
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Device identification
  device_id TEXT NOT NULL,
  device_name TEXT,
  device_type TEXT, -- 'mobile', 'web', 'tablet'
  platform TEXT, -- 'ios', 'android', 'web'
  browser TEXT, -- For web: 'chrome', 'safari', etc.
  os_version TEXT,
  app_version TEXT,

  -- Location (approximate)
  ip_address INET,
  country TEXT,
  city TEXT,

  -- Session info
  session_id TEXT,
  push_token TEXT, -- For notifications
  is_active BOOLEAN DEFAULT true,
  is_trusted BOOLEAN DEFAULT false, -- User can mark devices as trusted

  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_id ON public.device_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_device_id ON public.device_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_last_seen ON public.device_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_device_sessions_active ON public.device_sessions(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own device sessions
CREATE POLICY "Users can view own device sessions"
  ON public.device_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own device sessions (e.g., mark as trusted)
CREATE POLICY "Users can update own device sessions"
  ON public.device_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own device sessions (revoke access)
CREATE POLICY "Users can delete own device sessions"
  ON public.device_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert new device sessions (via Edge Functions)
CREATE POLICY "Service role can insert device sessions"
  ON public.device_sessions FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- DEVICE ALERT LOGS
-- Track when alerts were sent
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_session_id UUID REFERENCES public.device_sessions(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL, -- 'new_device', 'suspicious_location', etc.
  email_sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'delivered'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_device_alert_logs_user_id ON public.device_alert_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_device_alert_logs_created ON public.device_alert_logs(created_at);

-- Enable RLS
ALTER TABLE public.device_alert_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own alert logs
CREATE POLICY "Users can view own alert logs"
  ON public.device_alert_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTION: Register or update device session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_device_session(
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT 'mobile',
  p_platform TEXT DEFAULT NULL,
  p_browser TEXT DEFAULT NULL,
  p_os_version TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_push_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing_session RECORD;
  v_is_new_device BOOLEAN := false;
  v_session_id UUID;
  v_ip INET;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Convert IP address
  IF p_ip_address IS NOT NULL THEN
    BEGIN
      v_ip := p_ip_address::INET;
    EXCEPTION WHEN OTHERS THEN
      v_ip := NULL;
    END;
  END IF;

  -- Check if device exists
  SELECT * INTO v_existing_session
  FROM public.device_sessions
  WHERE user_id = v_user_id AND device_id = p_device_id;

  IF v_existing_session IS NULL THEN
    -- New device - insert
    v_is_new_device := true;

    INSERT INTO public.device_sessions (
      user_id, device_id, device_name, device_type, platform,
      browser, os_version, app_version, ip_address, country, city, push_token
    ) VALUES (
      v_user_id, p_device_id, p_device_name, p_device_type, p_platform,
      p_browser, p_os_version, p_app_version, v_ip, p_country, p_city, p_push_token
    )
    RETURNING id INTO v_session_id;
  ELSE
    -- Existing device - update
    v_session_id := v_existing_session.id;

    UPDATE public.device_sessions
    SET
      device_name = COALESCE(p_device_name, device_name),
      device_type = COALESCE(p_device_type, device_type),
      platform = COALESCE(p_platform, platform),
      browser = COALESCE(p_browser, browser),
      os_version = COALESCE(p_os_version, os_version),
      app_version = COALESCE(p_app_version, app_version),
      ip_address = COALESCE(v_ip, ip_address),
      country = COALESCE(p_country, country),
      city = COALESCE(p_city, city),
      push_token = COALESCE(p_push_token, push_token),
      last_seen_at = NOW(),
      last_login_at = NOW(),
      is_active = true
    WHERE id = v_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'is_new_device', v_is_new_device,
    'device_id', p_device_id
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.register_device_session TO authenticated;

-- ============================================================================
-- FUNCTION: Get user's active devices
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_devices()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_devices JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'device_id', device_id,
      'device_name', device_name,
      'device_type', device_type,
      'platform', platform,
      'browser', browser,
      'country', country,
      'city', city,
      'is_trusted', is_trusted,
      'is_active', is_active,
      'first_seen_at', first_seen_at,
      'last_seen_at', last_seen_at,
      'last_login_at', last_login_at
    )
    ORDER BY last_seen_at DESC
  ) INTO v_devices
  FROM public.device_sessions
  WHERE user_id = v_user_id AND is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'devices', COALESCE(v_devices, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_devices TO authenticated;

-- ============================================================================
-- FUNCTION: Revoke device session
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_device_session(p_device_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.device_sessions
  SET is_active = false
  WHERE id = p_device_session_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_device_session TO authenticated;

-- ============================================================================
-- Add email_verified check helper function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_email_verified()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_email_verified TO authenticated;
