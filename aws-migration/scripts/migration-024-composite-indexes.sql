-- Migration 024: Composite indexes for query performance

-- follows: frequent queries by follower/following + status
CREATE INDEX IF NOT EXISTS idx_follows_follower_status ON follows(follower_id, status);
CREATE INDEX IF NOT EXISTS idx_follows_following_status ON follows(following_id, status);

-- notifications: unread count + list by user
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);

-- peaks: author lookup with created_at ordering
CREATE INDEX IF NOT EXISTS idx_peaks_author_created ON peaks(author_id, created_at DESC);

-- posts: author lookup with created_at ordering
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts(author_id, created_at DESC);

-- saved_posts: user saved list ordering
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON saved_posts(user_id, created_at DESC);
