-- =====================================================
-- FOLLOW REQUESTS SYSTEM FOR PRIVATE ACCOUNTS
-- Date: 2026-01-23
-- =====================================================
-- When a user tries to follow a private account:
-- 1. A follow_request is created instead of a direct follow
-- 2. The private account owner gets a notification
-- 3. They can accept or decline the request
-- 4. If accepted, the follow is created and request is marked accepted
-- =====================================================

-- =====================================================
-- FOLLOW REQUESTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS follow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, target_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_follow_requests_requester ON follow_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(target_id);
CREATE INDEX IF NOT EXISTS idx_follow_requests_target_pending ON follow_requests(target_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status);

-- Enable RLS
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own requests (sent or received)
DROP POLICY IF EXISTS "Users can view own follow requests" ON follow_requests;
CREATE POLICY "Users can view own follow requests"
  ON follow_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = target_id);

-- Users can create follow requests
DROP POLICY IF EXISTS "Users can create follow requests" ON follow_requests;
CREATE POLICY "Users can create follow requests"
  ON follow_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Users can update requests they received (to accept/decline)
DROP POLICY IF EXISTS "Users can update received requests" ON follow_requests;
CREATE POLICY "Users can update received requests"
  ON follow_requests FOR UPDATE
  USING (auth.uid() = target_id);

-- Users can delete their own sent requests (cancel)
DROP POLICY IF EXISTS "Users can cancel own requests" ON follow_requests;
CREATE POLICY "Users can cancel own requests"
  ON follow_requests FOR DELETE
  USING (auth.uid() = requester_id);

-- =====================================================
-- FUNCTION: Create follow request or direct follow
-- =====================================================
CREATE OR REPLACE FUNCTION create_follow_or_request(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  target_is_private BOOLEAN;
  existing_follow UUID;
  existing_request UUID;
  result jsonb;
BEGIN
  current_user_id := auth.uid();

  -- Can't follow yourself
  IF current_user_id = target_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot follow yourself', 'type', 'error');
  END IF;

  -- Check if already following
  SELECT id INTO existing_follow FROM follows
  WHERE follower_id = current_user_id AND following_id = target_user_id;

  IF existing_follow IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'type', 'already_following');
  END IF;

  -- Check if target is private
  SELECT COALESCE(is_private, false) INTO target_is_private
  FROM profiles WHERE id = target_user_id;

  IF target_is_private THEN
    -- Check for existing request
    SELECT id INTO existing_request FROM follow_requests
    WHERE requester_id = current_user_id AND target_id = target_user_id AND status = 'pending';

    IF existing_request IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'type', 'already_requested');
    END IF;

    -- Create follow request
    INSERT INTO follow_requests (requester_id, target_id, status)
    VALUES (current_user_id, target_user_id, 'pending')
    ON CONFLICT (requester_id, target_id)
    DO UPDATE SET status = 'pending', updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'type', 'request_created');
  ELSE
    -- Direct follow for public accounts
    INSERT INTO follows (follower_id, following_id)
    VALUES (current_user_id, target_user_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'type', 'followed');
  END IF;
END;
$$;

-- =====================================================
-- FUNCTION: Accept follow request
-- =====================================================
CREATE OR REPLACE FUNCTION accept_follow_request(request_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  request_record RECORD;
BEGIN
  current_user_id := auth.uid();

  -- Get the request
  SELECT * INTO request_record FROM follow_requests
  WHERE id = request_id AND target_id = current_user_id AND status = 'pending';

  IF request_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  -- Update request status
  UPDATE follow_requests SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;

  -- Create the follow
  INSERT INTO follows (follower_id, following_id)
  VALUES (request_record.requester_id, request_record.target_id)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'requester_id', request_record.requester_id);
END;
$$;

-- =====================================================
-- FUNCTION: Decline follow request
-- =====================================================
CREATE OR REPLACE FUNCTION decline_follow_request(request_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  request_record RECORD;
BEGIN
  current_user_id := auth.uid();

  -- Get the request
  SELECT * INTO request_record FROM follow_requests
  WHERE id = request_id AND target_id = current_user_id AND status = 'pending';

  IF request_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  -- Update request status
  UPDATE follow_requests SET status = 'declined', updated_at = NOW()
  WHERE id = request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =====================================================
-- FUNCTION: Cancel follow request (by requester)
-- =====================================================
CREATE OR REPLACE FUNCTION cancel_follow_request(target_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  deleted_count INTEGER;
BEGIN
  current_user_id := auth.uid();

  DELETE FROM follow_requests
  WHERE requester_id = current_user_id AND target_id = target_user_id AND status = 'pending';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RETURN jsonb_build_object('success', true);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'No pending request found');
  END IF;
END;
$$;

-- =====================================================
-- FUNCTION: Get pending follow requests count
-- =====================================================
CREATE OR REPLACE FUNCTION get_pending_requests_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::INTEGER FROM follow_requests
  WHERE target_id = auth.uid() AND status = 'pending';
$$;

-- =====================================================
-- FUNCTION: Check if follow request is pending
-- =====================================================
CREATE OR REPLACE FUNCTION has_pending_request(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM follow_requests
    WHERE requester_id = auth.uid()
    AND target_id = target_user_id
    AND status = 'pending'
  );
$$;

-- =====================================================
-- TRIGGER: Send notification on new follow request
-- =====================================================
CREATE OR REPLACE FUNCTION notify_follow_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender_name TEXT;
  v_sender_avatar TEXT;
BEGIN
  -- Only notify on new pending requests
  IF NEW.status = 'pending' THEN
    SELECT COALESCE(full_name, username, 'Someone'), avatar_url
    INTO v_sender_name, v_sender_avatar
    FROM profiles WHERE id = NEW.requester_id;

    -- Create notification
    INSERT INTO notifications (user_id, type, title, body, data, related_user_id)
    VALUES (
      NEW.target_id,
      'follow_request',
      'Follow Request',
      v_sender_name || ' wants to follow you',
      jsonb_build_object(
        'request_id', NEW.id,
        'requester_id', NEW.requester_id,
        'sender_name', v_sender_name,
        'sender_avatar', v_sender_avatar
      ),
      NEW.requester_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_follow_request_created ON follow_requests;
CREATE TRIGGER on_follow_request_created
  AFTER INSERT ON follow_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_follow_request();

-- =====================================================
-- TRIGGER: Notify when request is accepted
-- =====================================================
CREATE OR REPLACE FUNCTION notify_follow_request_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_accepter_name TEXT;
  v_accepter_avatar TEXT;
BEGIN
  -- Only notify when status changes to accepted
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT COALESCE(full_name, username, 'Someone'), avatar_url
    INTO v_accepter_name, v_accepter_avatar
    FROM profiles WHERE id = NEW.target_id;

    -- Notify the requester that their request was accepted
    INSERT INTO notifications (user_id, type, title, body, data, related_user_id)
    VALUES (
      NEW.requester_id,
      'follow_request_accepted',
      'Request Accepted',
      v_accepter_name || ' accepted your follow request',
      jsonb_build_object(
        'target_id', NEW.target_id,
        'accepter_name', v_accepter_name,
        'accepter_avatar', v_accepter_avatar
      ),
      NEW.target_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS on_follow_request_accepted ON follow_requests;
CREATE TRIGGER on_follow_request_accepted
  AFTER UPDATE ON follow_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_follow_request_accepted();

-- =====================================================
-- DONE
-- =====================================================
