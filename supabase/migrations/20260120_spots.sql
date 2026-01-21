-- ============================================
-- SPOTS TABLE - Custom locations for Smuppy
-- Created by pro creators and businesses
-- ============================================

-- Create spots table
CREATE TABLE IF NOT EXISTS spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Creator info
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Basic info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Location data
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),

  -- Categorization
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  -- Categories: sport, event, business, meetup, route_point, other
  sport_type VARCHAR(50), -- running, cycling, hiking, climbing, etc.

  -- Media
  cover_image_url TEXT,
  images TEXT[], -- Array of image URLs

  -- Metadata
  difficulty_level VARCHAR(20), -- easy, medium, hard, expert
  estimated_duration INTEGER, -- in minutes
  distance DECIMAL(10, 2), -- in km (for routes)
  elevation_gain DECIMAL(10, 2), -- in meters

  -- For routes/parcours
  is_route BOOLEAN DEFAULT FALSE,
  route_points JSONB, -- Array of {lat, lon, order, name?}

  -- Visibility
  visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'followers')),
  is_verified BOOLEAN DEFAULT FALSE, -- Verified by Smuppy team
  is_featured BOOLEAN DEFAULT FALSE, -- Featured spot

  -- Stats
  visit_count INTEGER DEFAULT 0,
  save_count INTEGER DEFAULT 0,
  rating_average DECIMAL(2, 1) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_spots_creator ON spots(creator_id);
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_sport_type ON spots(sport_type);
CREATE INDEX IF NOT EXISTS idx_spots_visibility ON spots(visibility);
CREATE INDEX IF NOT EXISTS idx_spots_location ON spots USING gist (
  ll_to_earth(latitude, longitude)
);
CREATE INDEX IF NOT EXISTS idx_spots_city ON spots(city);
CREATE INDEX IF NOT EXISTS idx_spots_is_featured ON spots(is_featured) WHERE is_featured = TRUE;

-- Full text search on name and description
CREATE INDEX IF NOT EXISTS idx_spots_search ON spots USING gin(
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
);

-- ============================================
-- SPOT SAVES (bookmarks)
-- ============================================
CREATE TABLE IF NOT EXISTS spot_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spot_id)
);

CREATE INDEX IF NOT EXISTS idx_spot_saves_user ON spot_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_spot_saves_spot ON spot_saves(spot_id);

-- ============================================
-- SPOT REVIEWS
-- ============================================
CREATE TABLE IF NOT EXISTS spot_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  images TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spot_id) -- One review per user per spot
);

CREATE INDEX IF NOT EXISTS idx_spot_reviews_spot ON spot_reviews(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_reviews_user ON spot_reviews(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_reviews ENABLE ROW LEVEL SECURITY;

-- Spots policies
CREATE POLICY "Public spots are viewable by everyone"
  ON spots FOR SELECT
  USING (visibility = 'public' OR creator_id = auth.uid());

CREATE POLICY "Users can create spots"
  ON spots FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own spots"
  ON spots FOR UPDATE
  USING (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own spots"
  ON spots FOR DELETE
  USING (auth.uid() = creator_id);

-- Spot saves policies
CREATE POLICY "Users can view their own saves"
  ON spot_saves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save spots"
  ON spot_saves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave spots"
  ON spot_saves FOR DELETE
  USING (auth.uid() = user_id);

-- Spot reviews policies
CREATE POLICY "Reviews are viewable by everyone"
  ON spot_reviews FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create reviews"
  ON spot_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
  ON spot_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
  ON spot_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_spots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spots_updated_at
  BEFORE UPDATE ON spots
  FOR EACH ROW
  EXECUTE FUNCTION update_spots_updated_at();

-- Update save count on spots
CREATE OR REPLACE FUNCTION update_spot_save_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE spots SET save_count = save_count + 1 WHERE id = NEW.spot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE spots SET save_count = save_count - 1 WHERE id = OLD.spot_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spot_save_count_trigger
  AFTER INSERT OR DELETE ON spot_saves
  FOR EACH ROW
  EXECUTE FUNCTION update_spot_save_count();

-- Update rating on spots
CREATE OR REPLACE FUNCTION update_spot_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE spots
  SET
    rating_average = (SELECT AVG(rating)::DECIMAL(2,1) FROM spot_reviews WHERE spot_id = COALESCE(NEW.spot_id, OLD.spot_id)),
    rating_count = (SELECT COUNT(*) FROM spot_reviews WHERE spot_id = COALESCE(NEW.spot_id, OLD.spot_id))
  WHERE id = COALESCE(NEW.spot_id, OLD.spot_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spot_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON spot_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_spot_rating();

-- ============================================
-- HELPER FUNCTION: Find nearby spots
-- ============================================
CREATE OR REPLACE FUNCTION find_nearby_spots(
  user_lat DECIMAL,
  user_lon DECIMAL,
  radius_km DECIMAL DEFAULT 10,
  limit_count INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  description TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  category VARCHAR,
  sport_type VARCHAR,
  cover_image_url TEXT,
  distance_km DECIMAL,
  rating_average DECIMAL,
  creator_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.description,
    s.latitude,
    s.longitude,
    s.category,
    s.sport_type,
    s.cover_image_url,
    (earth_distance(
      ll_to_earth(user_lat, user_lon),
      ll_to_earth(s.latitude, s.longitude)
    ) / 1000)::DECIMAL(10, 2) AS distance_km,
    s.rating_average,
    s.creator_id
  FROM spots s
  WHERE s.visibility = 'public'
    AND earth_distance(
      ll_to_earth(user_lat, user_lon),
      ll_to_earth(s.latitude, s.longitude)
    ) <= radius_km * 1000
  ORDER BY distance_km ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
