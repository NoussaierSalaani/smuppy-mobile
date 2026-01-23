-- ============================================
-- ADD COVER PHOTOS TO BOT PROFILES
-- Date: 2026-01-23
-- ============================================
-- Adds cover_url to profiles based on their interests
-- for a more visually appealing experience
-- ============================================

-- Cover images by interest/category
DO $$
DECLARE
  profile_record RECORD;
  interests_arr TEXT[];
  new_cover TEXT;
BEGIN
  -- Loop through all profiles that don't have a cover_url
  FOR profile_record IN
    SELECT id, interests, username
    FROM profiles p
    WHERE p.cover_url IS NULL OR p.cover_url = ''
  LOOP
    interests_arr := COALESCE(profile_record.interests, ARRAY[]::TEXT[]);
    new_cover := NULL;

    -- Check interests and assign cover based on category
    IF 'Fitness' = ANY(interests_arr) OR 'Gym' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800';
    ELSIF 'Yoga' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800';
    ELSIF 'Running' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800';
    ELSIF 'Cardio' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800';
    ELSIF 'Wellness' = ANY(interests_arr) OR 'Meditation' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800';
    ELSIF 'Nutrition' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800';
    ELSIF 'CrossFit' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800';
    ELSIF 'Swimming' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800';
    ELSIF 'Cycling' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800';
    ELSIF 'Basketball' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800';
    ELSIF 'Football' = ANY(interests_arr) OR 'Soccer' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800';
    ELSIF 'Tennis' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800';
    ELSIF 'Boxing' = ANY(interests_arr) OR 'MMA' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800';
    ELSIF 'Martial Arts' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=800';
    ELSIF 'Hiking' = ANY(interests_arr) OR 'Outdoor' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800';
    ELSIF 'Climbing' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800';
    ELSIF 'Dance' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=800';
    ELSIF 'Pilates' = ANY(interests_arr) THEN
      new_cover := 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800';
    ELSE
      -- Default fitness cover for profiles without specific interests
      new_cover := 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800';
    END IF;

    -- Update the profile with the new cover
    IF new_cover IS NOT NULL THEN
      UPDATE profiles SET cover_url = new_cover WHERE id = profile_record.id;
    END IF;
  END LOOP;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT
  CASE
    WHEN cover_url IS NOT NULL AND cover_url != '' THEN 'Has Cover'
    ELSE 'No Cover'
  END as status,
  COUNT(*) as count
FROM profiles
GROUP BY status;
