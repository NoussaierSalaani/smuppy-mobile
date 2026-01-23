#!/usr/bin/env node

/**
 * ===========================================
 * SMUPPY PRO ACCOUNTS SEEDING SCRIPT
 * Creates Pro Creator and Pro Business accounts
 * ===========================================
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// ============================================
// PRO CREATOR PROFILES - 24 (one per expertise category)
// ============================================

const PRO_CREATORS = [
  // Personal Training
  {
    email: "coach.marcus@smuppy.pro",
    username: "CoachMarcus",
    full_name: "Marcus Williams",
    bio: "NASM Certified Personal Trainer | Weight Loss & Muscle Building Specialist | 500+ transformations",
    avatar_url: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=400",
    expertise: ["General Fitness", "Weight Loss", "Muscle Building", "Strength Training"],
    category: "Personal Training"
  },
  // Yoga & Pilates
  {
    email: "yogi.priya@smuppy.pro",
    username: "YogiPriya",
    full_name: "Priya Sharma",
    bio: "RYT-500 Yoga Teacher | Vinyasa & Yin Specialist | Mindful movement for all levels",
    avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
    expertise: ["Hatha Yoga", "Vinyasa Flow", "Yin Yoga", "Prenatal Yoga"],
    category: "Yoga & Pilates"
  },
  // Nutrition & Diet
  {
    email: "nutritionist.anna@smuppy.pro",
    username: "NutritionistAnna",
    full_name: "Dr. Anna Martinez",
    bio: "Registered Dietitian | Sports Nutrition Expert | Meal Planning & Macro Coaching",
    avatar_url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400",
    expertise: ["Sports Nutrition", "Meal Planning", "Weight Management", "Macro Coaching"],
    category: "Nutrition & Diet"
  },
  // Group Fitness
  {
    email: "hiit.jason@smuppy.pro",
    username: "HIITJason",
    full_name: "Jason Clarke",
    bio: "Les Mills Certified | HIIT & Bootcamp Instructor | High energy group classes",
    avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    expertise: ["HIIT Classes", "Bootcamp", "Circuit Training", "CrossFit"],
    category: "Group Fitness"
  },
  // Combat Sports
  {
    email: "fighter.diego@smuppy.pro",
    username: "FighterDiego",
    full_name: "Diego Santos",
    bio: "Pro MMA Fighter | Boxing & BJJ Coach | Train like a champion",
    avatar_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400",
    expertise: ["Boxing", "MMA", "BJJ/Jiu-Jitsu", "Kickboxing"],
    category: "Combat Sports"
  },
  // Mind & Wellness
  {
    email: "mindcoach.elena@smuppy.pro",
    username: "MindCoachElena",
    full_name: "Elena Volkov",
    bio: "Certified Life Coach | Meditation & Breathwork Guide | Mental Performance Expert",
    avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400",
    expertise: ["Meditation", "Breathwork", "Stress Management", "Mental Performance"],
    category: "Mind & Wellness"
  },
  // Sports Coaching
  {
    email: "coach.thompson@smuppy.pro",
    username: "CoachThompson",
    full_name: "David Thompson",
    bio: "UEFA Licensed Coach | Football & Basketball Training | Youth to Pro level",
    avatar_url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400",
    expertise: ["Football Coach", "Basketball Coach", "Running Coach", "Triathlon Coach"],
    category: "Sports Coaching"
  },
  // Rehabilitation
  {
    email: "physio.claire@smuppy.pro",
    username: "PhysioClaire",
    full_name: "Dr. Claire Bennett",
    bio: "Doctor of Physical Therapy | Sports Injury Specialist | Return to play protocols",
    avatar_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400",
    expertise: ["Physical Therapy", "Sports Injury", "Post-Surgery Rehab", "Injury Prevention"],
    category: "Rehabilitation"
  },
  // Dance & Movement
  {
    email: "dancer.maya@smuppy.pro",
    username: "DancerMaya",
    full_name: "Maya Johnson",
    bio: "Professional Dancer | Hip Hop, Contemporary & Latin | Movement is expression",
    avatar_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400",
    expertise: ["Hip Hop", "Contemporary", "Latin Dance", "Zumba"],
    category: "Dance & Movement"
  },
  // Outdoor & Adventure
  {
    email: "adventure.alex@smuppy.pro",
    username: "AdventureAlex",
    full_name: "Alex Rivers",
    bio: "AMGA Certified Guide | Rock Climbing & Hiking Expert | Outdoor fitness specialist",
    avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400",
    expertise: ["Hiking Guide", "Rock Climbing", "Trail Running", "Outdoor Fitness"],
    category: "Outdoor & Adventure"
  },
  // Specialized Populations
  {
    email: "specialist.ruth@smuppy.pro",
    username: "SpecialistRuth",
    full_name: "Ruth Anderson",
    bio: "ACE Senior Fitness Specialist | Pre/Postnatal Certified | Adaptive fitness expert",
    avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400",
    expertise: ["Senior Fitness", "Pre/Postnatal", "Youth/Kids", "Beginners"],
    category: "Specialized Populations"
  },
  // Functional Training
  {
    email: "functional.mike@smuppy.pro",
    username: "FunctionalMike",
    full_name: "Mike Chen",
    bio: "FMS Certified | Mobility & Movement Specialist | Fix your movement patterns",
    avatar_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400",
    expertise: ["Functional Movement", "Mobility Work", "Kettlebells", "TRX/Suspension"],
    category: "Functional Training"
  },
  // Wellness Services
  {
    email: "recovery.sam@smuppy.pro",
    username: "RecoverySam",
    full_name: "Sam Brooks",
    bio: "Licensed Massage Therapist | Recovery & Stretching Coach | Optimize your recovery",
    avatar_url: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400",
    expertise: ["Massage Therapy", "Recovery Specialist", "Stretching Coach", "Foam Rolling"],
    category: "Wellness Services"
  },
  // Performance
  {
    email: "performance.kai@smuppy.pro",
    username: "PerformanceKai",
    full_name: "Kai Nakamura",
    bio: "CSCS Certified | Speed & Agility Coach | Train elite athletes",
    avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400",
    expertise: ["Speed Training", "Agility", "Power Training", "Sport-Specific"],
    category: "Performance"
  },
  // Online Coaching
  {
    email: "online.sarah@smuppy.pro",
    username: "OnlineSarah",
    full_name: "Sarah Digital",
    bio: "Online Fitness Expert | Virtual Training & Program Design | Train from anywhere",
    avatar_url: "https://images.unsplash.com/photo-1593352589290-7d6f7a14ba1e?w=400",
    expertise: ["Virtual Training", "Program Design", "Online Classes", "App-Based Coaching"],
    category: "Online Coaching"
  },
  // Lifestyle & Habits
  {
    email: "lifestyle.jordan@smuppy.pro",
    username: "LifestyleJordan",
    full_name: "Jordan Hayes",
    bio: "Habit Coach | Goal Setting Expert | Transform your lifestyle, transform your life",
    avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400",
    expertise: ["Habit Coaching", "Goal Setting", "Motivation", "Work-Life Balance"],
    category: "Lifestyle & Habits"
  },
  // Combat Fitness
  {
    email: "combatfit.rico@smuppy.pro",
    username: "CombatFitRico",
    full_name: "Rico Fernandez",
    bio: "Cardio Boxing Specialist | Combat Conditioning Expert | Fight your way to fitness",
    avatar_url: "https://images.unsplash.com/photo-1517438322307-e67111335449?w=400",
    expertise: ["Cardio Boxing", "Martial Arts Fitness", "Self-Defense", "Combat Conditioning"],
    category: "Combat Fitness"
  },
  // Aquatic Sports
  {
    email: "aqua.marina@smuppy.pro",
    username: "AquaMarina",
    full_name: "Marina Costa",
    bio: "ASCA Level 3 Swim Coach | Pool Fitness Instructor | Make a splash with your fitness",
    avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400",
    expertise: ["Swim Coaching", "Pool Fitness", "Water Sports", "Aqua Fitness"],
    category: "Aquatic Sports"
  },
  // Stretching & Flexibility
  {
    email: "flex.luna@smuppy.pro",
    username: "FlexLuna",
    full_name: "Luna Park",
    bio: "Flexibility Coach | Contortion Artist | Unlock your body's full range of motion",
    avatar_url: "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?w=400",
    expertise: ["Static Stretching", "Dynamic Stretching", "Splits Training", "Mobility Work"],
    category: "Stretching & Flexibility"
  },
  // Corporate Wellness
  {
    email: "corporate.ben@smuppy.pro",
    username: "CorporateBen",
    full_name: "Benjamin Wright",
    bio: "Corporate Wellness Consultant | Office Fitness Programs | Healthy workplace solutions",
    avatar_url: "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400",
    expertise: ["Corporate Wellness", "Office Fitness", "Team Building", "Stress Workshops"],
    category: "Corporate Wellness"
  },
  // Holistic Health
  {
    email: "holistic.aria@smuppy.pro",
    username: "HolisticAria",
    full_name: "Aria Moon",
    bio: "Holistic Health Practitioner | Ayurveda & Energy Healing | Mind, body, spirit wellness",
    avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
    expertise: ["Holistic Health", "Ayurveda", "Energy Healing", "Aromatherapy"],
    category: "Holistic Health"
  },
  // Mind-Body Integration
  {
    email: "taichi.wei@smuppy.pro",
    username: "TaiChiWei",
    full_name: "Master Wei Lin",
    bio: "Tai Chi & Qigong Master | 30+ years experience | Ancient wisdom for modern wellness",
    avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400",
    expertise: ["Tai Chi", "Qigong", "Somatic Movement", "Body Awareness"],
    category: "Mind-Body Integration"
  },
  // Weight Management
  {
    email: "weightloss.nina@smuppy.pro",
    username: "WeightLossNina",
    full_name: "Nina Rodriguez",
    bio: "Weight Loss Specialist | Body Composition Expert | Sustainable results that last",
    avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400",
    expertise: ["Fat Loss Specialist", "Metabolism Coach", "Body Composition", "Macro Coaching"],
    category: "Weight Management"
  },
  // Extreme Sports
  {
    email: "extreme.zack@smuppy.pro",
    username: "ExtremeZack",
    full_name: "Zack Rider",
    bio: "Pro Skateboarder & Parkour Athlete | Obstacle Course Racing | Push your limits",
    avatar_url: "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=400",
    expertise: ["Parkour", "Skateboarding", "Obstacle Course", "Adventure Racing"],
    category: "Extreme Sports"
  },
];

// ============================================
// PRO BUSINESS PROFILES - 22 (one per business category)
// ============================================

const PRO_BUSINESSES = [
  {
    email: "ironforge.gym@smuppy.biz",
    username: "IronForgeGym",
    full_name: "Iron Forge Fitness",
    bio: "Premium fitness facility | State-of-the-art equipment | Personal training available",
    avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    category: "gym",
    locations: "single"
  },
  {
    email: "serenity.yoga@smuppy.biz",
    username: "SerenityYogaStudio",
    full_name: "Serenity Yoga Studio",
    bio: "Peaceful yoga sanctuary | All levels welcome | Hatha, Vinyasa, Yin & more",
    avatar_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400",
    category: "yoga_studio",
    locations: "single"
  },
  {
    email: "crossfit.forge@smuppy.biz",
    username: "CrossFitForge",
    full_name: "CrossFit Forge",
    bio: "Official CrossFit Affiliate | WODs daily | Build strength, build community",
    avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    category: "crossfit",
    locations: "single"
  },
  {
    email: "aqua.center@smuppy.biz",
    username: "AquaFitnessCenter",
    full_name: "Aqua Fitness Center",
    bio: "Olympic-size pool | Swim lessons & aqua aerobics | Dive into fitness",
    avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400",
    category: "pool",
    locations: "single"
  },
  {
    email: "warriors.dojo@smuppy.biz",
    username: "WarriorsDojo",
    full_name: "Warriors Martial Arts",
    bio: "Traditional & modern martial arts | Karate, Judo, MMA | All ages welcome",
    avatar_url: "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400",
    category: "martial_arts",
    locations: "single"
  },
  {
    email: "rhythm.dance@smuppy.biz",
    username: "RhythmDanceStudio",
    full_name: "Rhythm Dance Studio",
    bio: "Dance classes for all styles | Hip hop, salsa, contemporary | Express yourself",
    avatar_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400",
    category: "dance_studio",
    locations: "single"
  },
  {
    email: "zen.wellness@smuppy.biz",
    username: "ZenWellnessSpa",
    full_name: "Zen Wellness & Spa",
    bio: "Holistic wellness center | Massage, sauna, relaxation | Rejuvenate your body",
    avatar_url: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400",
    category: "wellness_spa",
    locations: "single"
  },
  {
    email: "champions.club@smuppy.biz",
    username: "ChampionsSportsClub",
    full_name: "Champions Sports Club",
    bio: "Multi-sport facility | Tennis, basketball, swimming | Join the champions",
    avatar_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400",
    category: "sports_club",
    locations: "multiple"
  },
  {
    email: "elite.pt@smuppy.biz",
    username: "ElitePTStudio",
    full_name: "Elite Personal Training",
    bio: "Private training studio | 1-on-1 coaching | Results guaranteed",
    avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400",
    category: "personal_training",
    locations: "single"
  },
  {
    email: "sunrise.bootcamp@smuppy.biz",
    username: "SunriseBootcamp",
    full_name: "Sunrise Bootcamp",
    bio: "Outdoor group fitness | High energy workouts | Rain or shine, we train",
    avatar_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400",
    category: "bootcamp",
    locations: "multiple"
  },
  {
    email: "core.pilates@smuppy.biz",
    username: "CorePilatesStudio",
    full_name: "Core Pilates Studio",
    bio: "Mat & Reformer Pilates | Small group classes | Strengthen your core",
    avatar_url: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400",
    category: "pilates",
    locations: "single"
  },
  {
    email: "mindful.meditation@smuppy.biz",
    username: "MindfulCenter",
    full_name: "Mindful Meditation Center",
    bio: "Guided meditation sessions | Mindfulness workshops | Find your inner peace",
    avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400",
    category: "meditation",
    locations: "single"
  },
  {
    email: "ace.tennis@smuppy.biz",
    username: "AceTennisClub",
    full_name: "Ace Tennis Club",
    bio: "Indoor & outdoor courts | Lessons for all levels | Serve up your best game",
    avatar_url: "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400",
    category: "tennis",
    locations: "single"
  },
  {
    email: "summit.climbing@smuppy.biz",
    username: "SummitClimbingGym",
    full_name: "Summit Climbing Gym",
    bio: "Indoor climbing walls | Bouldering & rope climbing | Reach new heights",
    avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400",
    category: "climbing",
    locations: "single"
  },
  {
    email: "knockout.boxing@smuppy.biz",
    username: "KnockoutBoxingGym",
    full_name: "Knockout Boxing Gym",
    bio: "Boxing classes & training | Cardio boxing | Train like a fighter",
    avatar_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400",
    category: "boxing",
    locations: "single"
  },
  {
    email: "stride.running@smuppy.biz",
    username: "StrideRunningClub",
    full_name: "Stride Running Club",
    bio: "Group runs & coaching | 5K to marathon prep | Run together, achieve together",
    avatar_url: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400",
    category: "running_club",
    locations: "multiple"
  },
  {
    email: "burn.hiit@smuppy.biz",
    username: "BurnHIITStudio",
    full_name: "Burn HIIT Studio",
    bio: "High-intensity interval training | 45-minute classes | Maximum burn",
    avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400",
    category: "hiit_studio",
    locations: "multiple"
  },
  {
    email: "splash.swim@smuppy.biz",
    username: "SplashSwimSchool",
    full_name: "Splash Swim School",
    bio: "Swim lessons for all ages | Water safety | Learn to swim with confidence",
    avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400",
    category: "swim_school",
    locations: "multiple"
  },
  {
    email: "nourish.nutrition@smuppy.biz",
    username: "NourishNutritionCenter",
    full_name: "Nourish Nutrition Center",
    bio: "Nutrition counseling | Meal planning | Fuel your body right",
    avatar_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400",
    category: "nutrition",
    locations: "single"
  },
  {
    email: "fairway.golf@smuppy.biz",
    username: "FairwayGolfClub",
    full_name: "Fairway Golf Club",
    bio: "18-hole championship course | Pro shop & lessons | Perfect your swing",
    avatar_url: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=400",
    category: "golf",
    locations: "single"
  },
  {
    email: "spin.cycle@smuppy.biz",
    username: "SpinCycleStudio",
    full_name: "Spin Cycle Studio",
    bio: "Indoor cycling classes | Immersive ride experience | Pedal to the beat",
    avatar_url: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400",
    category: "cycling",
    locations: "multiple"
  },
  {
    email: "octagon.mma@smuppy.biz",
    username: "OctagonMMA",
    full_name: "Octagon MMA Academy",
    bio: "Mixed martial arts training | BJJ, Muay Thai, Wrestling | Train like a fighter",
    avatar_url: "https://images.unsplash.com/photo-1564415315949-7a0c4c73aab4?w=400",
    category: "mma",
    locations: "single"
  },
];

// ============================================
// SAMPLE POSTS FOR PRO ACCOUNTS
// ============================================

const PRO_POSTS = {
  creator: [
    { media_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800", caption: "New week, new goals! Who's ready to crush it? Book your session now" },
    { media_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800", caption: "Transformation Tuesday! So proud of my client's progress" },
    { media_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=800", caption: "Group class was fire today! Thanks everyone for bringing the energy" },
  ],
  business: [
    { media_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800", caption: "New equipment just arrived! Come check it out" },
    { media_url: "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800", caption: "Special offer this month! First class free for new members" },
    { media_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800", caption: "Our community is growing! Thank you for being part of our fitness family" },
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  console.log('===========================================');
  console.log('SMUPPY PRO ACCOUNTS SEEDING SCRIPT');
  console.log('===========================================\n');

  const createdAccounts = [];

  // ========== CREATE PRO CREATORS ==========
  console.log(`Creating ${PRO_CREATORS.length} Pro Creator accounts...\n`);

  for (const creator of PRO_CREATORS) {
    process.stdout.write(`  ${creator.username}... `);

    try {
      // 1. Create auth user
      const authResult = await apiCall('/auth/v1/admin/users', 'POST', {
        email: creator.email,
        password: 'SmuppyPro2026!',
        email_confirm: true,
        user_metadata: {
          username: creator.username,
          full_name: creator.full_name
        }
      });

      const userId = authResult?.id;

      if (!userId) {
        if (authResult?.message?.includes('already') || authResult?.code === 422) {
          console.log('(exists)');
          continue;
        }
        console.log(`FAILED`);
        continue;
      }

      // 2. Create profile with pro_creator account type
      const profileResult = await apiCall('/rest/v1/profiles', 'POST', {
        id: userId,
        username: creator.username,
        full_name: creator.full_name,
        bio: creator.bio,
        avatar_url: creator.avatar_url,
        account_type: 'pro_creator',
        is_verified: true
      });

      if (profileResult && !profileResult.error) {
        console.log(`OK`);
        createdAccounts.push({ id: userId, type: 'creator', username: creator.username });
      } else {
        console.log(`Profile error`);
      }

    } catch (error) {
      console.log(`ERROR: ${error.message}`);
    }
  }

  // ========== CREATE PRO BUSINESSES ==========
  console.log(`\nCreating ${PRO_BUSINESSES.length} Pro Business accounts...\n`);

  for (const business of PRO_BUSINESSES) {
    process.stdout.write(`  ${business.username}... `);

    try {
      // 1. Create auth user
      const authResult = await apiCall('/auth/v1/admin/users', 'POST', {
        email: business.email,
        password: 'SmuppyBiz2026!',
        email_confirm: true,
        user_metadata: {
          username: business.username,
          full_name: business.full_name
        }
      });

      const userId = authResult?.id;

      if (!userId) {
        if (authResult?.message?.includes('already') || authResult?.code === 422) {
          console.log('(exists)');
          continue;
        }
        console.log(`FAILED`);
        continue;
      }

      // 2. Create profile with pro_business account type
      const profileResult = await apiCall('/rest/v1/profiles', 'POST', {
        id: userId,
        username: business.username,
        full_name: business.full_name,
        bio: business.bio,
        avatar_url: business.avatar_url,
        account_type: 'pro_business',
        is_verified: true
      });

      if (profileResult && !profileResult.error) {
        console.log(`OK`);
        createdAccounts.push({ id: userId, type: 'business', username: business.username });
      } else {
        console.log(`Profile error`);
      }

    } catch (error) {
      console.log(`ERROR: ${error.message}`);
    }
  }

  // ========== CREATE POSTS ==========
  console.log('\n===========================================');
  console.log('Creating posts for new accounts...');
  console.log('===========================================\n');

  let postCount = 0;

  for (const account of createdAccounts) {
    const posts = account.type === 'creator' ? PRO_POSTS.creator : PRO_POSTS.business;

    for (const post of posts) {
      try {
        await apiCall('/rest/v1/posts', 'POST', {
          author_id: account.id,
          media_url: post.media_url,
          media_type: 'photo',
          caption: post.caption,
          visibility: 'public',
          likes_count: Math.floor(Math.random() * 500) + 100,
          comments_count: Math.floor(Math.random() * 50) + 10
        });
        postCount++;
      } catch (error) {
        // Ignore post errors
      }
    }
    console.log(`  ${account.username}: 3 posts`);
  }

  // ========== SUMMARY ==========
  console.log('\n===========================================');
  console.log('SEEDING COMPLETE!');
  console.log('===========================================');
  console.log(`Pro Creators created: ${createdAccounts.filter(a => a.type === 'creator').length}`);
  console.log(`Pro Businesses created: ${createdAccounts.filter(a => a.type === 'business').length}`);
  console.log(`Total posts created: ${postCount}`);
  console.log('===========================================');
}

main().catch(console.error);
