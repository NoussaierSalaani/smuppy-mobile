-- Migration 012: Tips, Peak Challenges, Live Battles, Events
-- Smuppy - Production Ready

CREATE EXTENSION IF NOT EXISTS postgis;

BEGIN;

-- ============================================
-- 1. TIPS SYSTEM
-- ============================================

-- Tips table
CREATE TABLE IF NOT EXISTS tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    amount_in_cents INTEGER NOT NULL,
    platform_fee DECIMAL(10, 2) NOT NULL,
    creator_amount DECIMAL(10, 2) NOT NULL,

    -- Context: where the tip was sent
    context_type VARCHAR(20) NOT NULL CHECK (context_type IN ('profile', 'live', 'peak', 'battle')),
    context_id UUID, -- peak_id, live_id, battle_id (nullable for profile tips)

    -- Stripe
    stripe_payment_intent_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),

    -- Message with tip (optional)
    message TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Tip presets per creator
CREATE TABLE IF NOT EXISTS tip_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Preset amounts (in cents)
    preset_amounts INTEGER[] DEFAULT ARRAY[200, 500, 1000, 2000],
    min_amount INTEGER DEFAULT 100,
    max_amount INTEGER DEFAULT 50000,

    -- Custom tip enabled
    allow_custom_amount BOOLEAN DEFAULT TRUE,

    -- Messages
    allow_messages BOOLEAN DEFAULT TRUE,
    allow_anonymous BOOLEAN DEFAULT TRUE,

    -- Thank you message
    thank_you_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(creator_id)
);

-- Tip leaderboard (cached for performance)
CREATE TABLE IF NOT EXISTS tip_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tipper_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    total_amount DECIMAL(12, 2) DEFAULT 0,
    tip_count INTEGER DEFAULT 0,

    -- Period
    period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('all_time', 'monthly', 'weekly')),
    period_start DATE,

    rank INTEGER,

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(creator_id, tipper_id, period_type, period_start)
);

-- ============================================
-- 2. PEAK CHALLENGES
-- ============================================

-- Challenge types
CREATE TABLE IF NOT EXISTS challenge_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(50), -- fitness, sports, wellness, fun

    -- Rules template
    default_duration_seconds INTEGER,
    default_rules JSONB,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default challenge types
INSERT INTO challenge_types (name, slug, description, icon, category, default_duration_seconds) VALUES
    ('Pushup Challenge', 'pushups', 'Max pushups in time limit', 'fitness', 'fitness', 30),
    ('Plank Hold', 'plank', 'Hold plank as long as possible', 'accessibility', 'fitness', NULL),
    ('Squat Challenge', 'squats', 'Max squats in time limit', 'fitness', 'fitness', 60),
    ('Burpee Challenge', 'burpees', 'Max burpees in time limit', 'local-fire-department', 'fitness', 30),
    ('Running Sprint', 'sprint', 'Fastest time for distance', 'directions-run', 'sports', NULL),
    ('Freestyle', 'freestyle', 'Custom challenge', 'star', 'fun', NULL),
    ('Dance Move', 'dance', 'Best dance move recreation', 'music-note', 'fun', NULL),
    ('Trick Shot', 'trickshot', 'Best trick shot', 'sports-basketball', 'sports', NULL)
ON CONFLICT (slug) DO NOTHING;

-- Peak challenges (extends peaks table)
CREATE TABLE IF NOT EXISTS peak_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Challenge details
    challenge_type_id UUID REFERENCES challenge_types(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    rules TEXT,

    -- Timing
    duration_seconds INTEGER, -- e.g., 30 seconds to complete
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ, -- optional deadline

    -- Participation
    is_public BOOLEAN DEFAULT TRUE,
    allow_anyone BOOLEAN DEFAULT TRUE, -- or only tagged users
    max_participants INTEGER,

    -- Rewards
    has_prize BOOLEAN DEFAULT FALSE,
    prize_description TEXT,
    prize_amount DECIMAL(10, 2),

    -- Tips enabled (Pro creators only)
    tips_enabled BOOLEAN DEFAULT FALSE,
    total_tips DECIMAL(12, 2) DEFAULT 0,

    -- Stats
    response_count INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
    winner_response_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(peak_id)
);

-- Challenge responses (peaks that respond to a challenge)
CREATE TABLE IF NOT EXISTS challenge_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES peak_challenges(id) ON DELETE CASCADE,
    peak_id UUID NOT NULL REFERENCES peaks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Performance
    score INTEGER, -- e.g., number of pushups
    time_seconds DECIMAL(10, 2), -- e.g., time to complete

    -- Ranking
    rank INTEGER,

    -- Engagement
    vote_count INTEGER DEFAULT 0,
    tip_amount DECIMAL(10, 2) DEFAULT 0,

    -- Status
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'winner', 'disqualified')),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(challenge_id, user_id)
);

-- Challenge tags (users invited to participate)
CREATE TABLE IF NOT EXISTS challenge_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES peak_challenges(id) ON DELETE CASCADE,
    tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Response tracking
    has_responded BOOLEAN DEFAULT FALSE,
    response_id UUID REFERENCES challenge_responses(id),

    -- Notification sent
    notified_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(challenge_id, tagged_user_id)
);

-- Challenge votes
CREATE TABLE IF NOT EXISTS challenge_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES challenge_responses(id) ON DELETE CASCADE,
    voter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    vote_type VARCHAR(10) DEFAULT 'up' CHECK (vote_type IN ('up', 'super')), -- super = counts more

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(response_id, voter_id)
);

-- ============================================
-- 3. LIVE BATTLES
-- ============================================

CREATE TABLE IF NOT EXISTS live_battles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Host who initiated
    host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Battle details
    title VARCHAR(200),
    description TEXT,
    battle_type VARCHAR(20) DEFAULT 'tips' CHECK (battle_type IN ('tips', 'votes', 'challenge')),

    -- Participants (2-4 creators)
    max_participants INTEGER DEFAULT 2 CHECK (max_participants >= 2 AND max_participants <= 4),

    -- Timing
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 10,

    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'live', 'ended', 'cancelled')),

    -- Results
    winner_id UUID REFERENCES profiles(id),

    -- Agora
    agora_channel_name VARCHAR(100),

    -- Stats
    total_tips DECIMAL(12, 2) DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    peak_viewers INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Battle participants
CREATE TABLE IF NOT EXISTS battle_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id UUID NOT NULL REFERENCES live_battles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Invitation
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'declined', 'joined', 'left')),

    -- Position in split screen (1, 2, 3, 4)
    position INTEGER,

    -- Agora
    agora_uid INTEGER,

    -- Results
    tips_received DECIMAL(12, 2) DEFAULT 0,
    votes_received INTEGER DEFAULT 0,
    is_winner BOOLEAN DEFAULT FALSE,

    -- Stream quality
    is_streaming BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(battle_id, user_id)
);

-- Battle viewers
CREATE TABLE IF NOT EXISTS battle_viewers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id UUID NOT NULL REFERENCES live_battles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ,

    -- Engagement
    tips_sent DECIMAL(10, 2) DEFAULT 0,
    votes_cast INTEGER DEFAULT 0,

    UNIQUE(battle_id, user_id)
);

-- ============================================
-- 4. EVENTS (XPLORER)
-- ============================================

CREATE TABLE IF NOT EXISTS event_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(50),
    color VARCHAR(7), -- hex color

    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default event categories
INSERT INTO event_categories (name, slug, icon, color, sort_order) VALUES
    ('Running', 'running', 'directions-run', '#FF6B6B', 1),
    ('Hiking', 'hiking', 'terrain', '#4ECDC4', 2),
    ('Cycling', 'cycling', 'pedal-bike', '#45B7D1', 3),
    ('Soccer', 'soccer', 'sports-soccer', '#96CEB4', 4),
    ('Basketball', 'basketball', 'sports-basketball', '#FFEAA7', 5),
    ('Tennis', 'tennis', 'sports-tennis', '#DDA0DD', 6),
    ('Padel', 'padel', 'sports-tennis', '#98D8C8', 7),
    ('Yoga', 'yoga', 'self-improvement', '#F7DC6F', 8),
    ('CrossFit', 'crossfit', 'fitness-center', '#E74C3C', 9),
    ('Swimming', 'swimming', 'pool', '#3498DB', 10),
    ('Martial Arts', 'martial-arts', 'sports-martial-arts', '#9B59B6', 11),
    ('Dance', 'dance', 'music-note', '#E91E63', 12),
    ('Other', 'other', 'event', '#95A5A6', 99)
ON CONFLICT (slug) DO NOTHING;

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Basic info
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES event_categories(id),

    -- Location
    location_name VARCHAR(200),
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Date & Time
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Recurrence (optional)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule VARCHAR(100), -- RRULE format

    -- Participation
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    min_participants INTEGER DEFAULT 1,

    -- Pricing
    is_free BOOLEAN DEFAULT TRUE,
    price DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Visibility
    is_public BOOLEAN DEFAULT TRUE,
    is_fans_only BOOLEAN DEFAULT FALSE,

    -- Media
    cover_image_url TEXT,
    images TEXT[], -- array of image URLs

    -- Route (for running, hiking, cycling)
    has_route BOOLEAN DEFAULT FALSE,
    route_distance_km DECIMAL(10, 2),
    route_elevation_gain_m INTEGER,
    route_difficulty VARCHAR(20) CHECK (route_difficulty IN ('easy', 'moderate', 'hard', 'expert')),
    route_polyline TEXT, -- encoded polyline for map
    route_waypoints JSONB, -- array of {lat, lng, name}

    -- Status
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('draft', 'upcoming', 'ongoing', 'completed', 'cancelled')),

    -- Stats
    view_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event participants
CREATE TABLE IF NOT EXISTS event_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Status
    status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('interested', 'registered', 'confirmed', 'attended', 'cancelled', 'no_show')),

    -- Payment (if paid event)
    payment_id UUID REFERENCES payments(id),
    amount_paid DECIMAL(10, 2),

    -- Check-in
    checked_in_at TIMESTAMPTZ,

    -- Notes
    notes TEXT,

    registered_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(event_id, user_id)
);

-- Event chat
CREATE TABLE IF NOT EXISTS event_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    message TEXT NOT NULL,

    -- Reply
    reply_to_id UUID REFERENCES event_messages(id),

    -- Pinned by organizer
    is_pinned BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

-- Event invitations
CREATE TABLE IF NOT EXISTS event_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),

    message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,

    UNIQUE(event_id, invitee_id)
);

-- ============================================
-- 5. CURRENCY SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS currency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    preferred_currency VARCHAR(3) DEFAULT 'EUR',
    detected_currency VARCHAR(3),
    country_code VARCHAR(2),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id)
);

-- Supported currencies
CREATE TABLE IF NOT EXISTS supported_currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    symbol VARCHAR(5) NOT NULL,
    decimal_places INTEGER DEFAULT 2,
    is_active BOOLEAN DEFAULT TRUE,

    -- Stripe support
    stripe_supported BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO supported_currencies (code, name, symbol) VALUES
    ('EUR', 'Euro', '€'),
    ('USD', 'US Dollar', '$'),
    ('GBP', 'British Pound', '£'),
    ('CAD', 'Canadian Dollar', 'CA$'),
    ('CHF', 'Swiss Franc', 'CHF'),
    ('AUD', 'Australian Dollar', 'A$'),
    ('JPY', 'Japanese Yen', '¥'),
    ('SEK', 'Swedish Krona', 'kr'),
    ('NOK', 'Norwegian Krone', 'kr'),
    ('DKK', 'Danish Krone', 'kr')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Tips indexes
CREATE INDEX IF NOT EXISTS idx_tips_sender ON tips(sender_id);
CREATE INDEX IF NOT EXISTS idx_tips_receiver ON tips(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tips_context ON tips(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_tips_created ON tips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_status ON tips(payment_status);

-- Challenges indexes
CREATE INDEX IF NOT EXISTS idx_peak_challenges_creator ON peak_challenges(creator_id);
CREATE INDEX IF NOT EXISTS idx_peak_challenges_status ON peak_challenges(status);
CREATE INDEX IF NOT EXISTS idx_peak_challenges_public ON peak_challenges(is_public, status);
CREATE INDEX IF NOT EXISTS idx_challenge_responses_challenge ON challenge_responses(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_responses_user ON challenge_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_tags_user ON challenge_tags(tagged_user_id);

-- Battles indexes
CREATE INDEX IF NOT EXISTS idx_battles_host ON live_battles(host_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON live_battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_scheduled ON live_battles(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_battle_participants_user ON battle_participants(user_id);

-- Events indexes
CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_location ON events USING GIST (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_public ON events(is_public, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_event_participants_user ON event_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update tips leaderboard
CREATE OR REPLACE FUNCTION update_tip_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
    -- All time
    INSERT INTO tip_leaderboard (creator_id, tipper_id, total_amount, tip_count, period_type, period_start)
    VALUES (NEW.receiver_id, NEW.sender_id, NEW.amount, 1, 'all_time', NULL)
    ON CONFLICT (creator_id, tipper_id, period_type, period_start)
    DO UPDATE SET
        total_amount = tip_leaderboard.total_amount + NEW.amount,
        tip_count = tip_leaderboard.tip_count + 1,
        updated_at = NOW();

    -- Monthly
    INSERT INTO tip_leaderboard (creator_id, tipper_id, total_amount, tip_count, period_type, period_start)
    VALUES (NEW.receiver_id, NEW.sender_id, NEW.amount, 1, 'monthly', DATE_TRUNC('month', NOW()))
    ON CONFLICT (creator_id, tipper_id, period_type, period_start)
    DO UPDATE SET
        total_amount = tip_leaderboard.total_amount + NEW.amount,
        tip_count = tip_leaderboard.tip_count + 1,
        updated_at = NOW();

    -- Weekly
    INSERT INTO tip_leaderboard (creator_id, tipper_id, total_amount, tip_count, period_type, period_start)
    VALUES (NEW.receiver_id, NEW.sender_id, NEW.amount, 1, 'weekly', DATE_TRUNC('week', NOW()))
    ON CONFLICT (creator_id, tipper_id, period_type, period_start)
    DO UPDATE SET
        total_amount = tip_leaderboard.total_amount + NEW.amount,
        tip_count = tip_leaderboard.tip_count + 1,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tip_leaderboard
    AFTER INSERT ON tips
    FOR EACH ROW
    WHEN (NEW.payment_status = 'completed')
    EXECUTE FUNCTION update_tip_leaderboard();

-- Update challenge response count
CREATE OR REPLACE FUNCTION update_challenge_response_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE peak_challenges
    SET response_count = (
        SELECT COUNT(*) FROM challenge_responses WHERE challenge_id = NEW.challenge_id
    ),
    updated_at = NOW()
    WHERE id = NEW.challenge_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_challenge_response_count
    AFTER INSERT OR DELETE ON challenge_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_challenge_response_count();

-- Update event participant count
CREATE OR REPLACE FUNCTION update_event_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE events
    SET current_participants = (
        SELECT COUNT(*) FROM event_participants
        WHERE event_id = COALESCE(NEW.event_id, OLD.event_id)
        AND status IN ('registered', 'confirmed', 'attended')
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.event_id, OLD.event_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_event_participant_count
    AFTER INSERT OR UPDATE OR DELETE ON event_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_event_participant_count();

COMMIT;
