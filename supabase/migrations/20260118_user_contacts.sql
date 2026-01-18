-- Migration: User contacts for viral invitations
-- Stores hashed contact info for friend matching and future invitations

-- Table to store user's contacts (hashed for privacy)
CREATE TABLE IF NOT EXISTS user_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Hashed contact info (SHA256) for privacy
  email_hash TEXT,
  phone_hash TEXT,

  -- Original format hints (for sending invites later)
  contact_type TEXT CHECK (contact_type IN ('email', 'phone', 'both')),

  -- For display purposes only (first name, no sensitive data)
  display_name TEXT,

  -- Tracking
  is_app_user BOOLEAN DEFAULT FALSE,  -- True if this contact has the app
  matched_user_id UUID REFERENCES auth.users(id),  -- If matched to an app user
  invite_sent_at TIMESTAMPTZ,  -- When we sent an invite (null = not sent yet)

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicates per user
  UNIQUE(user_id, email_hash),
  UNIQUE(user_id, phone_hash)
);

-- Index for fast lookups
CREATE INDEX idx_user_contacts_user_id ON user_contacts(user_id);
CREATE INDEX idx_user_contacts_email_hash ON user_contacts(email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX idx_user_contacts_phone_hash ON user_contacts(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE INDEX idx_user_contacts_not_invited ON user_contacts(user_id) WHERE invite_sent_at IS NULL AND is_app_user = FALSE;

-- Table to store user's own contact info (for matching)
CREATE TABLE IF NOT EXISTS user_contact_hashes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_hash TEXT,
  phone_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_contact_hashes_email ON user_contact_hashes(email_hash) WHERE email_hash IS NOT NULL;
CREATE INDEX idx_user_contact_hashes_phone ON user_contact_hashes(phone_hash) WHERE phone_hash IS NOT NULL;

-- RLS Policies
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contact_hashes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own contacts
CREATE POLICY "Users can view own contacts"
  ON user_contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contacts"
  ON user_contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
  ON user_contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only manage their own hash
CREATE POLICY "Users can manage own hash"
  ON user_contact_hashes FOR ALL
  USING (auth.uid() = user_id);

-- Function to match contacts with existing users
-- Called after user uploads contacts to find friends already on the app
CREATE OR REPLACE FUNCTION match_user_contacts(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_count INTEGER := 0;
BEGIN
  -- Match by email hash
  UPDATE user_contacts uc
  SET
    is_app_user = TRUE,
    matched_user_id = uch.user_id
  FROM user_contact_hashes uch
  WHERE uc.user_id = p_user_id
    AND uc.email_hash IS NOT NULL
    AND uc.email_hash = uch.email_hash
    AND uch.user_id != p_user_id;  -- Don't match with self

  GET DIAGNOSTICS matched_count = ROW_COUNT;

  -- Match by phone hash
  UPDATE user_contacts uc
  SET
    is_app_user = TRUE,
    matched_user_id = uch.user_id
  FROM user_contact_hashes uch
  WHERE uc.user_id = p_user_id
    AND uc.phone_hash IS NOT NULL
    AND uc.phone_hash = uch.phone_hash
    AND uch.user_id != p_user_id
    AND uc.is_app_user = FALSE;  -- Don't re-match already matched

  GET DIAGNOSTICS matched_count = matched_count + ROW_COUNT;

  RETURN matched_count;
END;
$$;

-- Comment for documentation
COMMENT ON TABLE user_contacts IS 'Stores hashed contact information for friend matching and viral invitations. Contacts are hashed for privacy.';
COMMENT ON TABLE user_contact_hashes IS 'Stores hashed contact info of app users for matching with other users contacts.';
