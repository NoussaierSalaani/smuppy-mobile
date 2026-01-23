#!/usr/bin/env node

/**
 * Sync all profiles - Creates profiles for auth users that don't have one
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// Account definitions with bios
const ACCOUNT_BIOS = {
  "recovery.sam@smuppy.pro": { username: "RecoverySam", full_name: "Sam Brooks", bio: "Licensed Massage Therapist | Recovery & Stretching Coach | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400" },
  "performance.kai@smuppy.pro": { username: "PerformanceKai", full_name: "Kai Nakamura", bio: "CSCS Certified | Speed & Agility Coach | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
  "online.sarah@smuppy.pro": { username: "OnlineSarahPro", full_name: "Sarah Digital", bio: "Online Fitness Expert | Virtual Training | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1593352589290-7d6f7a14ba1e?w=400" },
  "lifestyle.jordan@smuppy.pro": { username: "LifestyleJordan", full_name: "Jordan Hayes", bio: "Habit Coach | Goal Setting Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400" },
  "combatfit.rico@smuppy.pro": { username: "CombatFitRico", full_name: "Rico Fernandez", bio: "Cardio Boxing Specialist | Combat Conditioning | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517438322307-e67111335449?w=400" },
  "aqua.marina@smuppy.pro": { username: "AquaMarina", full_name: "Marina Costa", bio: "ASCA Level 3 Swim Coach | Pool Fitness | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  "flex.luna@smuppy.pro": { username: "FlexLuna", full_name: "Luna Park", bio: "Flexibility Coach | Contortion Artist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400" },
  "corporate.ben@smuppy.pro": { username: "CorporateBen", full_name: "Benjamin Wright", bio: "Corporate Wellness Consultant | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400" },
  "holistic.aria@smuppy.pro": { username: "HolisticAria", full_name: "Aria Moon", bio: "Holistic Health Practitioner | Ayurveda | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
  "taichi.wei@smuppy.pro": { username: "TaiChiWeiPro", full_name: "Master Wei Lin", bio: "Tai Chi & Qigong Master | 30+ years | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  "weightloss.nina@smuppy.pro": { username: "WeightLossNina", full_name: "Nina Rodriguez", bio: "Weight Loss Specialist | Body Composition Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400" },
  "extreme.zack@smuppy.pro": { username: "ExtremeZack", full_name: "Zack Rider", bio: "Pro Skateboarder & Parkour Athlete | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=400" },
  "sunrise.bootcamp@smuppy.biz": { username: "SunriseBootcamp", full_name: "Sunrise Bootcamp", bio: "Outdoor group fitness | High energy workouts | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
  "core.pilates@smuppy.biz": { username: "CorePilatesStudio", full_name: "Core Pilates Studio", bio: "Mat & Reformer Pilates | Small group classes | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },
  "mindful.meditation@smuppy.biz": { username: "MindfulCenter", full_name: "Mindful Meditation Center", bio: "Guided meditation sessions | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  "ace.tennis@smuppy.biz": { username: "AceTennisClub", full_name: "Ace Tennis Club", bio: "Indoor & outdoor courts | All levels | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400" },
  "summit.climbing@smuppy.biz": { username: "SummitClimbingGym", full_name: "Summit Climbing Gym", bio: "Indoor climbing walls | Bouldering | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400" },
  "stride.running@smuppy.biz": { username: "StrideRunningClub", full_name: "Stride Running Club", bio: "Group runs & coaching | 5K to marathon | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400" },
  "burn.hiit@smuppy.biz": { username: "BurnHIITStudio", full_name: "Burn HIIT Studio", bio: "High-intensity interval training | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
  "splash.swim@smuppy.biz": { username: "SplashSwimSchool", full_name: "Splash Swim School", bio: "Swim lessons for all ages | Water safety | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  "nourish.nutrition@smuppy.biz": { username: "NourishNutritionCenter", full_name: "Nourish Nutrition Center", bio: "Nutrition counseling | Meal planning | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400" },
  "fairway.golf@smuppy.biz": { username: "FairwayGolfClub", full_name: "Fairway Golf Club", bio: "18-hole championship course | Pro shop | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=400" },
  "spin.cycle@smuppy.biz": { username: "SpinCycleStudio", full_name: "Spin Cycle Studio", bio: "Indoor cycling classes | Immersive experience | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
  "octagon.mma@smuppy.biz": { username: "OctagonMMA", full_name: "Octagon MMA Academy", bio: "Mixed martial arts training | BJJ, Muay Thai | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=400" },
};

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
  console.log('SYNCING ALL PROFILES');
  console.log('===========================================\n');

  // 1. Get all auth users
  console.log('Fetching auth users...');
  const usersResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  });
  const usersData = await usersResponse.json();
  const authUsers = usersData.users || [];
  console.log(`Found ${authUsers.length} auth users\n`);

  // 2. Get all existing profiles
  const profiles = await apiCall('/rest/v1/profiles?select=id', 'GET');
  const existingProfileIds = new Set((profiles || []).map(p => p.id));
  console.log(`Found ${existingProfileIds.size} existing profiles\n`);

  // 3. Find users without profiles
  const usersWithoutProfiles = authUsers.filter(u => !existingProfileIds.has(u.id));
  console.log(`Users without profiles: ${usersWithoutProfiles.length}\n`);

  // 4. Create missing profiles
  let created = 0;
  const newProfileIds = [];

  for (const user of usersWithoutProfiles) {
    const accountInfo = ACCOUNT_BIOS[user.email];

    if (!accountInfo) {
      console.log(`  ${user.email}: No account info, skipping`);
      continue;
    }

    process.stdout.write(`  ${accountInfo.username}... `);

    try {
      const result = await apiCall('/rest/v1/profiles', 'POST', {
        id: user.id,
        username: accountInfo.username,
        full_name: accountInfo.full_name,
        bio: accountInfo.bio,
        avatar_url: accountInfo.avatar_url,
        account_type: 'personal',
        is_verified: true
      });

      if (result && !result.error && !result.code) {
        console.log('OK');
        created++;
        newProfileIds.push(user.id);
      } else {
        console.log('FAILED:', JSON.stringify(result).substring(0, 80));
      }
    } catch (error) {
      console.log('ERROR:', error.message);
    }
  }

  // 5. Create posts for new profiles
  console.log('\nCreating posts for new profiles...');
  let postCount = 0;

  const posts = [
    { media_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800", caption: "New week, new goals! Who is ready?" },
    { media_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800", caption: "Consistency is key. Keep showing up!" },
    { media_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800", caption: "Your only competition is yesterday's you." },
  ];

  for (const id of newProfileIds) {
    for (const post of posts) {
      try {
        await apiCall('/rest/v1/posts', 'POST', {
          author_id: id,
          media_url: post.media_url,
          media_type: 'photo',
          caption: post.caption,
          visibility: 'public',
          likes_count: Math.floor(Math.random() * 300) + 50,
          comments_count: Math.floor(Math.random() * 25) + 5
        });
        postCount++;
      } catch (e) {}
    }
  }

  console.log('\n===========================================');
  console.log(`Profiles created: ${created}`);
  console.log(`Posts created: ${postCount}`);
  console.log('===========================================');

  // 6. Final count
  const finalProfiles = await apiCall('/rest/v1/profiles?select=id', 'GET');
  const finalPosts = await apiCall('/rest/v1/posts?select=id', 'GET');

  console.log('\nFINAL TOTALS:');
  console.log(`  Profiles: ${finalProfiles.length}`);
  console.log(`  Posts: ${finalPosts.length}`);
}

main().catch(console.error);
