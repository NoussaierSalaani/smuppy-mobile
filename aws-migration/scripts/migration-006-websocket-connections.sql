-- Migration 006: WebSocket Connections & Real-time Features
-- Tables for managing WebSocket connections and real-time state

-- =====================================================
-- WEBSOCKET CONNECTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS websocket_connections (
    connection_id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    connected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for websocket connections
CREATE INDEX IF NOT EXISTS idx_ws_connections_user_id ON websocket_connections(user_id);

-- =====================================================
-- PEAKS TABLE (short videos like TikTok/Reels)
-- =====================================================
CREATE TABLE IF NOT EXISTS peaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    duration INTEGER,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for peaks
CREATE INDEX IF NOT EXISTS idx_peaks_author_id ON peaks(author_id);
CREATE INDEX IF NOT EXISTS idx_peaks_created_at ON peaks(created_at DESC);

-- =====================================================
-- PEAK LIKES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS peak_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, peak_id)
);

-- Indexes for peak likes
CREATE INDEX IF NOT EXISTS idx_peak_likes_peak_id ON peak_likes(peak_id);

-- =====================================================
-- PEAK COMMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS peak_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for peak comments
CREATE INDEX IF NOT EXISTS idx_peak_comments_peak_id ON peak_comments(peak_id);

-- =====================================================
-- SPOTS TABLE (for local businesses/gyms)
-- =====================================================
CREATE TABLE IF NOT EXISTS spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    sport_type VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    images TEXT[] DEFAULT '{}',
    amenities TEXT[] DEFAULT '{}',
    rating DECIMAL(3, 2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    opening_hours JSONB DEFAULT '{}',
    contact_info JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for spots
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_sport_type ON spots(sport_type);
CREATE INDEX IF NOT EXISTS idx_spots_location ON spots(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_spots_creator_id ON spots(creator_id);

-- =====================================================
-- SPOT REVIEWS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS spot_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    images TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(spot_id, user_id)
);

-- Indexes for spot reviews
CREATE INDEX IF NOT EXISTS idx_spot_reviews_spot_id ON spot_reviews(spot_id);
CREATE INDEX IF NOT EXISTS idx_spot_reviews_user_id ON spot_reviews(user_id);

-- =====================================================
-- SAVED SPOTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS saved_spots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    spot_id UUID NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, spot_id)
);

-- Indexes for saved spots
CREATE INDEX IF NOT EXISTS idx_saved_spots_user_id ON saved_spots(user_id);

-- Apply update trigger to spots
DROP TRIGGER IF EXISTS update_spots_updated_at ON spots;
CREATE TRIGGER update_spots_updated_at
    BEFORE UPDATE ON spots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
