-- Add interests column to profiles table
-- This stores user's selected interests as a text array

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS interests text[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.interests IS 'Array of user interest names (e.g., Fitness, Yoga, Running)';

-- Create index for faster filtering by interests
CREATE INDEX IF NOT EXISTS idx_profiles_interests ON public.profiles USING GIN (interests);
