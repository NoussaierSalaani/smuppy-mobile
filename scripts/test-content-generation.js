#!/usr/bin/env node

/**
 * ===========================================
 * LOCAL TEST SCRIPT FOR CONTENT GENERATION
 * Tests the AI content generation locally
 * ===========================================
 *
 * Usage: node scripts/test-content-generation.js
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// Get from .env or environment
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-api03-GPVJMOxqOF2DP2dN-iMPvjZaS2P_pUPUq_cNBSkxaM2_4_MzXiJfCnqEE3FYMEBtTAYL9V-zIiWCn2A5RfRWgQ-rNuQEAAA";

const POSTS_TO_GENERATE = 3; // Test with 3 posts

// ============================================
// IMAGE COLLECTIONS BY CATEGORY
// ============================================

const CATEGORY_IMAGES = {
  fitness: [
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800",
    "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
  ],
  yoga: [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800",
  ],
  running: [
    "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800",
    "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800",
  ],
  nutrition: [
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800",
  ],
  strength: [
    "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800",
    "https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800",
  ],
  combat: [
    "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800",
    "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=800",
  ],
  swimming: [
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800",
    "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800",
  ],
  cycling: [
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800",
    "https://images.unsplash.com/photo-1544191696-102dbdaeeaa0?w=800",
  ],
  dance: [
    "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800",
    "https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=800",
  ],
  meditation: [
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    "https://images.unsplash.com/photo-1545205597-3d9d02c29547?w=800",
  ],
  outdoor: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800",
    "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800",
  ],
};

// ============================================
// CATEGORY DETECTION
// ============================================

function detectCategory(bio) {
  const bioLower = (bio || "").toLowerCase();

  if (bioLower.includes("yoga") || bioLower.includes("pilates")) return "yoga";
  if (bioLower.includes("run") || bioLower.includes("marathon") || bioLower.includes("trail")) return "running";
  if (bioLower.includes("nutrition") || bioLower.includes("meal") || bioLower.includes("keto") || bioLower.includes("vegan")) return "nutrition";
  if (bioLower.includes("strength") || bioLower.includes("muscle") || bioLower.includes("powerlifting") || bioLower.includes("lift")) return "strength";
  if (bioLower.includes("box") || bioLower.includes("mma") || bioLower.includes("bjj") || bioLower.includes("martial") || bioLower.includes("kickbox")) return "combat";
  if (bioLower.includes("swim") || bioLower.includes("water") || bioLower.includes("surf") || bioLower.includes("diving") || bioLower.includes("aqua")) return "swimming";
  if (bioLower.includes("cycl") || bioLower.includes("bike") || bioLower.includes("mtb")) return "cycling";
  if (bioLower.includes("dance") || bioLower.includes("zumba") || bioLower.includes("ballet")) return "dance";
  if (bioLower.includes("meditation") || bioLower.includes("mindfulness") || bioLower.includes("breathwork") || bioLower.includes("mental")) return "meditation";
  if (bioLower.includes("hiking") || bioLower.includes("climbing") || bioLower.includes("outdoor") || bioLower.includes("adventure")) return "outdoor";

  return "fitness";
}

// ============================================
// CLAUDE API CALL
// ============================================

async function generatePostContent(botName, bio, category) {
  const systemPrompt = `You are ${botName}, a fitness influencer on a social media app called Smuppy.
Your bio: "${bio}"
Your specialty: ${category}

Generate a single short, engaging social media post (max 150 characters) that:
- Sounds authentic and personal
- Includes motivation or a tip related to your specialty
- Uses 1-2 relevant emojis
- Does NOT include hashtags
- Speaks directly to your followers

Respond with ONLY the post text, nothing else.`;

  const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const timeOfDay = new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening";

  const userPrompt = `It's ${dayOfWeek} ${timeOfDay}. Create a post about ${category} that your followers will love.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 200,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
    });

    const data = await response.json();

    if (data.content && data.content[0] && data.content[0].text) {
      return data.content[0].text.trim();
    }

    if (data.error) {
      throw new Error(data.error.message || "API Error");
    }

    throw new Error("Invalid response from Claude API");
  } catch (error) {
    console.error("  Error generating content:", error.message);
    return `Another great day for ${category}! Keep pushing! 💪`;
  }
}

// ============================================
// SUPABASE API CALLS
// ============================================

async function apiCall(endpoint, method, body) {
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method,
    headers: {
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("===========================================");
  console.log("SMUPPY AI CONTENT GENERATION TEST");
  console.log("===========================================\n");

  // 1. Get random verified bot profiles
  console.log("Fetching bot profiles...");
  const bots = await apiCall("/rest/v1/profiles?is_verified=eq.true&select=id,username,full_name,bio&limit=50", "GET");

  if (!bots || bots.length === 0 || bots.error) {
    console.error("Failed to fetch bots:", bots);
    return;
  }

  console.log(`Found ${bots.length} verified profiles.\n`);

  // 2. Select random bots
  const shuffled = bots.sort(() => 0.5 - Math.random());
  const selectedBots = shuffled.slice(0, POSTS_TO_GENERATE);

  console.log(`Generating posts for ${selectedBots.length} random bots...\n`);

  // 3. Generate content for each
  for (const bot of selectedBots) {
    console.log(`\n--- ${bot.username} ---`);
    console.log(`Bio: ${(bot.bio || "No bio").substring(0, 50)}...`);

    const category = detectCategory(bot.bio);
    console.log(`Category: ${category}`);

    console.log("Generating AI content...");
    const caption = await generatePostContent(
      bot.full_name || bot.username,
      bot.bio || "Fitness enthusiast",
      category
    );

    console.log(`\nGenerated post: "${caption}"`);

    // Select random image
    const images = CATEGORY_IMAGES[category] || CATEGORY_IMAGES.fitness;
    const imageUrl = images[Math.floor(Math.random() * images.length)];

    // Create post
    console.log("Creating post in database...");
    const result = await apiCall("/rest/v1/posts", "POST", {
      author_id: bot.id,
      media_url: imageUrl,
      media_type: "photo",
      caption: caption,
      visibility: "public",
      likes_count: Math.floor(Math.random() * 200) + 20,
      comments_count: Math.floor(Math.random() * 15) + 2,
    });

    if (result && !result.error) {
      console.log("✅ Post created successfully!");
    } else {
      console.log("❌ Failed to create post:", result);
    }
  }

  console.log("\n===========================================");
  console.log("TEST COMPLETE!");
  console.log("===========================================");
}

main().catch(console.error);
