/**
 * ===========================================
 * SMUPPY AUTO CONTENT GENERATION
 * Edge Function that generates posts, videos, and Peaks for bot accounts
 * Runs every 2 days via cron
 * ===========================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Content mix: 70% photos, 20% videos, 10% peaks
const PHOTO_RATIO = 0.70;
const VIDEO_RATIO = 0.20;
const PEAK_RATIO = 0.10;

// ============================================
// PHOTO COLLECTIONS BY CATEGORY
// ============================================

const CATEGORY_PHOTOS: Record<string, string[]> = {
  fitness: [
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800",
    "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800",
    "https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800",
    "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800",
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800",
    "https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=800",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800",
    "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800",
  ],
  yoga: [
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=800",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800",
    "https://images.unsplash.com/photo-1510894347713-fc3ed6fdf539?w=800",
    "https://images.unsplash.com/photo-1588286840104-8957b019727f?w=800",
  ],
  running: [
    "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800",
    "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800",
    "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800",
    "https://images.unsplash.com/photo-1461897104016-0b3b00b1ea56?w=800",
    "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800",
  ],
  nutrition: [
    "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800",
    "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800",
    "https://images.unsplash.com/photo-1547592180-85f173990554?w=800",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
  ],
  strength: [
    "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800",
    "https://images.unsplash.com/photo-1581009137042-c552e485697a?w=800",
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800",
    "https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800",
    "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800",
  ],
  combat: [
    "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800",
    "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=800",
    "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=800",
    "https://images.unsplash.com/photo-1517438322307-e67111335449?w=800",
  ],
  swimming: [
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800",
    "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800",
    "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=800",
    "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800",
  ],
  cycling: [
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800",
    "https://images.unsplash.com/photo-1544191696-102dbdaeeaa0?w=800",
    "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800",
    "https://images.unsplash.com/photo-1571188654248-7a89213915f7?w=800",
  ],
  dance: [
    "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800",
    "https://images.unsplash.com/photo-1524594152303-9fd13543fe6e?w=800",
    "https://images.unsplash.com/photo-1518834107812-67b0b7c58434?w=800",
    "https://images.unsplash.com/photo-1547153760-18fc86324498?w=800",
  ],
  meditation: [
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800",
    "https://images.unsplash.com/photo-1493836512294-502baa1986e2?w=800",
    "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=800",
  ],
  outdoor: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?w=800",
    "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800",
    "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800",
  ],
  team_sports: [
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800",
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800",
    "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800",
    "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800",
  ],
  tennis: [
    "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800",
    "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800",
    "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800",
  ],
  winter: [
    "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800",
    "https://images.unsplash.com/photo-1478700485868-972b69dc3fc4?w=800",
    "https://images.unsplash.com/photo-1565992441121-4367c2967103?w=800",
  ],
  extreme: [
    "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=800",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800",
    "https://images.unsplash.com/photo-1546484396-fb3fc6f95f98?w=800",
  ],
  wellness: [
    "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800",
    "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=800",
  ],
  home: [
    "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    "https://images.unsplash.com/photo-1593352589290-7d6f7a14ba1e?w=800",
  ],
};

// ============================================
// VIDEO COLLECTIONS BY CATEGORY
// Using Pexels CDN URLs (free, no API key needed for direct links)
// ============================================

const CATEGORY_VIDEOS: Record<string, Array<{ url: string; thumbnail: string }>> = {
  fitness: [
    { url: "https://videos.pexels.com/video-files/4761434/4761434-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
    { url: "https://videos.pexels.com/video-files/4536636/4536636-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
    { url: "https://videos.pexels.com/video-files/4753987/4753987-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400" },
  ],
  yoga: [
    { url: "https://videos.pexels.com/video-files/4325459/4325459-sd_640_360_30fps.mp4", thumbnail: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
    { url: "https://videos.pexels.com/video-files/4536400/4536400-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400" },
  ],
  running: [
    { url: "https://videos.pexels.com/video-files/5319994/5319994-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400" },
    { url: "https://videos.pexels.com/video-files/4761437/4761437-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=400" },
  ],
  strength: [
    { url: "https://videos.pexels.com/video-files/4761434/4761434-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400" },
    { url: "https://videos.pexels.com/video-files/4536636/4536636-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400" },
  ],
  combat: [
    { url: "https://videos.pexels.com/video-files/4761434/4761434-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400" },
  ],
  swimming: [
    { url: "https://videos.pexels.com/video-files/4761437/4761437-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  ],
  cycling: [
    { url: "https://videos.pexels.com/video-files/5319994/5319994-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
  ],
  dance: [
    { url: "https://videos.pexels.com/video-files/4536400/4536400-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400" },
  ],
  meditation: [
    { url: "https://videos.pexels.com/video-files/4325459/4325459-sd_640_360_30fps.mp4", thumbnail: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  ],
  outdoor: [
    { url: "https://videos.pexels.com/video-files/5319994/5319994-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1551632811-561732d1e306?w=400" },
  ],
  nutrition: [
    { url: "https://videos.pexels.com/video-files/4536636/4536636-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400" },
  ],
  team_sports: [
    { url: "https://videos.pexels.com/video-files/4761434/4761434-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400" },
  ],
  tennis: [
    { url: "https://videos.pexels.com/video-files/5319994/5319994-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400" },
  ],
  winter: [
    { url: "https://videos.pexels.com/video-files/4761437/4761437-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400" },
  ],
  extreme: [
    { url: "https://videos.pexels.com/video-files/4753987/4753987-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=400" },
  ],
  wellness: [
    { url: "https://videos.pexels.com/video-files/4325459/4325459-sd_640_360_30fps.mp4", thumbnail: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400" },
  ],
  home: [
    { url: "https://videos.pexels.com/video-files/4536636/4536636-sd_640_360_25fps.mp4", thumbnail: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },
  ],
};

// ============================================
// CATEGORY DETECTION
// ============================================

function detectCategory(bio: string): string {
  const bioLower = bio.toLowerCase();

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
  if (bioLower.includes("football") || bioLower.includes("basketball") || bioLower.includes("volleyball") || bioLower.includes("team")) return "team_sports";
  if (bioLower.includes("tennis") || bioLower.includes("padel") || bioLower.includes("racket")) return "tennis";
  if (bioLower.includes("ski") || bioLower.includes("snow") || bioLower.includes("winter")) return "winter";
  if (bioLower.includes("skateboard") || bioLower.includes("parkour") || bioLower.includes("bmx") || bioLower.includes("extreme")) return "extreme";
  if (bioLower.includes("wellness") || bioLower.includes("recovery") || bioLower.includes("spa") || bioLower.includes("holistic")) return "wellness";
  if (bioLower.includes("home") || bioLower.includes("bodyweight") || bioLower.includes("online")) return "home";

  return "fitness";
}

// ============================================
// CONTENT GENERATION WITH CLAUDE API
// ============================================

async function generateCaption(botName: string, bio: string, category: string, contentType: string): Promise<string> {
  const systemPrompt = `You are ${botName}, a fitness influencer on Smuppy.
Bio: "${bio}"
Specialty: ${category}

Generate a short ${contentType === 'peak' ? 'Peak (TikTok-style short video)' : contentType} caption (max 100 characters):
- Authentic and personal
- 1-2 relevant emojis
- No hashtags
- Direct to followers

Reply with ONLY the caption text.`;

  const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

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
        max_tokens: 150,
        messages: [{ role: "user", content: `It's ${dayOfWeek}. Create a ${contentType} caption about ${category}.` }],
        system: systemPrompt,
      }),
    });

    const data = await response.json();
    if (data.content?.[0]?.text) {
      return data.content[0].text.trim();
    }
    throw new Error("Invalid API response");
  } catch (error) {
    // Fallback captions
    const fallbacks: Record<string, string[]> = {
      fitness: ["Crushing it today! 💪", "No excuses, just results 🔥"],
      yoga: ["Find your flow 🧘", "Breathe and believe ✨"],
      running: ["Miles and smiles 🏃", "Run your own race 💨"],
      nutrition: ["Fuel your body right 🥗", "Eat clean, train mean 💪"],
      strength: ["Lift heavy, stay humble 🏋️", "Stronger every day 💪"],
      combat: ["Train hard, fight easy 🥊", "Warrior mindset 🔥"],
      swimming: ["Making waves 🏊", "Dive into greatness 🌊"],
      cycling: ["Pedal power! 🚴", "Life behind bars 🔥"],
      dance: ["Move your body! 💃", "Dance it out 🎶"],
      meditation: ["Inner peace 🧘", "Mindful moments ✨"],
      outdoor: ["Adventure awaits 🏔️", "Nature is my gym 🌲"],
      team_sports: ["Team work! 🏀", "Together we win 🏆"],
      tennis: ["Game on! 🎾", "Love this game ❤️"],
      winter: ["Snow vibes ❄️", "Shredding it 🏂"],
      extreme: ["No limits! 🛹", "Live on the edge 🔥"],
      wellness: ["Self-care Sunday 🧖", "Glow from within ✨"],
      home: ["Home workout done! 🏠", "No gym? No problem! 💪"],
    };
    const options = fallbacks[category] || fallbacks.fitness;
    return options[Math.floor(Math.random() * options.length)];
  }
}

// ============================================
// CONTENT TYPE SELECTOR
// ============================================

type ContentType = "photo" | "video" | "peak";

function selectContentType(): ContentType {
  const rand = Math.random();
  if (rand < PHOTO_RATIO) return "photo";
  if (rand < PHOTO_RATIO + VIDEO_RATIO) return "video";
  return "peak";
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all verified bot profiles
    const { data: bots, error: botsError } = await supabase
      .from("profiles")
      .select("id, username, full_name, bio")
      .eq("is_verified", true);

    if (botsError) throw botsError;
    if (!bots || bots.length === 0) {
      return new Response(JSON.stringify({ error: "No bot profiles found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`Generating content for ${bots.length} profiles...`);

    const results = {
      posts: { success: 0, failed: 0 },
      videos: { success: 0, failed: 0 },
      peaks: { success: 0, failed: 0 },
    };

    // Generate content for each bot
    for (const bot of bots) {
      // Determine content type BEFORE try block so it's accessible in catch
      const contentType = selectContentType();

      try {
        const category = detectCategory(bot.bio || "fitness");
        const caption = await generateCaption(
          bot.full_name || bot.username,
          bot.bio || "Fitness enthusiast",
          category,
          contentType
        );

        if (contentType === "photo") {
          // Create photo post
          const photos = CATEGORY_PHOTOS[category] || CATEGORY_PHOTOS.fitness;
          const photoUrl = photos[Math.floor(Math.random() * photos.length)];

          const { error } = await supabase.from("posts").insert({
            author_id: bot.id,
            media_url: photoUrl,
            media_type: "photo",
            caption: caption,
            visibility: "public",
            likes_count: Math.floor(Math.random() * 200) + 20,
            comments_count: Math.floor(Math.random() * 15) + 2,
          });

          if (error) throw error;
          results.posts.success++;

        } else if (contentType === "video") {
          // Create video post
          const videos = CATEGORY_VIDEOS[category] || CATEGORY_VIDEOS.fitness;
          const video = videos[Math.floor(Math.random() * videos.length)];

          const { error } = await supabase.from("posts").insert({
            author_id: bot.id,
            media_url: video.thumbnail, // Use thumbnail as preview
            media_type: "video",
            caption: caption,
            visibility: "public",
            likes_count: Math.floor(Math.random() * 300) + 50,
            comments_count: Math.floor(Math.random() * 25) + 5,
          });

          if (error) throw error;
          results.videos.success++;

        } else if (contentType === "peak") {
          // Create Peak (short video)
          const videos = CATEGORY_VIDEOS[category] || CATEGORY_VIDEOS.fitness;
          const video = videos[Math.floor(Math.random() * videos.length)];

          const { error } = await supabase.from("peaks").insert({
            author_id: bot.id,
            video_url: video.url,
            thumbnail_url: video.thumbnail,
            caption: caption,
            likes_count: Math.floor(Math.random() * 500) + 100,
            comments_count: Math.floor(Math.random() * 30) + 5,
            views_count: Math.floor(Math.random() * 2000) + 500,
          });

          if (error) throw error;
          results.peaks.success++;
        }

        console.log(`Created ${contentType} for ${bot.username}`);

      } catch (botError) {
        console.error(`Error for ${bot.username}:`, botError);
        // Use the contentType determined before the try block
        if (contentType === "photo") results.posts.failed++;
        else if (contentType === "video") results.videos.failed++;
        else results.peaks.failed++;
      }
    }

    const totalSuccess = results.posts.success + results.videos.success + results.peaks.success;
    const totalFailed = results.posts.failed + results.videos.failed + results.peaks.failed;

    return new Response(
      JSON.stringify({
        message: "Content generation complete",
        summary: {
          total: { success: totalSuccess, failed: totalFailed },
          photos: results.posts,
          videos: results.videos,
          peaks: results.peaks,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Error in generate-bot-content:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
