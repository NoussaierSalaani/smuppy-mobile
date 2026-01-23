#!/bin/bash

# ===========================================
# SMUPPY BOT ACCOUNTS SEED SCRIPT
# Creates bot accounts with profiles and content
# ===========================================

SUPABASE_URL="https://wbgfaeytioxnkdsuvvlx.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0"

# Bot accounts data
declare -a BOTS=(
  "fitcoach.sarah@smuppy.bot|FitCoach_Sarah|Sarah Mitchell|Certified fitness coach helping you reach your goals|Fitness|https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400"
  "yoga.with.mia@smuppy.bot|YogaWithMia|Mia Chen|Yoga instructor & wellness advocate. Namaste|Yoga|https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400"
  "runner.max@smuppy.bot|RunnerMax|Max Johnson|Marathon runner. 42K is just the beginning|Running|https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400"
  "nutrition.pro@smuppy.bot|NutritionPro|Dr. Emma White|Nutritionist helping you fuel your body right|Nutrition|https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400"
  "strength.king@smuppy.bot|StrengthKing|James Power|Powerlifting champion. Lift heavy, stay humble|Bodybuilding|https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400"
  "mindset.guru@smuppy.bot|MindsetGuru|Alex Motivation|Your daily dose of motivation and mental strength|Motivation|https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400"
  "cardio.queen@smuppy.bot|CardioQueen|Lisa Burns|HIIT specialist. Burn calories, build endurance|Cardio|https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400"
  "flex.master@smuppy.bot|FlexMaster|Tony Stretch|Flexibility & mobility coach. Move better, feel better|Stretching|https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400"
  "wellness.wave@smuppy.bot|WellnessWave|Sophie Calm|Holistic wellness & meditation guide|Wellness|https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400"
  "sports.daily@smuppy.bot|SportsDaily|Chris Athletic|All things sports. News, tips, and highlights|Sports|https://images.unsplash.com/photo-1461896836934- voices-of-reason?w=400"
  "home.workout@smuppy.bot|HomeWorkout|Nina Fit|No gym? No problem! Home workout specialist|Home Fitness|https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400"
  "outdoor.adventures@smuppy.bot|OutdoorAdventures|Jake Wild|Hiking, climbing, outdoor fitness enthusiast|Outdoor|https://images.unsplash.com/photo-1551632811-561732d1e306?w=400"
)

echo "🚀 Creating Smuppy bot accounts..."
echo ""

CREATED_IDS=()

for bot in "${BOTS[@]}"; do
  IFS='|' read -r email username fullname bio category avatar <<< "$bot"

  echo "Creating: $username ($email)"

  # Create auth user
  RESULT=$(curl -s "$SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$email\",
      \"password\": \"SmuppyBot2026!\",
      \"email_confirm\": true,
      \"user_metadata\": {
        \"username\": \"$username\",
        \"full_name\": \"$fullname\"
      }
    }")

  # Extract user ID
  USER_ID=$(echo "$RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
    echo "  ✅ Auth user created: $USER_ID"
    CREATED_IDS+=("$USER_ID|$username|$fullname|$bio|$category|$avatar|$email")

    # Create profile
    PROFILE_RESULT=$(curl -s "$SUPABASE_URL/rest/v1/profiles" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=representation" \
      -d "{
        \"id\": \"$USER_ID\",
        \"username\": \"$username\",
        \"full_name\": \"$fullname\",
        \"bio\": \"$bio\",
        \"avatar_url\": \"$avatar\",
        \"account_type\": \"pro_creator\",
        \"is_verified\": true,
        \"expertise\": [\"$category\"]
      }")

    if echo "$PROFILE_RESULT" | grep -q "id"; then
      echo "  ✅ Profile created"
    else
      echo "  ⚠️ Profile may already exist or error: $PROFILE_RESULT"
    fi
  else
    echo "  ❌ Failed to create user: $RESULT"
  fi

  echo ""
done

echo "=========================================="
echo "Bot accounts created! IDs saved for posts."
echo "=========================================="

# Save IDs to file for post creation
echo "" > /tmp/smuppy_bot_ids.txt
for entry in "${CREATED_IDS[@]}"; do
  echo "$entry" >> /tmp/smuppy_bot_ids.txt
done

echo ""
echo "Now creating initial posts for each bot..."
echo ""

# Create posts for each bot
declare -A BOT_POSTS
BOT_POSTS["Fitness"]="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800|Morning workout complete! Remember: consistency beats intensity every time 💪
https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800|New week, new goals. What are you working on this week?
https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800|Form tip: Keep your core engaged during every exercise for better results"

BOT_POSTS["Yoga"]="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800|Start your day with 10 minutes of sun salutations. Your body will thank you 🧘‍♀️
https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800|Breathe in peace, breathe out stress. Happy Monday everyone!
https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800|Balance is not something you find, its something you create"

BOT_POSTS["Running"]="https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800|5K this morning before sunrise. Best way to start the day! 🏃‍♂️
https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800|Trail running is therapy. Find your path!
https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800|Recovery run today. Listen to your body, it knows what it needs"

BOT_POSTS["Nutrition"]="https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800|Meal prep Sunday! Fuel your week with whole foods 🥗
https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800|Hydration tip: Add lemon to your water for extra benefits
https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800|Protein-packed breakfast ideas for busy mornings"

BOT_POSTS["Bodybuilding"]="https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800|Leg day is the best day. No excuses! 💪
https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800|Progress takes time. Trust the process!
https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800|Back and biceps today. Lets get it!"

BOT_POSTS["Motivation"]="https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800|Your only limit is your mind. Break through it! 🔥
https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=800|Success is not final, failure is not fatal. Keep going!
https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800|The pain you feel today is the strength you feel tomorrow"

BOT_POSTS["Cardio"]="https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800|30-minute HIIT session done! Calories torched 🔥
https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=800|Jump rope is underrated. 10 minutes = amazing cardio!
https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800|Cardio doesnt have to be boring. Try dance workouts!"

BOT_POSTS["Stretching"]="https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800|Morning stretch routine for better flexibility 🤸
https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800|Dont skip your cool-down stretches. Recovery matters!
https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800|Hip flexor stretches for desk workers - save your back!"

BOT_POSTS["Wellness"]="https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800|Self-care Sunday: meditation, healthy food, early bed 🌿
https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800|Mental health is just as important as physical health
https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800|5 minutes of deep breathing can change your whole day"

BOT_POSTS["Sports"]="https://images.unsplash.com/photo-1461896836934-eca07ce68773?w=800|Game day energy! Whos watching? ⚽
https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800|Training like a pro: tips from elite athletes
https://images.unsplash.com/photo-1471295253337-3ceaaedca402?w=800|Sports nutrition: what the pros eat before competition"

BOT_POSTS["Home Fitness"]="https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800|No equipment needed! Bodyweight workout for today 🏠
https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800|Your living room is your gym. No excuses!
https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800|5 exercises you can do while watching TV"

BOT_POSTS["Outdoor"]="https://images.unsplash.com/photo-1551632811-561732d1e306?w=800|Mountain hike this weekend. Nature is the best gym! 🏔️
https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800|Beach workout: sand makes everything harder!
https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800|Trail running tips for beginners"

# Read bot IDs and create posts
while IFS='|' read -r uid username fullname bio category avatar email; do
  if [ -n "$uid" ]; then
    echo "Creating posts for $username ($category)..."

    POSTS="${BOT_POSTS[$category]}"
    if [ -n "$POSTS" ]; then
      IFS=$'\n'
      for post_line in $POSTS; do
        IFS='|' read -r img_url content <<< "$post_line"

        curl -s "$SUPABASE_URL/rest/v1/posts" \
          -H "apikey: $SERVICE_ROLE_KEY" \
          -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
          -H "Content-Type: application/json" \
          -H "Prefer: return=minimal" \
          -d "{
            \"author_id\": \"$uid\",
            \"content\": \"$content\",
            \"media_urls\": [\"$img_url\"],
            \"media_type\": \"image\",
            \"visibility\": \"public\",
            \"likes_count\": $((RANDOM % 500 + 50)),
            \"comments_count\": $((RANDOM % 30 + 5))
          }"

        echo "  ✅ Post created"
      done
    fi
  fi
done < /tmp/smuppy_bot_ids.txt

echo ""
echo "=========================================="
echo "✅ All done! Bot accounts and posts created."
echo "=========================================="
