-- Migration: Add tags to posts for interest-based filtering
-- Date: 2026-01-22

-- Add tags column to posts table (array of interest names)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create index for faster tag-based queries
CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN (tags);

-- Comment explaining usage
COMMENT ON COLUMN posts.tags IS 'Array of interest/category tags for filtering (e.g., Fitness, Yoga, Running)';
