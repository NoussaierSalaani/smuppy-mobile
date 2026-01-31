-- Migration 029: Groups (Activity Groups on Map)
-- Users can create and join sports/fitness activity groups

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  sport_type VARCHAR(100),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 1,
  is_free BOOLEAN DEFAULT true,
  price INTEGER, -- cents
  currency VARCHAR(3) DEFAULT 'usd',
  is_public BOOLEAN DEFAULT true,
  is_fans_only BOOLEAN DEFAULT false,
  is_route BOOLEAN DEFAULT false,
  route_start JSONB,
  route_end JSONB,
  route_waypoints JSONB,
  route_geojson JSONB,
  route_profile VARCHAR(50),
  route_distance_km DOUBLE PRECISION,
  route_duration_min INTEGER,
  route_elevation_gain INTEGER,
  difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
  cover_image_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_creator ON groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_groups_starts ON groups(starts_at);
CREATE INDEX IF NOT EXISTS idx_groups_status ON groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_location ON groups(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category);

-- Group participants
CREATE TABLE IF NOT EXISTS group_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_participants_group ON group_participants(group_id);
CREATE INDEX IF NOT EXISTS idx_group_participants_user ON group_participants(user_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trigger_groups_updated_at ON groups;
CREATE TRIGGER trigger_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
