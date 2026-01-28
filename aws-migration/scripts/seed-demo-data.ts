/**
 * Seed Demo Data Script
 * Creates realistic demo profiles and content for testing
 *
 * Usage: npx ts-node aws-migration/scripts/seed-demo-data.ts
 *
 * IMPORTANT: All demo data has is_demo=true flag for easy cleanup
 * Cleanup: DELETE FROM profiles WHERE is_demo = true;
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'smuppy',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_HOST?.includes('rds') ? { rejectUnauthorized: false } : false,
});

// ============================================
// DEMO PROFILES DATA
// ============================================

const DEMO_PROFILES = [
  // Pro Creators - Fitness
  {
    username: 'alex_fitness_pro',
    full_name: 'Alex Martin',
    email: 'demo_alex@smuppy.test',
    account_type: 'pro_creator',
    bio: 'Certified Personal Trainer | 10+ years experience | Transform your body & mind',
    expertise: ['Personal Training', 'HIIT', 'Nutrition', 'Weight Loss'],
    interests: ['Fitness', 'Healthy Living', 'Motivation'],
    avatar_url: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=200',
    location: 'Los Angeles, CA',
    is_verified: true,
  },
  {
    username: 'sarah_yoga_master',
    full_name: 'Sarah Johnson',
    email: 'demo_sarah@smuppy.test',
    account_type: 'pro_creator',
    bio: 'RYT-500 Yoga Instructor | Mindfulness Coach | Find your inner peace',
    expertise: ['Yoga', 'Meditation', 'Breathwork', 'Flexibility'],
    interests: ['Wellness', 'Mindfulness', 'Nature'],
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    location: 'San Diego, CA',
    is_verified: true,
  },
  {
    username: 'mike_strongman',
    full_name: 'Mike Thompson',
    email: 'demo_mike@smuppy.test',
    account_type: 'pro_creator',
    bio: 'Powerlifting Champion | Strength Coach | Build unstoppable power',
    expertise: ['Powerlifting', 'Strength Training', 'Sports Nutrition'],
    interests: ['Strength Sports', 'Competition', 'Recovery'],
    avatar_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200',
    location: 'Austin, TX',
    is_verified: true,
  },
  {
    username: 'emma_crossfit',
    full_name: 'Emma Williams',
    email: 'demo_emma@smuppy.test',
    account_type: 'pro_creator',
    bio: 'CrossFit Level 3 Trainer | Competition Coach | Push your limits',
    expertise: ['CrossFit', 'Olympic Lifting', 'Conditioning'],
    interests: ['CrossFit Games', 'Functional Fitness', 'Community'],
    avatar_url: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200',
    location: 'Miami, FL',
    is_verified: false,
  },
  {
    username: 'david_nutrition',
    full_name: 'David Chen',
    email: 'demo_david@smuppy.test',
    account_type: 'pro_creator',
    bio: 'Sports Nutritionist | Meal Prep Expert | Fuel your performance',
    expertise: ['Nutrition', 'Meal Planning', 'Sports Nutrition', 'Weight Management'],
    interests: ['Healthy Eating', 'Cooking', 'Science'],
    avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
    location: 'New York, NY',
    is_verified: true,
  },

  // Pro Creators - Combat Sports
  {
    username: 'luis_boxing',
    full_name: 'Luis Rodriguez',
    email: 'demo_luis@smuppy.test',
    account_type: 'pro_creator',
    bio: 'Former Pro Boxer | Boxing Coach | Train like a champion',
    expertise: ['Boxing', 'Conditioning', 'Self-Defense'],
    interests: ['Boxing', 'Combat Sports', 'Discipline'],
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    location: 'Las Vegas, NV',
    is_verified: true,
  },
  {
    username: 'kenji_mma',
    full_name: 'Kenji Tanaka',
    email: 'demo_kenji@smuppy.test',
    account_type: 'pro_creator',
    bio: 'MMA Fighter | BJJ Black Belt | Master all disciplines',
    expertise: ['MMA', 'BJJ', 'Wrestling', 'Muay Thai'],
    interests: ['Martial Arts', 'Competition', 'Teaching'],
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    location: 'San Jose, CA',
    is_verified: false,
  },

  // Pro Local - Gyms & Studios
  {
    username: 'ironforge_gym',
    full_name: 'Iron Forge Fitness',
    email: 'demo_ironforge@smuppy.test',
    account_type: 'pro_business',
    bio: 'Premium 24/7 Gym | State-of-the-art equipment | Personal training available',
    expertise: ['Gym', 'Personal Training', 'Group Classes'],
    interests: ['Fitness Community', 'Equipment', 'Training'],
    avatar_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    location: 'Downtown LA',
    is_verified: true,
    business_name: 'Iron Forge Fitness Center',
    business_category: 'gym',
  },
  {
    username: 'zenflow_studio',
    full_name: 'ZenFlow Yoga Studio',
    email: 'demo_zenflow@smuppy.test',
    account_type: 'pro_business',
    bio: 'Boutique yoga studio | Hot yoga, Vinyasa, Restorative | Find your flow',
    expertise: ['Yoga Classes', 'Meditation', 'Wellness Programs'],
    interests: ['Yoga', 'Wellness', 'Community'],
    avatar_url: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=200',
    location: 'Santa Monica, CA',
    is_verified: true,
    business_name: 'ZenFlow Yoga Studio',
    business_category: 'studio',
  },

  // Personal Users
  {
    username: 'fitness_newbie_john',
    full_name: 'John Miller',
    email: 'demo_john@smuppy.test',
    account_type: 'personal',
    bio: 'Starting my fitness journey | Looking for motivation',
    expertise: [],
    interests: ['Weight Loss', 'Running', 'Healthy Eating'],
    avatar_url: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200',
    location: 'Chicago, IL',
    is_verified: false,
  },
  {
    username: 'lisa_runner',
    full_name: 'Lisa Anderson',
    email: 'demo_lisa@smuppy.test',
    account_type: 'personal',
    bio: 'Marathon runner in training | 5K to 42K journey',
    expertise: [],
    interests: ['Running', 'Cardio', 'Outdoor Activities'],
    avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
    location: 'Boston, MA',
    is_verified: false,
  },
  {
    username: 'gym_enthusiast_mark',
    full_name: 'Mark Davis',
    email: 'demo_mark@smuppy.test',
    account_type: 'personal',
    bio: 'Gym rat | Gains over everything | Always learning',
    expertise: [],
    interests: ['Bodybuilding', 'Strength Training', 'Supplements'],
    avatar_url: 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=200',
    location: 'Denver, CO',
    is_verified: false,
  },
];

// ============================================
// DEMO POSTS DATA
// ============================================

const generateDemoPosts = (profileId: string, accountType: string) => {
  const posts = [];
  const numPosts = accountType === 'pro_creator' ? 8 : accountType === 'pro_business' ? 5 : 3;

  const captions = [
    'Starting the week strong! What are your fitness goals? 💪',
    'Recovery is just as important as the workout. Remember to rest!',
    'New personal record today! Never stop pushing yourself.',
    'Meal prep Sunday! Nutrition is 80% of the battle.',
    'Early morning workout - best way to start the day.',
    'Form check! Proper technique prevents injuries.',
    'Motivation Monday - let\'s crush this week together!',
    'Throwback to last week\'s training session.',
  ];

  const images = [
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
    'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800',
    'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
    'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
    'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800',
  ];

  for (let i = 0; i < numPosts; i++) {
    posts.push({
      id: uuidv4(),
      author_id: profileId,
      content: captions[i % captions.length],
      media_urls: [images[i % images.length]],
      media_type: 'image',
      visibility: i === 0 && accountType === 'pro_creator' ? 'fans' : 'public',
      likes_count: Math.floor(Math.random() * 500) + 50,
      comments_count: Math.floor(Math.random() * 50) + 5,
      is_demo: true,
    });
  }

  return posts;
};

// ============================================
// DEMO PEAKS DATA
// ============================================

const generateDemoPeaks = (profileId: string, accountType: string) => {
  if (accountType !== 'pro_creator') return [];

  const peaks = [];
  const numPeaks = 3;

  const thumbnails = [
    'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
    'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400',
    'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400',
  ];

  // Demo video URLs (using sample video placeholders)
  const videoUrls = [
    'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
    'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_2mb.mp4',
    'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_5mb.mp4',
  ];

  const captions = [
    'Quick tip of the day!',
    'Behind the scenes',
    'Workout motivation',
  ];

  for (let i = 0; i < numPeaks; i++) {
    peaks.push({
      id: uuidv4(),
      author_id: profileId,
      video_url: videoUrls[i],
      thumbnail_url: thumbnails[i],
      caption: captions[i],
      duration: Math.floor(Math.random() * 10) + 5,
      views_count: Math.floor(Math.random() * 1000) + 100,
    });
  }

  return peaks;
};

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function seedDemoData() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting demo data seeding...\n');

    // Check if demo data already exists (using is_bot flag for demo profiles)
    const existingDemo = await client.query(
      "SELECT COUNT(*) FROM profiles WHERE is_bot = true"
    );

    if (parseInt(existingDemo.rows[0].count) > 0) {
      console.log('⚠️  Demo data already exists. Cleaning up first...');
      await client.query("DELETE FROM follows WHERE follower_id IN (SELECT id FROM profiles WHERE is_bot = true) OR following_id IN (SELECT id FROM profiles WHERE is_bot = true)");
      await client.query("DELETE FROM posts WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
      await client.query("DELETE FROM peaks WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
      await client.query("DELETE FROM profiles WHERE is_bot = true");
      console.log('✅ Old demo data cleaned up.\n');
    }

    // Insert profiles
    console.log('📝 Creating demo profiles...');
    const profileIds: { id: string; accountType: string }[] = [];

    for (const profile of DEMO_PROFILES) {
      const id = uuidv4();

      await client.query(
        `INSERT INTO profiles (
          id, username, full_name, account_type, bio,
          expertise, interests, avatar_url, location, is_verified,
          business_name, business_category, is_bot, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())`,
        [
          id,
          profile.username,
          profile.full_name,
          profile.account_type,
          profile.bio,
          profile.expertise,
          profile.interests,
          profile.avatar_url,
          profile.location,
          profile.is_verified,
          (profile as any).business_name || null,
          (profile as any).business_category || null,
        ]
      );

      profileIds.push({ id, accountType: profile.account_type });
      console.log(`  ✅ Created: ${profile.full_name} (@${profile.username})`);
    }

    // Insert posts
    console.log('\n📸 Creating demo posts...');
    let totalPosts = 0;

    for (const { id, accountType } of profileIds) {
      const posts = generateDemoPosts(id, accountType);

      for (const post of posts) {
        await client.query(
          `INSERT INTO posts (
            id, author_id, content, media_urls, media_type, visibility,
            likes_count, comments_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - interval '${Math.floor(Math.random() * 30)} days')`,
          [
            post.id,
            post.author_id,
            post.content,
            post.media_urls,
            post.media_type,
            post.visibility,
            post.likes_count,
            post.comments_count,
          ]
        );
        totalPosts++;
      }
    }
    console.log(`  ✅ Created ${totalPosts} posts`);

    // Insert peaks
    console.log('\n⚡ Creating demo peaks...');
    let totalPeaks = 0;

    for (const { id, accountType } of profileIds) {
      const peaks = generateDemoPeaks(id, accountType);

      for (const peak of peaks) {
        await client.query(
          `INSERT INTO peaks (
            id, author_id, video_url, thumbnail_url, caption, duration, views_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - interval '${Math.floor(Math.random() * 7)} days')`,
          [
            peak.id,
            peak.author_id,
            peak.video_url,
            peak.thumbnail_url,
            peak.caption,
            peak.duration,
            peak.views_count,
          ]
        );
        totalPeaks++;
      }
    }
    console.log(`  ✅ Created ${totalPeaks} peaks`);

    // Create some follows
    console.log('\n👥 Creating follow relationships...');
    let totalFollows = 0;

    for (let i = 0; i < profileIds.length; i++) {
      for (let j = 0; j < profileIds.length; j++) {
        if (i !== j && Math.random() > 0.5) {
          try {
            await client.query(
              `INSERT INTO follows (id, follower_id, following_id, status, created_at)
               VALUES ($1, $2, $3, 'accepted', NOW())
               ON CONFLICT DO NOTHING`,
              [uuidv4(), profileIds[i].id, profileIds[j].id]
            );
            totalFollows++;
          } catch {
            // Ignore duplicate follows
          }
        }
      }
    }
    console.log(`  ✅ Created ${totalFollows} follow relationships`);

    console.log('\n✨ Demo data seeding complete!');
    console.log(`
Summary:
- ${DEMO_PROFILES.length} profiles created
- ${totalPosts} posts created
- ${totalPeaks} peaks created
- ${totalFollows} follow relationships created

To cleanup demo data, run:
  DELETE FROM profiles WHERE is_bot = true;
`);

  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
seedDemoData().catch(console.error);
