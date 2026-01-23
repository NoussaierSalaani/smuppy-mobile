#!/usr/bin/env node

/**
 * Fix bot posts - Update existing posts to use correct column names
 * and generate new posts with proper format
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// Category to tags mapping
const CATEGORY_TAGS = {
  yoga: ["Yoga", "Pilates", "Flexibility"],
  running: ["Running", "Trail Running", "Marathon"],
  nutrition: ["Nutrition", "Meal Prep", "Healthy Eating"],
  strength: ["Strength Training", "Weightlifting", "Powerlifting"],
  combat: ["Boxing", "MMA", "Martial Arts"],
  swimming: ["Swimming", "Water Sports"],
  cycling: ["Cycling", "Mountain Biking", "Spinning"],
  dance: ["Dance", "Zumba"],
  meditation: ["Meditation", "Mindfulness", "Breathwork"],
  outdoor: ["Hiking", "Climbing", "Outdoor Fitness"],
  team_sports: ["Football", "Basketball", "Team Sports"],
  tennis: ["Tennis", "Padel"],
  winter: ["Skiing", "Snowboarding"],
  extreme: ["Skateboarding", "Parkour", "Extreme Sports"],
  wellness: ["Wellness", "Recovery"],
  home: ["Home Workout", "Bodyweight Training"],
  fitness: ["Fitness", "Gym"],
};

// Detect category from bio
function detectCategory(bio) {
  const bioLower = (bio || "").toLowerCase();
  if (bioLower.includes("yoga") || bioLower.includes("pilates")) return "yoga";
  if (bioLower.includes("run") || bioLower.includes("marathon")) return "running";
  if (bioLower.includes("nutrition") || bioLower.includes("meal")) return "nutrition";
  if (bioLower.includes("strength") || bioLower.includes("muscle") || bioLower.includes("lift")) return "strength";
  if (bioLower.includes("box") || bioLower.includes("mma") || bioLower.includes("martial")) return "combat";
  if (bioLower.includes("swim") || bioLower.includes("water") || bioLower.includes("aqua")) return "swimming";
  if (bioLower.includes("cycl") || bioLower.includes("bike")) return "cycling";
  if (bioLower.includes("dance") || bioLower.includes("zumba")) return "dance";
  if (bioLower.includes("meditation") || bioLower.includes("mindfulness")) return "meditation";
  if (bioLower.includes("hiking") || bioLower.includes("climbing") || bioLower.includes("outdoor")) return "outdoor";
  if (bioLower.includes("football") || bioLower.includes("basketball")) return "team_sports";
  if (bioLower.includes("tennis") || bioLower.includes("padel")) return "tennis";
  if (bioLower.includes("ski") || bioLower.includes("snow")) return "winter";
  if (bioLower.includes("skateboard") || bioLower.includes("parkour") || bioLower.includes("extreme")) return "extreme";
  if (bioLower.includes("wellness") || bioLower.includes("recovery") || bioLower.includes("spa")) return "wellness";
  if (bioLower.includes("home") || bioLower.includes("bodyweight") || bioLower.includes("online")) return "home";
  return "fitness";
}

async function apiCall(endpoint, method, body) {
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method,
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  console.log('===========================================');
  console.log('FIXING BOT POSTS FORMAT');
  console.log('===========================================\n');

  // 1. Get all verified bot profiles with their bios
  console.log('1. Fetching bot profiles...');
  const profiles = await apiCall('/rest/v1/profiles?is_verified=eq.true&select=id,bio', 'GET');
  console.log(`   Found ${profiles.length} verified profiles\n`);

  // Create a map of author_id -> category/tags
  const profileCategories = {};
  for (const profile of profiles) {
    const category = detectCategory(profile.bio);
    profileCategories[profile.id] = {
      category,
      tags: CATEGORY_TAGS[category] || CATEGORY_TAGS.fitness
    };
  }

  // 2. Get all posts from verified bots that need fixing
  console.log('2. Fetching posts to fix...');
  const posts = await apiCall('/rest/v1/posts?select=id,author_id,media_url,caption,media_urls,content,tags,media_type', 'GET');

  // Handle API errors
  if (!Array.isArray(posts)) {
    console.log('   Error fetching posts:', posts);
    console.log('   Trying alternative query...');
    // Try simpler query
    const simplePosts = await apiCall('/rest/v1/posts?select=*', 'GET');
    if (!Array.isArray(simplePosts)) {
      console.log('   Still failing. Response:', JSON.stringify(simplePosts).substring(0, 200));
      return;
    }
  }

  const postsArray = Array.isArray(posts) ? posts : [];

  // Filter to posts from verified bots
  const botPosts = postsArray.filter(p => profileCategories[p.author_id]);
  console.log(`   Found ${botPosts.length} bot posts out of ${postsArray.length} total\n`);

  // 3. Fix posts that have old format (media_url instead of media_urls)
  console.log('3. Fixing post format...');
  let fixed = 0;
  let alreadyCorrect = 0;

  for (const post of botPosts) {
    const profileData = profileCategories[post.author_id];
    const needsFix = (
      post.media_url && !post.media_urls ||
      post.caption && !post.content ||
      !post.tags || post.tags.length === 0
    );

    if (needsFix) {
      const updates = {};

      // Fix media_urls if needed
      if (post.media_url && (!post.media_urls || post.media_urls.length === 0)) {
        updates.media_urls = [post.media_url];
      }

      // Fix content if needed
      if (post.caption && !post.content) {
        updates.content = post.caption;
      }

      // Add tags if missing
      if (!post.tags || post.tags.length === 0) {
        updates.tags = profileData.tags;
      }

      // Fix media_type if it's 'photo'
      updates.media_type = 'image';

      if (Object.keys(updates).length > 0) {
        await apiCall(`/rest/v1/posts?id=eq.${post.id}`, 'PATCH', updates);
        fixed++;
        if (fixed % 50 === 0) {
          console.log(`   Fixed ${fixed} posts...`);
        }
      }
    } else {
      alreadyCorrect++;
    }
  }

  console.log(`   Fixed: ${fixed} posts`);
  console.log(`   Already correct: ${alreadyCorrect} posts\n`);

  // 4. Trigger new content generation
  console.log('4. Triggering new content generation...');
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-bot-content`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    const result = await response.json();
    console.log(`   Generated: ${result.generated || 0} new posts`);
    console.log(`   Failed: ${result.failed || 0}`);
  } catch (error) {
    console.log('   Error triggering generation:', error.message);
  }

  // 5. Verify final state
  console.log('\n5. Verifying final state...');
  const finalPosts = await apiCall('/rest/v1/posts?select=id,media_urls,content,tags&limit=5', 'GET');
  console.log('   Sample post format:');
  if (finalPosts[0]) {
    console.log(`   - media_urls: ${finalPosts[0].media_urls ? 'OK (array)' : 'MISSING'}`);
    console.log(`   - content: ${finalPosts[0].content ? 'OK' : 'MISSING'}`);
    console.log(`   - tags: ${finalPosts[0].tags ? `OK (${finalPosts[0].tags.length} tags)` : 'MISSING'}`);
  }

  console.log('\n===========================================');
  console.log('DONE!');
  console.log('===========================================');
}

main().catch(console.error);
