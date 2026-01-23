#!/usr/bin/env node

/**
 * Fix Pro accounts - create profiles for existing auth users
 */

const SUPABASE_URL = "https://wbgfaeytioxnkdsuvvlx.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiZ2ZhZXl0aW94bmtkc3V2dmx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzcwNjc4NSwiZXhwIjoyMDgzMjgyNzg1fQ.9VdScdCAll_3qafbEzqtA2r_MM_BQoJKiakqgZ7zan0";

// Pro accounts that need to be created
const PRO_ACCOUNTS = [
  // Pro Creators
  { email: "coach.marcus@smuppy.pro", username: "CoachMarcus", full_name: "Marcus Williams", bio: "NASM Certified Personal Trainer | Weight Loss & Muscle Building Specialist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=400" },
  { email: "yogi.priya@smuppy.pro", username: "YogiPriya", full_name: "Priya Sharma", bio: "RYT-500 Yoga Teacher | Vinyasa & Yin Specialist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
  { email: "nutritionist.anna@smuppy.pro", username: "NutritionistAnna", full_name: "Dr. Anna Martinez", bio: "Registered Dietitian | Sports Nutrition Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400" },
  { email: "hiit.jason@smuppy.pro", username: "HIITJason", full_name: "Jason Clarke", bio: "Les Mills Certified | HIIT & Bootcamp Instructor | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
  { email: "fighter.diego@smuppy.pro", username: "FighterDiego", full_name: "Diego Santos", bio: "Pro MMA Fighter | Boxing & BJJ Coach | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400" },
  { email: "mindcoach.elena@smuppy.pro", username: "MindCoachElena", full_name: "Elena Volkov", bio: "Certified Life Coach | Meditation & Breathwork Guide | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=400" },
  { email: "coach.thompson@smuppy.pro", username: "CoachThompson", full_name: "David Thompson", bio: "UEFA Licensed Coach | Football & Basketball Training | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=400" },
  { email: "physio.claire@smuppy.pro", username: "PhysioClaire", full_name: "Dr. Claire Bennett", bio: "Doctor of Physical Therapy | Sports Injury Specialist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400" },
  { email: "dancer.maya@smuppy.pro", username: "DancerMaya", full_name: "Maya Johnson", bio: "Professional Dancer | Hip Hop, Contemporary & Latin | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400" },
  { email: "adventure.alex@smuppy.pro", username: "AdventureAlex", full_name: "Alex Rivers", bio: "AMGA Certified Guide | Rock Climbing & Hiking Expert | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400" },
  { email: "specialist.ruth@smuppy.pro", username: "SpecialistRuth", full_name: "Ruth Anderson", bio: "ACE Senior Fitness Specialist | Pre/Postnatal Certified | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400" },
  { email: "functional.mike@smuppy.pro", username: "FunctionalMike", full_name: "Mike Chen", bio: "FMS Certified | Mobility & Movement Specialist | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400" },

  // Pro Businesses
  { email: "ironforge.gym@smuppy.biz", username: "IronForgeGym", full_name: "Iron Forge Fitness", bio: "Premium fitness facility | State-of-the-art equipment | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
  { email: "serenity.yoga@smuppy.biz", username: "SerenityYogaStudio", full_name: "Serenity Yoga Studio", bio: "Peaceful yoga sanctuary | All levels welcome | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1545205597-3d9d02c29547?w=400" },
  { email: "crossfit.forge@smuppy.biz", username: "CrossFitForge", full_name: "CrossFit Forge", bio: "Official CrossFit Affiliate | WODs daily | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400" },
  { email: "aqua.center@smuppy.biz", username: "AquaFitnessCenter", full_name: "Aqua Fitness Center", bio: "Olympic-size pool | Swim lessons & aqua aerobics | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400" },
  { email: "warriors.dojo@smuppy.biz", username: "WarriorsDojo", full_name: "Warriors Martial Arts", bio: "Traditional & modern martial arts | All ages welcome | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1555597673-b21d5c935865?w=400" },
  { email: "rhythm.dance@smuppy.biz", username: "RhythmDanceStudio", full_name: "Rhythm Dance Studio", bio: "Dance classes for all styles | Hip hop, salsa, contemporary | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400" },
  { email: "zen.wellness@smuppy.biz", username: "ZenWellnessSpa", full_name: "Zen Wellness & Spa", bio: "Holistic wellness center | Massage, sauna, relaxation | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1600618528240-fb9fc964b853?w=400" },
  { email: "champions.club@smuppy.biz", username: "ChampionsSportsClub", full_name: "Champions Sports Club", bio: "Multi-sport facility | Tennis, basketball, swimming | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400" },
  { email: "elite.pt@smuppy.biz", username: "ElitePTStudio", full_name: "Elite Personal Training", bio: "Private training studio | 1-on-1 coaching | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400" },
  { email: "knockout.boxing@smuppy.biz", username: "KnockoutBoxingGym", full_name: "Knockout Boxing Gym", bio: "Boxing classes & training | Cardio boxing | Smuppy Team", avatar_url: "https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400" },
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
  console.log('FIXING PRO ACCOUNTS');
  console.log('===========================================\n');

  let created = 0;
  let failed = 0;

  for (const account of PRO_ACCOUNTS) {
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

      // If user exists, get their ID
      if (!userId && authResult?.code === 422) {
        // User exists, need to find their ID
        const usersResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
          }
        });
        const usersData = await usersResponse.json();
        const existingUser = usersData.users?.find(u => u.email === account.email);
        userId = existingUser?.id;
      }

      if (!userId) {
        console.log('FAILED (no user ID)');
        failed++;
        continue;
      }

      // 2. Check if profile exists
      const existingProfile = await apiCall(`/rest/v1/profiles?id=eq.${userId}&select=id`, 'GET');

      if (existingProfile && existingProfile.length > 0) {
        console.log('(profile exists)');
        continue;
      }

      // 3. Create profile
      const profileResult = await apiCall('/rest/v1/profiles', 'POST', {
        id: userId,
        username: account.username,
        full_name: account.full_name,
        bio: account.bio,
        avatar_url: account.avatar_url,
        account_type: 'personal',
        is_verified: true
      });

      if (profileResult && !profileResult.error && !profileResult.message) {
        console.log('OK');
        created++;
      } else {
        console.log('FAILED:', JSON.stringify(profileResult).substring(0, 50));
        failed++;
      }

    } catch (error) {
      console.log('ERROR:', error.message);
      failed++;
    }
  }

  console.log('\n===========================================');
  console.log(`Created: ${created}`);
  console.log(`Failed: ${failed}`);
  console.log('===========================================');
}

main().catch(console.error);
