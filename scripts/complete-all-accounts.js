#!/usr/bin/env node

/**
 * Complete all Pro accounts - Creates remaining Pro Creator and Pro Business accounts
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// Remaining Pro Creators (12 more to complete 24 total)
const REMAINING_CREATORS = [
  { email: "recovery.sam@smuppy.pro", username: "RecoverySam", full_name: "Sam Brooks", bio: "Licensed Massage Therapist | Recovery & Stretching Coach | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400" },
  { email: "performance.kai@smuppy.pro", username: "PerformanceKai", full_name: "Kai Nakamura", bio: "CSCS Certified | Speed & Agility Coach | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
  { email: "online.sarah@smuppy.pro", username: "OnlineSarahPro", full_name: "Sarah Digital", bio: "Online Fitness Expert | Virtual Training & Program Design | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1593352589290-7d6f7a14ba1e?w=400" },
  { email: "lifestyle.jordan@smuppy.pro", username: "LifestyleJordan", full_name: "Jordan Hayes", bio: "Habit Coach | Goal Setting Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400" },
  { email: "combatfit.rico@smuppy.pro", username: "CombatFitRico", full_name: "Rico Fernandez", bio: "Cardio Boxing Specialist | Combat Conditioning Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517438322307-e67111335449?w=400" },
  { email: "aqua.marina@smuppy.pro", username: "AquaMarina", full_name: "Marina Costa", bio: "ASCA Level 3 Swim Coach | Pool Fitness Instructor | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  { email: "flex.luna@smuppy.pro", username: "FlexLuna", full_name: "Luna Park", bio: "Flexibility Coach | Contortion Artist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400" },
  { email: "corporate.ben@smuppy.pro", username: "CorporateBen", full_name: "Benjamin Wright", bio: "Corporate Wellness Consultant | Office Fitness Programs | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400" },
  { email: "holistic.aria@smuppy.pro", username: "HolisticAria", full_name: "Aria Moon", bio: "Holistic Health Practitioner | Ayurveda & Energy Healing | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
  { email: "taichi.wei@smuppy.pro", username: "TaiChiWeiPro", full_name: "Master Wei Lin", bio: "Tai Chi & Qigong Master | 30+ years experience | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  { email: "weightloss.nina@smuppy.pro", username: "WeightLossNina", full_name: "Nina Rodriguez", bio: "Weight Loss Specialist | Body Composition Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400" },
  { email: "extreme.zack@smuppy.pro", username: "ExtremeZack", full_name: "Zack Rider", bio: "Pro Skateboarder & Parkour Athlete | Obstacle Course Racing | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=400" },
];

// Remaining Pro Businesses (12 more to complete 22 total)
const REMAINING_BUSINESSES = [
  { email: "sunrise.bootcamp@smuppy.biz", username: "SunriseBootcamp", full_name: "Sunrise Bootcamp", bio: "Outdoor group fitness | High energy workouts | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
  { email: "core.pilates@smuppy.biz", username: "CorePilatesStudio", full_name: "Core Pilates Studio", bio: "Mat & Reformer Pilates | Small group classes | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },
  { email: "mindful.meditation@smuppy.biz", username: "MindfulCenter", full_name: "Mindful Meditation Center", bio: "Guided meditation sessions | Mindfulness workshops | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  { email: "ace.tennis@smuppy.biz", username: "AceTennisClub", full_name: "Ace Tennis Club", bio: "Indoor & outdoor courts | Lessons for all levels | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400" },
  { email: "summit.climbing@smuppy.biz", username: "SummitClimbingGym", full_name: "Summit Climbing Gym", bio: "Indoor climbing walls | Bouldering & rope climbing | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400" },
  { email: "stride.running@smuppy.biz", username: "StrideRunningClub", full_name: "Stride Running Club", bio: "Group runs & coaching | 5K to marathon prep | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400" },
  { email: "burn.hiit@smuppy.biz", username: "BurnHIITStudio", full_name: "Burn HIIT Studio", bio: "High-intensity interval training | 45-minute classes | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
  { email: "splash.swim@smuppy.biz", username: "SplashSwimSchool", full_name: "Splash Swim School", bio: "Swim lessons for all ages | Water safety | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  { email: "nourish.nutrition@smuppy.biz", username: "NourishNutritionCenter", full_name: "Nourish Nutrition Center", bio: "Nutrition counseling | Meal planning | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400" },
  { email: "fairway.golf@smuppy.biz", username: "FairwayGolfClub", full_name: "Fairway Golf Club", bio: "18-hole championship course | Pro shop & lessons | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=400" },
  { email: "spin.cycle@smuppy.biz", username: "SpinCycleStudio", full_name: "Spin Cycle Studio", bio: "Indoor cycling classes | Immersive ride experience | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
  { email: "octagon.mma@smuppy.biz", username: "OctagonMMA", full_name: "Octagon MMA Academy", bio: "Mixed martial arts training | BJJ, Muay Thai, Wrestling | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=400" },
];

const ALL_ACCOUNTS = [...REMAINING_CREATORS, ...REMAINING_BUSINESSES];

// Posts for new accounts
const POSTS = [
  { media_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800", caption: "New week, new goals! Who is ready to crush it?" },
  { media_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800", caption: "Consistency is the key to success. Keep showing up!" },
  { media_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800", caption: "Your only competition is who you were yesterday." },
];

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
  console.log('COMPLETING ALL PRO ACCOUNTS');
  console.log('===========================================\n');

  const createdAccounts = [];

  for (const account of ALL_ACCOUNTS) {
    process.stdout.write(`${account.username}... `);

    try {
      // 1. Create auth user
      const authResult = await apiCall('/auth/v1/admin/users', 'POST', {
        email: account.email,
        password: 'SmuppyPro2026!',
        email_confirm: true,
        user_metadata: {
          username: account.username,
          full_name: account.full_name
        }
      });

      let userId = authResult?.id;

      if (!userId && authResult?.code === 422) {
        console.log('(user exists)');
        continue;
      }

      if (!userId) {
        console.log('FAILED');
        continue;
      }

      // 2. Create profile
      const profileResult = await apiCall('/rest/v1/profiles', 'POST', {
        id: userId,
        username: account.username,
        full_name: account.full_name,
        bio: account.bio,
        avatar_url: account.avatar_url,
        account_type: 'personal',
        is_verified: true
      });

      if (profileResult && !profileResult.error) {
        console.log('OK');
        createdAccounts.push({ id: userId, username: account.username });
      } else {
        console.log('Profile error');
      }

    } catch (error) {
      console.log('ERROR');
    }
  }

  // Create posts for new accounts
  console.log('\nCreating posts...');
  let postCount = 0;

  for (const account of createdAccounts) {
    for (const post of POSTS) {
      try {
        await apiCall('/rest/v1/posts', 'POST', {
          author_id: account.id,
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

  console.log(`\nCreated ${createdAccounts.length} accounts and ${postCount} posts`);
  console.log('===========================================');
}

main().catch(console.error);
