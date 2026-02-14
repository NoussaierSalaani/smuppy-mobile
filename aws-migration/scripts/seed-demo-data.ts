/**
 * Massive Seed Demo Data Script
 * Creates 166 profiles, 300 spots, ~900 posts, ~144 peaks, ~800 follows
 * + business activities, schedule slots, services
 *
 * Usage: npx ts-node aws-migration/scripts/seed-demo-data.ts
 * Cleanup: DELETE FROM profiles WHERE is_bot = true;
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================
// MODE: API (via admin endpoint) or DIRECT (pg Pool)
// ============================================
const ADMIN_API_URL = process.env.ADMIN_API_URL;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const USE_API = !!ADMIN_API_URL;

let pool: any;
if (!USE_API) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'smuppy',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_HOST?.includes('rds') ? { rejectUnauthorized: false } : false,
  });
}

// SQL value escaping for API mode (raw SQL)
function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (Array.isArray(val)) {
    if (val.length === 0) return "'{}'::text[]";
    return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]::text[]`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildRawSql(template: string, params: unknown[]): string {
  let sql = template;
  for (let i = params.length; i >= 1; i--) {
    sql = sql.replaceAll(`$${i}`, escapeSqlValue(params[i - 1]));
  }
  return sql;
}

async function runSqlViaApi(sql: string): Promise<void> {
  const resp = await fetch(ADMIN_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY!,
    },
    body: JSON.stringify({ action: 'run-ddl', sql }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API error ${resp.status}: ${text}`);
  }
}

// Batched API client — accumulates SQL and sends in batches
class ApiQueryClient {
  private batch: string[] = [];
  private batchSize = 5; // Keep small to stay under WAF body size limits

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    const rawSql = params && params.length > 0 ? buildRawSql(sql, params) : sql;
    const trimmed = rawSql.trim();
    if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      return { rows: [] };
    }
    this.batch.push(rawSql);
    if (this.batch.length >= this.batchSize) {
      await this.flush();
    }
    return { rows: [] };
  }

  async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    const sql = this.batch.join(';\n');
    this.batch = [];
    console.log(`  Sending batch (${sql.length} chars)...`);
    await runSqlViaApi(sql);
  }

  release(): void { /* no-op */ }
}

// ============================================
// TYPES
// ============================================

// [username, fullName, expertiseCategory, expertiseItems, interestItems, bio, city, lat, lng, verified]
type CreatorT = [string, string, string, string[], string[], string, string, number, number, boolean];
// [username, businessName, category, interests, bio, city, lat, lng, hasActivities]
type BusinessT = [string, string, string, string[], string, string, number, number, boolean];
// [username, fullName, interests, bio, city, lat, lng]
type PersonalT = [string, string, string[], string, string, number, number];
// [name, city, country, lat, lng, category, sportType]
type SpotT = [string, string, string, number, number, string, string];

// ============================================
// HELPERS
// ============================================

function pick<T>(arr: T[], n: number): T[] {
  const s = [...arr].sort(() => Math.random() - 0.5);
  return s.slice(0, Math.min(n, s.length));
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================
// IMAGE & VIDEO POOLS
// ============================================

const AVATARS = [
  'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=200',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
  'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200',
  'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
  'https://images.unsplash.com/photo-1557862921-37829c790f19?w=200',
  'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
  'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=200',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
];

const POST_IMAGES = [
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
  'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800',
  'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800',
  'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800',
  'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=800',
  'https://images.unsplash.com/photo-1576678927484-cc907957088c?w=800',
  'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
  'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=800',
  'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=800',
  'https://images.unsplash.com/photo-1579126038374-6064e9370f0f?w=800',
];

const SPOT_IMAGES = [
  'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600',
  'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=600',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=600',
  'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
  'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600',
];

// Video URLs for peaks (Cloudinary demo videos — reliable CDN, no auth required)
const VIDEO_URLS = [
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_0/v1/dog.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_0/v1/elephants.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_0/v1/snow_horses.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_0/v1/ski_jump.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_2/v1/dog.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_2/v1/elephants.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_4/v1/snow_horses.mp4',
  'https://res.cloudinary.com/demo/video/upload/c_fill,w_720,h_1280,so_4/v1/ski_jump.mp4',
];

// ============================================
// NICHE → TAGS MAPPING (interest names lowercase)
// ============================================

const NICHE_TAGS: Record<string, string[]> = {
  'Personal Training': ['gym', 'weightlifting', 'cardio', 'hiit', 'fitness', 'stretching'],
  'Yoga & Pilates': ['yoga', 'pilates', 'meditation', 'stretching', 'mindfulness', 'breathwork'],
  'Nutrition & Diet': ['nutrition', 'healthy eating', 'gym', 'fitness', 'running'],
  'Group Fitness': ['crossfit', 'hiit', 'cycling', 'gym', 'cardio', 'fitness'],
  'Combat Sports': ['boxing', 'mma', 'kickboxing', 'muay thai', 'bjj', 'judo'],
  'Mind & Wellness': ['meditation', 'yoga', 'mindfulness', 'breathwork', 'mental health', 'sleep'],
  'Sports Coaching': ['running', 'swimming', 'tennis', 'cycling', 'football', 'basketball'],
  'Rehabilitation': ['physiotherapy', 'massage', 'foam rolling', 'stretching', 'yoga'],
  'Dance & Movement': ['hip hop', 'salsa', 'ballet', 'contemporary', 'zumba', 'latin dance'],
  'Outdoor & Adventure': ['hiking', 'climbing', 'surfing', 'skiing', 'trail running', 'mountain biking'],
  'Specialized Populations': ['yoga', 'pilates', 'gym', 'swimming', 'stretching', 'fitness'],
  'Functional Training': ['calisthenics', 'gym', 'crossfit', 'hiit', 'weightlifting', 'stretching'],
  'Wellness Services': ['massage', 'spa & recovery', 'foam rolling', 'cryotherapy', 'sauna', 'yoga'],
  'Performance': ['running', 'sprinting', 'crossfit', 'hiit', 'gym', 'weightlifting'],
  'Online Coaching': ['gym', 'fitness', 'nutrition', 'yoga', 'hiit', 'running'],
  'Lifestyle & Habits': ['motivation', 'personal growth', 'goal setting', 'active living', 'healthy eating'],
  'Combat Fitness': ['boxing', 'kickboxing', 'mma', 'cardio', 'hiit', 'fitness'],
  'Aquatic Sports': ['swimming', 'paddle board', 'kayaking', 'water polo', 'scuba diving'],
  'Stretching & Flexibility': ['stretching', 'yoga', 'pilates', 'foam rolling', 'gymnastics'],
  'Corporate Wellness': ['yoga', 'meditation', 'stress relief', 'active living', 'work-life balance'],
  'Holistic Health': ['holistic health', 'meditation', 'yoga', 'self-care', 'relaxation', 'breathwork'],
  'Mind-Body Integration': ['tai chi', 'qigong', 'yoga', 'meditation', 'mindfulness', 'relaxation'],
  'Weight Management': ['nutrition', 'healthy eating', 'gym', 'cardio', 'running', 'hiit'],
  'Extreme Sports': ['skateboarding', 'bmx', 'parkour', 'snowboarding', 'surfing', 'climbing'],
};

const BIZ_TAGS: Record<string, string[]> = {
  gym: ['gym', 'weightlifting', 'fitness', 'cardio', 'hiit'],
  yoga_studio: ['yoga', 'pilates', 'meditation', 'mindfulness', 'stretching'],
  crossfit: ['crossfit', 'hiit', 'weightlifting', 'gym', 'fitness'],
  pool: ['swimming', 'water polo', 'paddle board', 'fitness'],
  martial_arts: ['mma', 'karate', 'judo', 'kickboxing', 'boxing'],
  dance_studio: ['hip hop', 'ballet', 'salsa', 'zumba', 'contemporary'],
  wellness_spa: ['spa & recovery', 'massage', 'sauna', 'meditation', 'yoga'],
  sports_club: ['tennis', 'basketball', 'football', 'volleyball', 'swimming'],
  personal_training: ['gym', 'fitness', 'cardio', 'weightlifting', 'stretching'],
  bootcamp: ['hiit', 'crossfit', 'cardio', 'fitness', 'running'],
  pilates: ['pilates', 'yoga', 'stretching', 'fitness', 'calisthenics'],
  meditation: ['meditation', 'mindfulness', 'yoga', 'breathwork', 'relaxation'],
  tennis: ['tennis', 'fitness', 'cardio'],
  climbing: ['climbing', 'fitness', 'calisthenics', 'hiking'],
  boxing: ['boxing', 'kickboxing', 'cardio', 'fitness', 'hiit'],
  running_club: ['running', 'trail running', 'cardio', 'fitness'],
  hiit_studio: ['hiit', 'crossfit', 'cardio', 'fitness', 'gym'],
  swim_school: ['swimming', 'fitness', 'water polo'],
  nutrition: ['nutrition', 'healthy eating', 'fitness'],
  golf: ['golf', 'fitness'],
  cycling: ['cycling', 'cardio', 'fitness', 'mountain biking'],
  mma: ['mma', 'boxing', 'bjj', 'kickboxing', 'muay thai'],
};

// ============================================
// 72 PRO CREATORS (3 per 24 expertise categories)
// ============================================

const CREATORS: CreatorT[] = [
  // 1. Personal Training
  ['team_smuppy_alex_fitness_pro', 'Alex Martin', 'Personal Training', ['General Fitness', 'Weight Loss', 'Muscle Building'], ['Gym', 'Running', 'Nutrition'], 'Certified PT | Transform your body & mind', 'Los Angeles, CA', 34.05, -118.24, true],
  ['team_smuppy_jake_pt_coach', 'Jake Peterson', 'Personal Training', ['Strength Training', 'Body Transformation', 'Endurance'], ['Weightlifting', 'HIIT', 'Swimming'], 'Strength & conditioning specialist', 'Toronto, ON', 43.65, -79.38, true],
  ['team_smuppy_ana_body_transform', 'Ana Silva', 'Personal Training', ['Toning', 'Flexibility', 'Weight Loss'], ['Pilates', 'Yoga', 'Healthy Eating'], 'Body transformation coach', 'Miami, FL', 25.76, -80.19, false],
  // 2. Yoga & Pilates
  ['team_smuppy_sarah_yoga_master', 'Sarah Johnson', 'Yoga & Pilates', ['Hatha Yoga', 'Vinyasa Flow', 'Power Yoga'], ['Yoga', 'Meditation', 'Mindfulness'], 'RYT-500 Yoga Instructor', 'San Diego, CA', 32.72, -117.16, true],
  ['team_smuppy_elena_pilates', 'Elena Rossi', 'Yoga & Pilates', ['Mat Pilates', 'Reformer Pilates', 'Yin Yoga'], ['Pilates', 'Stretching', 'Self-Care'], 'Pilates studio owner', 'Ottawa, ON', 45.42, -75.69, true],
  ['team_smuppy_priya_vinyasa', 'Priya Patel', 'Yoga & Pilates', ['Hot Yoga', 'Prenatal Yoga', 'Vinyasa Flow'], ['Yoga', 'Breathwork', 'Relaxation'], 'Vinyasa flow specialist', 'Vancouver, BC', 49.28, -123.12, false],
  // 3. Nutrition & Diet
  ['team_smuppy_david_nutrition', 'David Chen', 'Nutrition & Diet', ['Sports Nutrition', 'Meal Planning', 'Supplements'], ['Nutrition', 'Healthy Eating', 'Swimming'], 'Sports Nutritionist | Fuel your performance', 'New York, NY', 40.71, -74.00, true],
  ['team_smuppy_claire_mealprep', 'Claire Dubois', 'Nutrition & Diet', ['Weight Management', 'Keto/Low Carb', 'Gut Health'], ['Nutrition', 'Gym', 'Running'], 'Meal prep queen | Healthy made easy', 'Montreal, QC', 45.50, -73.57, true],
  ['team_smuppy_sam_sports_fuel', 'Sam Williams', 'Nutrition & Diet', ['Performance Nutrition', 'Vegan/Plant-Based', 'Supplements'], ['CrossFit', 'Cycling', 'Nutrition'], 'Plant-based sports nutrition', 'Portland, OR', 45.52, -122.67, false],
  // 4. Group Fitness
  ['team_smuppy_omar_hiit', 'Omar Hassan', 'Group Fitness', ['HIIT Classes', 'Circuit Training', 'Bootcamp'], ['HIIT', 'CrossFit', 'Running'], 'HIIT master | Push your limits', 'Chicago, IL', 41.88, -87.63, true],
  ['team_smuppy_tanya_spin', 'Tanya Roberts', 'Group Fitness', ['Spin/Cycling', 'Aerobics', 'Step Classes'], ['Cycling', 'Cardio', 'Fitness'], 'Spin instructor | Feel the burn', 'Denver, CO', 39.74, -104.99, false],
  ['team_smuppy_bootcamp_brad', 'Brad Cooper', 'Group Fitness', ['CrossFit', 'Bootcamp', 'Aqua Fitness'], ['CrossFit', 'Swimming', 'HIIT'], 'Outdoor bootcamp coach', 'Ottawa, ON', 45.40, -75.71, true],
  // 5. Combat Sports
  ['team_smuppy_luis_boxing', 'Luis Rodriguez', 'Combat Sports', ['Boxing', 'Kickboxing', 'MMA'], ['Boxing', 'MMA', 'Running'], 'Former pro boxer | Train like a champ', 'Las Vegas, NV', 36.17, -115.14, true],
  ['team_smuppy_kenji_mma', 'Kenji Tanaka', 'Combat Sports', ['MMA', 'BJJ/Jiu-Jitsu', 'Wrestling'], ['MMA', 'BJJ', 'Judo'], 'MMA fighter | BJJ black belt', 'San Jose, CA', 37.34, -121.89, true],
  ['team_smuppy_layla_kickbox', 'Layla Ahmed', 'Combat Sports', ['Kickboxing', 'Muay Thai', 'Karate'], ['Kickboxing', 'Muay Thai', 'Cardio'], 'Muay Thai champion | Kickboxing coach', 'Houston, TX', 29.76, -95.37, false],
  // 6. Mind & Wellness
  ['team_smuppy_raj_meditation', 'Raj Sharma', 'Mind & Wellness', ['Meditation', 'Breathwork', 'Mindfulness'], ['Meditation', 'Yoga', 'Mindfulness'], 'Meditation guide | Inner peace daily', 'Sedona, AZ', 34.87, -111.76, true],
  ['team_smuppy_zen_master_lee', 'Master Lee', 'Mind & Wellness', ['Stress Management', 'Mental Performance', 'Life Coaching'], ['Mental Health', 'Tai Chi', 'Relaxation'], 'Zen master | 20 years practice', 'San Francisco, CA', 37.77, -122.42, true],
  ['team_smuppy_emma_mindful', 'Emma Wright', 'Mind & Wellness', ['Sleep Coaching', 'Relaxation', 'Mindfulness'], ['Sleep', 'Mindfulness', 'Yoga'], 'Sleep & mindfulness coach', 'Vancouver, BC', 49.26, -123.14, false],
  // 7. Sports Coaching
  ['team_smuppy_jessica_running', 'Jessica Park', 'Sports Coaching', ['Running Coach', 'Triathlon Coach', 'Cycling Coach'], ['Running', 'Cycling', 'Swimming'], 'Marathon coach | Sub-3 qualifier', 'Boston, MA', 42.36, -71.06, true],
  ['team_smuppy_coach_tony_swim', 'Tony Nguyen', 'Sports Coaching', ['Swimming Coach', 'Tennis Coach', 'Basketball Coach'], ['Swimming', 'Tennis', 'Basketball'], 'Multi-sport coach | Youth specialist', 'Ottawa, ON', 45.43, -75.70, true],
  ['team_smuppy_golf_guru_james', 'James MacLeod', 'Sports Coaching', ['Golf Instructor', 'Football Coach', 'Cycling Coach'], ['Golf', 'Football', 'Cycling'], 'PGA certified instructor', 'Scottsdale, AZ', 33.49, -111.93, false],
  // 8. Rehabilitation
  ['team_smuppy_nina_physio', 'Nina Petrova', 'Rehabilitation', ['Injury Prevention', 'Post-Surgery Rehab', 'Sports Injury'], ['Physiotherapy', 'Yoga', 'Swimming'], 'Sports physio | Return to play', 'Toronto, ON', 43.66, -79.39, true],
  ['team_smuppy_dan_rehab_pro', 'Dan Mitchell', 'Rehabilitation', ['Back Pain', 'Joint Mobility', 'Corrective Exercise'], ['Massage', 'Foam Rolling', 'Stretching'], 'Rehab specialist | Pain-free movement', 'Ottawa, ON', 45.41, -75.70, true],
  ['team_smuppy_kelly_injury_prev', 'Kelly O\'Brien', 'Rehabilitation', ['Chronic Pain', 'Physical Therapy', 'Injury Prevention'], ['Pilates', 'Yoga', 'Ice Baths'], 'Chronic pain specialist', 'Dublin, Ireland', 53.35, -6.26, false],
  // 9. Dance & Movement
  ['team_smuppy_carmen_dance', 'Carmen Alvarez', 'Dance & Movement', ['Hip Hop', 'Latin Dance', 'Zumba'], ['Hip Hop', 'Latin Dance', 'Salsa'], 'Latin dance & Zumba instructor', 'Atlanta, GA', 33.75, -84.39, true],
  ['team_smuppy_sofia_ballet', 'Sofia Ivanova', 'Dance & Movement', ['Ballet', 'Contemporary', 'Barre'], ['Ballet', 'Contemporary', 'Stretching'], 'Professional ballet dancer & teacher', 'New York, NY', 40.72, -73.99, true],
  ['team_smuppy_hip_hop_jay', 'Jay Williams', 'Dance & Movement', ['Hip Hop', 'Pole Dance', 'Aerial Arts'], ['Hip Hop', 'Breakdance', 'Calisthenics'], 'Hip hop choreographer', 'Los Angeles, CA', 34.04, -118.25, false],
  // 10. Outdoor & Adventure
  ['team_smuppy_hans_climbing', 'Hans Mueller', 'Outdoor & Adventure', ['Rock Climbing', 'Hiking Guide', 'Mountain Biking'], ['Climbing', 'Hiking', 'Mountain Biking'], 'Alpine guide | Rock climbing coach', 'Boulder, CO', 40.01, -105.27, true],
  ['team_smuppy_trail_guide_maya', 'Maya Thompson', 'Outdoor & Adventure', ['Trail Running', 'Outdoor Fitness', 'Kayak/Paddle'], ['Trail Running', 'Hiking', 'Kayaking'], 'Trail running & adventure guide', 'Whistler, BC', 50.12, -122.95, true],
  ['team_smuppy_surf_coach_kai', 'Kai Nakamura', 'Outdoor & Adventure', ['Surf Instructor', 'Ski/Snowboard', 'Outdoor Fitness'], ['Surfing', 'Snowboarding', 'Camping'], 'Surf & snow instructor', 'Honolulu, HI', 21.31, -157.86, false],
  // 11. Specialized Populations
  ['team_smuppy_senior_fit_ruth', 'Ruth Anderson', 'Specialized Populations', ['Senior Fitness', 'Beginners', 'Women\'s Fitness'], ['Yoga', 'Swimming', 'Stretching'], 'Senior fitness & gentle movement', 'Ottawa, ON', 45.39, -75.72, true],
  ['team_smuppy_prenatal_coach_lin', 'Lin Zhang', 'Specialized Populations', ['Pre/Postnatal', 'Youth/Kids', 'Women\'s Fitness'], ['Yoga', 'Pilates', 'Swimming'], 'Pre/postnatal fitness specialist', 'Toronto, ON', 43.64, -79.40, true],
  ['team_smuppy_youth_coach_max', 'Max Rivera', 'Specialized Populations', ['Youth/Kids', 'Athletes', 'Men\'s Health'], ['Basketball', 'Football', 'Running'], 'Youth athlete development coach', 'Dallas, TX', 32.78, -96.80, false],
  // 12. Functional Training
  ['team_smuppy_chris_calisthenics', 'Chris Park', 'Functional Training', ['Functional Movement', 'Bodyweight', 'Core Training'], ['Calisthenics', 'Gym', 'Stretching'], 'Calisthenics master | No gym needed', 'Seoul, Korea', 37.57, 126.98, true],
  ['team_smuppy_kettlebell_kate', 'Kate Morrison', 'Functional Training', ['Kettlebells', 'Stability', 'Balance Training'], ['CrossFit', 'Weightlifting', 'HIIT'], 'Kettlebell sport champion', 'Calgary, AB', 51.05, -114.07, true],
  ['team_smuppy_trx_trainer_mike', 'Mike Santos', 'Functional Training', ['TRX/Suspension', 'Mobility Work', 'Functional Movement'], ['Gym', 'Swimming', 'Hiking'], 'TRX master trainer', 'San Diego, CA', 32.73, -117.17, false],
  // 13. Wellness Services
  ['team_smuppy_massage_pro_yuki', 'Yuki Tanaka', 'Wellness Services', ['Massage Therapy', 'Recovery Specialist', 'Stretching Coach'], ['Massage', 'Yoga', 'Spa & Recovery'], 'Licensed massage therapist', 'Tokyo, Japan', 35.68, 139.69, true],
  ['team_smuppy_cryo_specialist_tom', 'Tom Eriksen', 'Wellness Services', ['Cryotherapy', 'Sauna/Heat', 'Recovery Specialist'], ['Cryotherapy', 'Sauna', 'Ice Baths'], 'Recovery & cryotherapy specialist', 'Oslo, Norway', 59.91, 10.75, false],
  ['team_smuppy_stretch_coach_zoe', 'Zoe Mitchell', 'Wellness Services', ['Stretching Coach', 'Foam Rolling', 'Massage Therapy'], ['Stretching', 'Yoga', 'Foam Rolling'], 'Assisted stretching coach', 'Los Angeles, CA', 34.06, -118.23, true],
  // 14. Performance
  ['team_smuppy_speed_coach_bolt', 'Marcus Bolt', 'Performance', ['Speed Training', 'Agility', 'Plyometrics'], ['Sprinting', 'Running', 'HIIT'], 'Speed & agility coach | Track & field', 'Kingston, Jamaica', 18.00, -76.79, true],
  ['team_smuppy_agility_pro_nova', 'Nova Kim', 'Performance', ['Agility', 'Sport-Specific', 'Competition Prep'], ['CrossFit', 'Basketball', 'Running'], 'Pro athlete performance coach', 'Seoul, Korea', 37.56, 126.97, true],
  ['team_smuppy_power_train_rex', 'Rex Johnson', 'Performance', ['Power Training', 'Speed Training', 'Plyometrics'], ['Weightlifting', 'Sprinting', 'Football'], 'NFL strength & power coach', 'Phoenix, AZ', 33.45, -112.07, false],
  // 15. Online Coaching
  ['team_smuppy_virtual_coach_emma', 'Emma Clarke', 'Online Coaching', ['Virtual Training', 'Program Design', 'Online Classes'], ['Gym', 'Yoga', 'HIIT'], 'Online fitness coach | 10K+ clients', 'London, UK', 51.51, -0.13, true],
  ['team_smuppy_program_design_ali', 'Ali Khalid', 'Online Coaching', ['Program Design', 'App-Based Coaching', 'Video Analysis'], ['Fitness', 'Running', 'CrossFit'], 'Custom program designer', 'Dubai, UAE', 25.20, 55.27, false],
  ['team_smuppy_online_fit_zara', 'Zara Okafor', 'Online Coaching', ['Remote Nutrition', 'Virtual Training', 'Online Classes'], ['Nutrition', 'Yoga', 'Cardio'], 'Virtual wellness coach', 'Lagos, Nigeria', 6.52, 3.38, true],
  // 16. Lifestyle & Habits
  ['team_smuppy_habit_coach_nora', 'Nora Lindberg', 'Lifestyle & Habits', ['Habit Coaching', 'Goal Setting', 'Accountability'], ['Motivation', 'Goal Setting', 'Personal Growth'], 'Habit & lifestyle coach', 'Stockholm, Sweden', 59.33, 18.07, true],
  ['team_smuppy_goal_setter_finn', 'Finn O\'Sullivan', 'Lifestyle & Habits', ['Motivation', 'Time Management', 'Work-Life Balance'], ['Active Living', 'Work-Life Balance', 'Running'], 'Performance mindset coach', 'Dublin, Ireland', 53.34, -6.27, false],
  ['team_smuppy_motivation_guru_ash', 'Ash Patel', 'Lifestyle & Habits', ['Accountability', 'Goal Setting', 'Habit Coaching'], ['Personal Growth', 'Motivation', 'Meditation'], 'Motivation & accountability partner', 'Austin, TX', 30.27, -97.74, true],
  // 17. Combat Fitness
  ['team_smuppy_cardio_box_diego', 'Diego Fernandez', 'Combat Fitness', ['Cardio Boxing', 'Combat Conditioning', 'Self-Defense'], ['Boxing', 'Kickboxing', 'HIIT'], 'Cardio boxing instructor', 'Mexico City, MX', 19.43, -99.13, true],
  ['team_smuppy_self_defense_kim', 'Kim Soo-Jin', 'Combat Fitness', ['Self-Defense', 'Martial Arts Fitness', 'Cardio Boxing'], ['Karate', 'Taekwondo', 'Cardio'], 'Self-defense for women', 'Seoul, Korea', 37.55, 126.99, true],
  ['team_smuppy_combat_fit_leo', 'Leo Rossi', 'Combat Fitness', ['Combat Conditioning', 'Martial Arts Fitness', 'Cardio Boxing'], ['MMA', 'Boxing', 'CrossFit'], 'Combat fitness specialist', 'Rome, Italy', 41.90, 12.50, false],
  // 18. Aquatic Sports
  ['team_smuppy_natalie_swim', 'Natalie Foster', 'Aquatic Sports', ['Swim Coaching', 'Pool Fitness', 'Water Sports'], ['Swimming', 'Water Polo', 'Fitness'], 'Olympic swim coach | All levels', 'Tampa, FL', 27.95, -82.46, true],
  ['team_smuppy_pool_coach_liam', 'Liam O\'Connor', 'Aquatic Sports', ['Pool Fitness', 'Swim Coaching', 'Diving'], ['Swimming', 'Scuba Diving', 'Kayaking'], 'Aquatic fitness & swim coach', 'Gold Coast, AU', -28.02, 153.43, false],
  ['team_smuppy_dive_master_coral', 'Coral Reyes', 'Aquatic Sports', ['Diving', 'Water Sports', 'Swim Coaching'], ['Scuba Diving', 'Snorkeling', 'Paddle Board'], 'PADI dive master & instructor', 'Cancun, MX', 21.16, -86.85, true],
  // 19. Stretching & Flexibility
  ['team_smuppy_flex_queen_ivy', 'Ivy Chen', 'Stretching & Flexibility', ['Static Stretching', 'Splits Training', 'Contortion'], ['Stretching', 'Yoga', 'Ballet'], 'Flexibility & contortion coach', 'Montreal, QC', 45.51, -73.56, true],
  ['team_smuppy_splits_coach_anna', 'Anna Kozlov', 'Stretching & Flexibility', ['Dynamic Stretching', 'PNF Stretching', 'Splits Training'], ['Stretching', 'Pilates', 'Dance'], 'Splits & flexibility specialist', 'Moscow, Russia', 55.76, 37.62, false],
  ['team_smuppy_pnf_pro_jack', 'Jack Turner', 'Stretching & Flexibility', ['PNF Stretching', 'Fascial Release', 'Static Stretching'], ['Foam Rolling', 'Yoga', 'Physiotherapy'], 'PNF stretching & mobility expert', 'Ottawa, ON', 45.38, -75.73, true],
  // 20. Corporate Wellness
  ['team_smuppy_office_fit_ben', 'Ben Archer', 'Corporate Wellness', ['Office Fitness', 'Desk Exercises', 'Ergonomics'], ['Active Living', 'Work-Life Balance', 'Yoga'], 'Corporate wellness consultant', 'New York, NY', 40.75, -73.98, true],
  ['team_smuppy_desk_health_mia', 'Mia Jensen', 'Corporate Wellness', ['Team Building', 'Stress Workshops', 'Lunch & Learn'], ['Stress Relief', 'Meditation', 'Yoga'], 'Office health & team building', 'Copenhagen, DK', 55.68, 12.57, false],
  ['team_smuppy_team_build_carl', 'Carl Henderson', 'Corporate Wellness', ['Team Building', 'Office Fitness', 'Stress Workshops'], ['Running', 'Goal Setting', 'Active Living'], 'Team building through fitness', 'Ottawa, ON', 45.44, -75.68, true],
  // 21. Holistic Health
  ['team_smuppy_ayurveda_priya', 'Priya Menon', 'Holistic Health', ['Ayurveda', 'Traditional Medicine', 'Aromatherapy'], ['Holistic Health', 'Yoga', 'Meditation'], 'Ayurvedic practitioner', 'Mumbai, India', 19.08, 72.88, true],
  ['team_smuppy_energy_healer_luna', 'Luna Morales', 'Holistic Health', ['Energy Healing', 'Acupressure', 'Reflexology'], ['Self-Care', 'Relaxation', 'Meditation'], 'Reiki master & energy healer', 'Sedona, AZ', 34.86, -111.78, true],
  ['team_smuppy_reflexology_mae', 'Mae Sato', 'Holistic Health', ['Reflexology', 'Aromatherapy', 'Traditional Medicine'], ['Massage', 'Holistic Health', 'Mindfulness'], 'Reflexology & aromatherapy', 'Kyoto, Japan', 35.01, 135.77, false],
  // 22. Mind-Body Integration
  ['team_smuppy_tai_chi_master_wu', 'Master Wu', 'Mind-Body Integration', ['Tai Chi', 'Qigong', 'Body Awareness'], ['Tai Chi', 'Qigong', 'Meditation'], 'Tai Chi grandmaster | 30yr practice', 'Beijing, China', 39.90, 116.40, true],
  ['team_smuppy_qigong_coach_chen', 'Chen Wei', 'Mind-Body Integration', ['Qigong', 'Somatic Movement', 'Feldenkrais'], ['Qigong', 'Tai Chi', 'Mindfulness'], 'Qigong & somatic movement teacher', 'Taipei, Taiwan', 25.03, 121.57, false],
  ['team_smuppy_feldenkrais_lisa', 'Lisa Hartmann', 'Mind-Body Integration', ['Feldenkrais', 'Alexander Technique', 'Body Awareness'], ['Yoga', 'Relaxation', 'Pilates'], 'Feldenkrais practitioner', 'Vienna, Austria', 48.21, 16.37, true],
  // 23. Weight Management
  ['team_smuppy_fat_loss_coach_drew', 'Drew Palmer', 'Weight Management', ['Fat Loss Specialist', 'Body Composition', 'Calorie Management'], ['Gym', 'Running', 'Nutrition'], 'Fat loss & body recomp coach', 'Austin, TX', 30.27, -97.74, true],
  ['team_smuppy_macro_coach_sophie', 'Sophie Laurent', 'Weight Management', ['Macro Coaching', 'Metabolism Coach', 'Sustainable Weight'], ['Nutrition', 'Healthy Eating', 'Cardio'], 'Macro & metabolism coach', 'Paris, France', 48.86, 2.35, true],
  ['team_smuppy_metabolism_pro_rick', 'Rick Torres', 'Weight Management', ['Metabolism Coach', 'Fat Loss Specialist', 'Body Composition'], ['HIIT', 'Gym', 'Swimming'], 'Metabolism optimization specialist', 'Miami, FL', 25.77, -80.20, false],
  // 24. Extreme Sports
  ['team_smuppy_parkour_pro_neo', 'Neo Jackson', 'Extreme Sports', ['Parkour', 'Obstacle Course', 'Adventure Racing'], ['Parkour', 'Skateboarding', 'Climbing'], 'Parkour athlete & coach', 'London, UK', 51.50, -0.12, true],
  ['team_smuppy_skate_coach_rio', 'Rio Ferreira', 'Extreme Sports', ['Skateboarding', 'BMX/Cycling', 'Obstacle Course'], ['Skateboarding', 'BMX', 'Surfing'], 'Pro skater & BMX coach', 'Barcelona, Spain', 41.39, 2.17, false],
  ['team_smuppy_obstacle_racer_kat', 'Kat Volkov', 'Extreme Sports', ['Obstacle Course', 'Crossfit Games', 'Adventure Racing'], ['CrossFit', 'Climbing', 'Trail Running'], 'Spartan race champion', 'Denver, CO', 39.75, -104.98, true],
];

// ============================================
// 44 PRO BUSINESSES (2 per 22 business categories)
// ============================================

const BUSINESSES: BusinessT[] = [
  // gym
  ['team_smuppy_ironforge_gym', 'Iron Forge Fitness', 'gym', ['Gym', 'Weightlifting', 'Cardio'], 'Premium 24/7 gym | State-of-the-art equipment', 'Los Angeles, CA', 34.05, -118.25, true],
  ['team_smuppy_titan_gym', 'Titan Gym', 'gym', ['Gym', 'CrossFit', 'HIIT'], 'Full-service gym | Personal training available', 'Toronto, ON', 43.66, -79.38, true],
  // yoga_studio
  ['team_smuppy_zenflow_studio', 'ZenFlow Studio', 'yoga_studio', ['Yoga', 'Meditation', 'Pilates'], 'Boutique yoga | Hot yoga, Vinyasa, Restorative', 'Santa Monica, CA', 34.02, -118.49, true],
  ['team_smuppy_lotus_yoga', 'Lotus Yoga', 'yoga_studio', ['Yoga', 'Mindfulness', 'Stretching'], 'Traditional & modern yoga classes', 'Ottawa, ON', 45.42, -75.69, true],
  // crossfit
  ['team_smuppy_crossfit_apex', 'CrossFit Apex', 'crossfit', ['CrossFit', 'Weightlifting', 'HIIT'], 'CrossFit affiliate | Competition training', 'Denver, CO', 39.74, -104.98, true],
  ['team_smuppy_crossfit_gatineau', 'CrossFit Gatineau', 'crossfit', ['CrossFit', 'Gym', 'Cardio'], 'CrossFit box | All levels welcome', 'Gatineau, QC', 45.48, -75.70, true],
  // pool
  ['team_smuppy_aqua_center', 'Aqua Center', 'pool', ['Swimming', 'Water Polo', 'Fitness'], 'Olympic pool | Swim lessons & aqua fitness', 'San Diego, CA', 32.72, -117.16, true],
  ['team_smuppy_wavepool_ottawa', 'WavePool Ottawa', 'pool', ['Swimming', 'Fitness'], 'Indoor wave pool & swim school', 'Ottawa, ON', 45.40, -75.68, true],
  // martial_arts
  ['team_smuppy_dragon_martial', 'Dragon Martial Arts', 'martial_arts', ['Karate', 'Judo', 'MMA'], 'Traditional & modern martial arts', 'Houston, TX', 29.76, -95.37, true],
  ['team_smuppy_bushido_dojo', 'Bushido Dojo', 'martial_arts', ['Judo', 'Karate', 'BJJ'], 'Japanese martial arts academy', 'Montreal, QC', 45.50, -73.57, true],
  // dance_studio
  ['team_smuppy_dance_fusion', 'Dance Fusion', 'dance_studio', ['Hip Hop', 'Contemporary', 'Latin Dance'], 'All styles dance studio', 'Atlanta, GA', 33.75, -84.39, true],
  ['team_smuppy_rhythm_dance', 'Rhythm Dance', 'dance_studio', ['Salsa', 'Ballet', 'Zumba'], 'Dance classes for all ages', 'Vancouver, BC', 49.28, -123.12, true],
  // wellness_spa
  ['team_smuppy_recovery_lab', 'Recovery Lab', 'wellness_spa', ['Spa & Recovery', 'Massage', 'Cryotherapy'], 'Sports recovery & wellness center', 'Los Angeles, CA', 34.06, -118.24, false],
  ['team_smuppy_serenity_spa', 'Serenity Spa', 'wellness_spa', ['Spa & Recovery', 'Sauna', 'Massage'], 'Mountain wellness retreat', 'Banff, AB', 51.18, -115.57, false],
  // sports_club
  ['team_smuppy_all_sports_hub', 'All Sports Hub', 'sports_club', ['Tennis', 'Basketball', 'Swimming'], 'Multi-sport facility | Courts & pools', 'Chicago, IL', 41.88, -87.63, true],
  ['team_smuppy_capital_sports', 'Capital Sports Club', 'sports_club', ['Tennis', 'Volleyball', 'Basketball'], 'Ottawa premier sports club', 'Ottawa, ON', 45.41, -75.69, true],
  // personal_training
  ['team_smuppy_rehab_in_motion', 'Rehab In Motion', 'personal_training', ['Physiotherapy', 'Stretching', 'Fitness'], 'Physiotherapy & personal training studio', 'Toronto, ON', 43.65, -79.39, false],
  ['team_smuppy_elite_pt_studio', 'Elite PT Studio', 'personal_training', ['Gym', 'Cardio', 'Weightlifting'], 'Boutique personal training studio', 'Miami, FL', 25.76, -80.19, false],
  // bootcamp
  ['team_smuppy_urban_bootcamp', 'Urban Bootcamp', 'bootcamp', ['HIIT', 'CrossFit', 'Running'], 'Outdoor group fitness', 'New York, NY', 40.71, -74.00, true],
  ['team_smuppy_outdoor_bootcamp_yy', 'Outdoor Bootcamp YYC', 'bootcamp', ['HIIT', 'Fitness', 'Running'], 'Calgary outdoor fitness community', 'Calgary, AB', 51.05, -114.07, true],
  // pilates
  ['team_smuppy_peak_pilates', 'Peak Pilates', 'pilates', ['Pilates', 'Stretching', 'Yoga'], 'Reformer & mat Pilates studio', 'Ottawa, ON', 45.43, -75.70, true],
  ['team_smuppy_core_pilates_sf', 'Core Pilates SF', 'pilates', ['Pilates', 'Fitness', 'Calisthenics'], 'Pilates studio with a view', 'San Francisco, CA', 37.77, -122.42, true],
  // meditation
  ['team_smuppy_inner_calm', 'Inner Calm Center', 'meditation', ['Meditation', 'Mindfulness', 'Breathwork'], 'Meditation & mindfulness center', 'Vancouver, BC', 49.27, -123.13, false],
  ['team_smuppy_mindful_space', 'Mindful Space', 'meditation', ['Meditation', 'Yoga', 'Relaxation'], 'Desert meditation retreat', 'Sedona, AZ', 34.87, -111.76, false],
  // tennis
  ['team_smuppy_ace_tennis', 'Ace Tennis Academy', 'tennis', ['Tennis', 'Fitness'], 'Premier tennis academy', 'Scottsdale, AZ', 33.49, -111.93, true],
  ['team_smuppy_baseline_tennis', 'Baseline Tennis Club', 'tennis', ['Tennis', 'Cardio'], 'Indoor & outdoor tennis courts', 'Ottawa, ON', 45.39, -75.71, true],
  // climbing
  ['team_smuppy_climb_zone', 'Climb Zone', 'climbing', ['Climbing', 'Fitness', 'Calisthenics'], 'Indoor bouldering & lead climbing', 'Boulder, CO', 40.01, -105.27, true],
  ['team_smuppy_vertical_limit', 'Vertical Limit', 'climbing', ['Climbing', 'Hiking'], 'Climbing gym & outdoor guiding', 'Squamish, BC', 49.70, -123.15, true],
  // boxing
  ['team_smuppy_knockout_boxing', 'Knockout Boxing', 'boxing', ['Boxing', 'Kickboxing', 'Cardio'], 'Boxing gym | All skill levels', 'Philadelphia, PA', 39.95, -75.17, true],
  ['team_smuppy_ring_ready', 'Ring Ready', 'boxing', ['Boxing', 'MMA', 'HIIT'], 'Pro boxing training facility', 'Las Vegas, NV', 36.17, -115.14, true],
  // running_club
  ['team_smuppy_run_collective', 'Run Collective Ottawa', 'running_club', ['Running', 'Trail Running', 'Cardio'], 'Ottawa running community', 'Ottawa, ON', 45.42, -75.70, true],
  ['team_smuppy_stride_club', 'Stride Club Portland', 'running_club', ['Running', 'Fitness', 'Trail Running'], 'Portland running & trail club', 'Portland, OR', 45.52, -122.67, true],
  // hiit_studio
  ['team_smuppy_burn_studio', 'Burn Studio', 'hiit_studio', ['HIIT', 'Cardio', 'CrossFit'], 'High intensity interval studio', 'Dallas, TX', 32.78, -96.80, true],
  ['team_smuppy_sweat_factory', 'Sweat Factory', 'hiit_studio', ['HIIT', 'Fitness', 'Gym'], 'Get your sweat on | HIIT & more', 'Montreal, QC', 45.51, -73.56, true],
  // swim_school
  ['team_smuppy_splash_academy', 'Splash Academy', 'swim_school', ['Swimming', 'Fitness'], 'Swim lessons for all ages', 'Tampa, FL', 27.95, -82.46, true],
  ['team_smuppy_aquakids', 'AquaKids Toronto', 'swim_school', ['Swimming', 'Water Polo'], 'Kids swim school & water safety', 'Toronto, ON', 43.64, -79.40, true],
  // nutrition
  ['team_smuppy_nutribalance', 'NutriBalance', 'nutrition', ['Nutrition', 'Healthy Eating'], 'Nutrition clinic & meal planning', 'Montreal, QC', 45.49, -73.58, false],
  ['team_smuppy_fuelright', 'FuelRight Cabinet', 'nutrition', ['Nutrition', 'Fitness'], 'Sports nutrition consulting', 'Ottawa, ON', 45.41, -75.68, false],
  // golf
  ['team_smuppy_green_valley_golf', 'Green Valley Golf', 'golf', ['Golf', 'Fitness'], 'Premier golf course & academy', 'Scottsdale, AZ', 33.50, -111.92, true],
  ['team_smuppy_riverside_golf', 'Riverside Golf Club', 'golf', ['Golf'], 'Riverside golf with scenic views', 'Gatineau, QC', 45.47, -75.72, true],
  // cycling
  ['team_smuppy_velo_studio', 'Velo Studio', 'cycling', ['Cycling', 'Cardio', 'Fitness'], 'Indoor cycling studio', 'Portland, OR', 45.53, -122.66, true],
  ['team_smuppy_spincity', 'SpinCity Vancouver', 'cycling', ['Cycling', 'Mountain Biking', 'Cardio'], 'Spin & outdoor cycling club', 'Vancouver, BC', 49.27, -123.11, true],
  // mma
  ['team_smuppy_warrior_mma', 'Warrior MMA', 'mma', ['MMA', 'Boxing', 'BJJ'], 'MMA training facility | All levels', 'Las Vegas, NV', 36.16, -115.15, true],
  ['team_smuppy_apex_mma', 'Apex MMA', 'mma', ['MMA', 'Muay Thai', 'Kickboxing'], 'Complete MMA training center', 'Toronto, ON', 43.67, -79.39, true],
];

// ============================================
// 50 PERSONAL USERS (covering all 114 interest items)
// ============================================

const PERSONALS: PersonalT[] = [
  // Systematically covering all interest items
  ['team_smuppy_sport_fan_john', 'John Miller', ['Football', 'Basketball', 'Tennis'], 'Sports fanatic | Weekend warrior', 'Chicago, IL', 41.88, -87.63],
  ['team_smuppy_active_sarah', 'Sarah Bennett', ['Swimming', 'Running', 'Cycling'], 'Triathlon in training', 'Boston, MA', 42.36, -71.06],
  ['team_smuppy_golf_lover_mike', 'Mike Walsh', ['Golf', 'Volleyball'], 'Golf weekends & beach volleyball', 'Scottsdale, AZ', 33.49, -111.93],
  ['team_smuppy_gym_rat_alex', 'Alex Dubois', ['Gym', 'CrossFit', 'Weightlifting'], 'Gains over everything', 'Montreal, QC', 45.50, -73.57],
  ['team_smuppy_cardio_queen_lisa', 'Lisa Chang', ['Cardio', 'HIIT', 'Calisthenics'], 'Cardio addict | HIIT lover', 'Vancouver, BC', 49.28, -123.12],
  ['team_smuppy_pilates_paul', 'Paul Tremblay', ['Pilates', 'Stretching'], 'Pilates convert | Flexibility journey', 'Ottawa, ON', 45.42, -75.69],
  ['team_smuppy_zen_yogi_nina', 'Nina Kowalski', ['Yoga', 'Meditation', 'Nutrition'], 'Mind body soul journey', 'Sedona, AZ', 34.87, -111.76],
  ['team_smuppy_recovery_fan_dan', 'Dan Murphy', ['Spa & Recovery', 'Mental Health', 'Sleep'], 'Recovery is the workout', 'Dublin, Ireland', 53.35, -6.26],
  ['team_smuppy_mindful_emma', 'Emma Larsson', ['Mindfulness', 'Breathwork'], 'Daily meditation practitioner', 'Stockholm, Sweden', 59.33, 18.07],
  ['team_smuppy_hiker_tom', 'Tom Hartley', ['Hiking', 'Climbing', 'Surfing'], 'Mountain & ocean adventurer', 'Boulder, CO', 40.01, -105.27],
  ['team_smuppy_winter_maria', 'Maria Eriksen', ['Skiing', 'Camping', 'Trail Running'], 'Year-round outdoor athlete', 'Whistler, BC', 50.12, -122.95],
  ['team_smuppy_mtb_rider_jack', 'Jack Morrison', ['Mountain Biking', 'Kayaking'], 'MTB & paddle life', 'Ottawa, ON', 45.40, -75.70],
  ['team_smuppy_fight_fan_omar', 'Omar Diaz', ['Boxing', 'MMA', 'Judo'], 'Combat sports enthusiast', 'Las Vegas, NV', 36.17, -115.14],
  ['team_smuppy_martial_arts_yuki', 'Yuki Sato', ['Karate', 'Taekwondo', 'BJJ'], 'Black belt collector', 'Tokyo, Japan', 35.68, 139.69],
  ['team_smuppy_kickbox_lover_anna', 'Anna Petrov', ['Kickboxing', 'Muay Thai'], 'Kickboxing 3x/week', 'Bangkok, Thailand', 13.76, 100.50],
  ['team_smuppy_ocean_diver_coral', 'Coral James', ['Scuba Diving', 'Snorkeling', 'Wakeboarding'], 'Underwater explorer', 'Cairns, AU', -16.92, 145.77],
  ['team_smuppy_water_sports_liam', 'Liam Burke', ['Water Polo', 'Paddle Board', 'Sailing'], 'Water is my gym', 'San Diego, CA', 32.72, -117.16],
  ['team_smuppy_kite_surfer_max', 'Max Andersen', ['Kitesurfing', 'Rowing'], 'Wind & water chaser', 'Cape Town, SA', -33.93, 18.42],
  ['team_smuppy_team_player_james', 'James O\'Reilly', ['Rugby', 'Hockey', 'Handball'], 'Team sports all day', 'Dublin, Ireland', 53.34, -6.27],
  ['team_smuppy_cricket_fan_raj', 'Raj Gupta', ['Cricket', 'Baseball', 'Softball'], 'Bat & ball sports lover', 'Mumbai, India', 19.08, 72.88],
  ['team_smuppy_futsal_leo', 'Leo Santos', ['Lacrosse', 'Futsal'], 'Fast-paced sports', 'Sao Paulo, Brazil', -23.55, -46.63],
  ['team_smuppy_racket_pro_chen', 'Chen Li', ['Badminton', 'Squash', 'Table Tennis'], 'Racket sports addict', 'Beijing, China', 39.90, 116.40],
  ['team_smuppy_padel_fan_marco', 'Marco Garcia', ['Padel', 'Pickleball', 'Racquetball'], 'Padel is life', 'Madrid, Spain', 40.42, -3.70],
  ['team_smuppy_dancer_carmen', 'Carmen Lopez', ['Hip Hop', 'Salsa', 'Ballet'], 'Dancing through life', 'Barcelona, Spain', 41.39, 2.17],
  ['team_smuppy_dance_lover_sofia', 'Sofia Blanc', ['Contemporary', 'Zumba', 'Breakdance'], 'Movement is medicine', 'Paris, France', 48.86, 2.35],
  ['team_smuppy_pole_dancer_ivy', 'Ivy Robinson', ['Pole Dance', 'Latin Dance'], 'Pole & Latin dance journey', 'Austin, TX', 30.27, -97.74],
  ['team_smuppy_taichi_fan_wei', 'Wei Zhang', ['Tai Chi', 'Qigong', 'Relaxation'], 'Morning Tai Chi in the park', 'Shanghai, China', 31.23, 121.47],
  ['team_smuppy_selfcare_luna', 'Luna Diaz', ['Stress Relief', 'Self-Care', 'Holistic Health'], 'Self-care is not selfish', 'Tulum, MX', 20.21, -87.43],
  ['team_smuppy_skater_neo', 'Neo Park', ['Skateboarding', 'BMX', 'Parkour'], 'Streets are my playground', 'Los Angeles, CA', 34.04, -118.25],
  ['team_smuppy_adrenaline_kai', 'Kai Larsen', ['Skydiving', 'Bungee Jumping', 'Snowboarding'], 'Adrenaline junkie', 'Queenstown, NZ', -45.03, 168.66],
  ['team_smuppy_moto_rider_ryan', 'Ryan Fletcher', ['Motocross', 'Paragliding'], 'Speed & flight', 'Interlaken, CH', 46.69, 7.85],
  ['team_smuppy_healthy_eater_claire', 'Claire Fontaine', ['Healthy Eating', 'Active Living', 'Work-Life Balance'], 'Living my best balanced life', 'Ottawa, ON', 45.43, -75.69],
  ['team_smuppy_growth_minded_ash', 'Ash Patel Jr', ['Personal Growth', 'Motivation', 'Goal Setting'], 'Growing 1% every day', 'Toronto, ON', 43.65, -79.38],
  ['team_smuppy_ski_bum_erik', 'Erik Johansen', ['Alpine Skiing', 'Cross-Country Ski', 'Ice Skating'], 'Nordic winter sports', 'Oslo, Norway', 59.91, 10.75],
  ['team_smuppy_hockey_fan_marc', 'Marc Bouchard', ['Ice Hockey', 'Curling', 'Bobsled'], 'Canadian winter sports', 'Ottawa, ON', 45.42, -75.70],
  ['team_smuppy_track_star_usain', 'Usain Clarke', ['Sprinting', 'Long Distance', 'Hurdles'], 'Track & field athlete', 'Kingston, Jamaica', 18.00, -76.79],
  ['team_smuppy_field_athlete_olga', 'Olga Petrov', ['High Jump', 'Long Jump', 'Pole Vault'], 'Field events specialist', 'Moscow, Russia', 55.76, 37.62],
  ['team_smuppy_thrower_magnus', 'Magnus Borg', ['Shot Put', 'Javelin'], 'Shot put & javelin thrower', 'Stockholm, Sweden', 59.33, 18.07],
  ['team_smuppy_horse_rider_sophie', 'Sophie Laurent Jr', ['Horse Riding', 'Dressage', 'Show Jumping'], 'Equestrian life', 'Lexington, KY', 38.04, -84.50],
  ['team_smuppy_polo_player_carlos', 'Carlos Mendoza', ['Polo', 'Horse Riding'], 'Polo weekends', 'Buenos Aires, AR', -34.60, -58.38],
  ['team_smuppy_massage_lover_beth', 'Beth Taylor', ['Massage', 'Physiotherapy', 'Cryotherapy'], 'Recovery enthusiast', 'Denver, CO', 39.74, -104.99],
  ['team_smuppy_sauna_fan_mikko', 'Mikko Virtanen', ['Foam Rolling', 'Sauna', 'Ice Baths'], 'Finnish sauna culture', 'Helsinki, Finland', 60.17, 24.94],
  // Popular overlap users (43-50)
  ['team_smuppy_fit_beginner_pat', 'Pat Wilson', ['Running', 'Gym', 'Yoga'], 'Starting my fitness journey', 'Ottawa, ON', 45.41, -75.71],
  ['team_smuppy_weekend_warrior_sam', 'Sam Thompson', ['HIIT', 'Swimming', 'Hiking'], 'Weekend warrior', 'Calgary, AB', 51.05, -114.07],
  ['team_smuppy_active_mom_jen', 'Jennifer Davis', ['Boxing', 'CrossFit', 'Cycling'], 'Fit mom life', 'Toronto, ON', 43.64, -79.40],
  ['team_smuppy_surf_yogi_kai', 'Kai Mitchell', ['Surfing', 'Meditation', 'Climbing'], 'Surf & yoga lifestyle', 'Byron Bay, AU', -28.64, 153.61],
  ['team_smuppy_court_sport_dave', 'Dave Anderson', ['Tennis', 'Basketball', 'Cardio'], 'Court sports lover', 'Ottawa, ON', 45.40, -75.69],
  ['team_smuppy_snow_lover_heidi', 'Heidi Muller', ['Skiing', 'Snowboarding', 'Trail Running'], 'Mountain life year-round', 'Banff, AB', 51.18, -115.57],
  ['team_smuppy_fighter_chen', 'Chen Wang', ['MMA', 'Kickboxing', 'Weightlifting'], 'Train hard fight easy', 'Hong Kong', 22.32, 114.17],
  ['team_smuppy_stretch_yogi_mel', 'Mel Santos', ['Yoga', 'Pilates', 'Stretching'], 'Flexibility is freedom', 'Bali, Indonesia', -8.41, 115.19],
];

// ============================================
// SPOT DATA (300 spots) — filled in Part 2
// ============================================

const CANADA_SPOTS: SpotT[] = [
  // === OTTAWA AREA (42 spots) ===
  ['Mooney\'s Bay Beach', 'Ottawa', 'CA', 45.371, -75.687, 'spots', 'swimming'],
  ['Mooney\'s Bay Volleyball Courts', 'Ottawa', 'CA', 45.372, -75.686, 'sports', 'other'],
  ['Mooney\'s Bay Tennis Courts', 'Ottawa', 'CA', 45.370, -75.688, 'sports', 'tennis'],
  ['Rideau Canal Skateway', 'Ottawa', 'CA', 45.422, -75.692, 'spots', 'skating'],
  ['Rideau Canal Eastern Pathway', 'Ottawa', 'CA', 45.418, -75.685, 'spots', 'cycling'],
  ['Rideau Canal Western Pathway', 'Ottawa', 'CA', 45.415, -75.698, 'spots', 'running'],
  ['Gatineau Park — King Mountain Trail', 'Gatineau', 'CA', 45.500, -75.850, 'spots', 'hiking'],
  ['Gatineau Park — Luskville Falls Trail', 'Gatineau', 'CA', 45.530, -75.920, 'spots', 'hiking'],
  ['Gatineau Park — MTB Trails', 'Gatineau', 'CA', 45.505, -75.845, 'spots', 'cycling'],
  ['Gatineau Park — XC Ski Trails', 'Gatineau', 'CA', 45.510, -75.860, 'spots', 'skiing'],
  ['Jacques-Cartier Park', 'Gatineau', 'CA', 45.434, -75.696, 'spots', 'running'],
  ['Major\'s Hill Park', 'Ottawa', 'CA', 45.428, -75.694, 'spots', 'yoga'],
  ['Andrew Haydon Park', 'Ottawa', 'CA', 45.364, -75.787, 'spots', 'running'],
  ['Dow\'s Lake Pavilion', 'Ottawa', 'CA', 45.396, -75.699, 'spots', 'swimming'],
  ['Dow\'s Lake Paddleboard Rental', 'Ottawa', 'CA', 45.397, -75.700, 'spots', 'surfing'],
  ['Mer Bleue Bog Trail', 'Ottawa', 'CA', 45.395, -75.510, 'spots', 'hiking'],
  ['Stony Swamp Conservation Area', 'Ottawa', 'CA', 45.310, -75.820, 'spots', 'hiking'],
  ['Pine Grove Trail', 'Ottawa', 'CA', 45.312, -75.818, 'spots', 'running'],
  ['Camp Fortune Ski Resort', 'Chelsea', 'CA', 45.500, -75.835, 'spots', 'skiing'],
  ['Ottawa River — Bate Island Kayak Launch', 'Ottawa', 'CA', 45.413, -75.725, 'spots', 'surfing'],
  ['Ottawa River — Remic Rapids', 'Ottawa', 'CA', 45.406, -75.735, 'spots', 'swimming'],
  ['Brewer Park', 'Ottawa', 'CA', 45.395, -75.689, 'sports', 'football'],
  ['Lansdowne Park', 'Ottawa', 'CA', 45.399, -75.683, 'sports', 'football'],
  ['Britannia Beach', 'Ottawa', 'CA', 45.359, -75.797, 'spots', 'swimming'],
  ['Petrie Island Beach', 'Ottawa', 'CA', 45.493, -75.504, 'spots', 'swimming'],
  ['Hog\'s Back Falls', 'Ottawa', 'CA', 45.382, -75.696, 'spots', 'hiking'],
  ['Vincent Massey Park', 'Ottawa', 'CA', 45.387, -75.718, 'spots', 'running'],
  ['NCC Multi-Use Pathway — Colonel By', 'Ottawa', 'CA', 45.410, -75.688, 'spots', 'cycling'],
  ['NCC Multi-Use Pathway — Sir John A.', 'Ottawa', 'CA', 45.408, -75.720, 'spots', 'running'],
  ['Sandy Hill Outdoor Basketball Court', 'Ottawa', 'CA', 45.424, -75.680, 'sports', 'basketball'],
  ['ByWard Market Calisthenics Park', 'Ottawa', 'CA', 45.428, -75.691, 'sports', 'fitness'],
  ['Strathcona Park', 'Ottawa', 'CA', 45.427, -75.677, 'spots', 'running'],
  ['Riverside South Community Fields', 'Ottawa', 'CA', 45.322, -75.650, 'sports', 'football'],
  ['Carleton University Gym', 'Ottawa', 'CA', 45.385, -75.696, 'gyms', 'fitness'],
  ['University of Ottawa Sports Complex', 'Ottawa', 'CA', 45.423, -75.685, 'gyms', 'fitness'],
  ['Altitude Gym Gatineau', 'Gatineau', 'CA', 45.475, -75.701, 'gyms', 'climbing'],
  ['Coyote Rock Gym', 'Ottawa', 'CA', 45.393, -75.669, 'gyms', 'climbing'],
  ['Greco Lean & Fit Ottawa', 'Ottawa', 'CA', 45.416, -75.670, 'gyms', 'fitness'],
  ['Goodlife Fitness Rideau', 'Ottawa', 'CA', 45.425, -75.690, 'gyms', 'fitness'],
  ['Ottawa Athletic Club', 'Ottawa', 'CA', 45.389, -75.710, 'sports', 'tennis'],
  ['Hintonburg Community Centre Courts', 'Ottawa', 'CA', 45.400, -75.730, 'sports', 'basketball'],
  ['Kanata CrossFit Box', 'Ottawa', 'CA', 45.346, -75.910, 'gyms', 'fitness'],
  // === MONTREAL (16 spots) ===
  ['Mount Royal Summit Trail', 'Montreal', 'CA', 45.508, -73.588, 'spots', 'hiking'],
  ['Mount Royal — Beaver Lake', 'Montreal', 'CA', 45.499, -73.596, 'spots', 'running'],
  ['Old Port of Montreal', 'Montreal', 'CA', 45.504, -73.553, 'spots', 'cycling'],
  ['Lachine Canal Bike Path', 'Montreal', 'CA', 45.477, -73.580, 'spots', 'cycling'],
  ['Parc Jean-Drapeau', 'Montreal', 'CA', 45.514, -73.534, 'spots', 'running'],
  ['Parc La Fontaine', 'Montreal', 'CA', 45.522, -73.569, 'spots', 'running'],
  ['Circuit Gilles Villeneuve Track', 'Montreal', 'CA', 45.505, -73.525, 'spots', 'cycling'],
  ['Parc Maisonneuve', 'Montreal', 'CA', 45.555, -73.548, 'sports', 'football'],
  ['Centre Sportif Claude-Robillard', 'Montreal', 'CA', 45.534, -73.627, 'gyms', 'swimming'],
  ['Bota Bota Spa', 'Montreal', 'CA', 45.500, -73.553, 'wellness', 'yoga'],
  ['Allez Up Climbing Gym', 'Montreal', 'CA', 45.478, -73.569, 'gyms', 'climbing'],
  ['Mile End Calisthenics Park', 'Montreal', 'CA', 45.524, -73.600, 'sports', 'fitness'],
  ['Complexe Sportif Claude-Robillard Pool', 'Montreal', 'CA', 45.535, -73.626, 'spots', 'swimming'],
  ['Verdun Beach', 'Montreal', 'CA', 45.453, -73.572, 'spots', 'swimming'],
  ['Mont Tremblant Ski Resort', 'Mont-Tremblant', 'CA', 46.209, -74.585, 'spots', 'skiing'],
  ['Mont-Sainte-Anne Trails', 'Beaupré', 'CA', 47.075, -70.907, 'spots', 'hiking'],
  // === TORONTO (16 spots) ===
  ['High Park Trails', 'Toronto', 'CA', 43.647, -79.463, 'spots', 'hiking'],
  ['Scarborough Bluffs Trail', 'Toronto', 'CA', 43.707, -79.231, 'spots', 'hiking'],
  ['Cherry Beach', 'Toronto', 'CA', 43.637, -79.350, 'spots', 'swimming'],
  ['Don Valley Trail System', 'Toronto', 'CA', 43.680, -79.362, 'spots', 'running'],
  ['Tommy Thompson Park', 'Toronto', 'CA', 43.630, -79.337, 'spots', 'cycling'],
  ['Toronto Islands — Centre Island', 'Toronto', 'CA', 43.621, -79.376, 'spots', 'cycling'],
  ['Harbourfront Wave Deck', 'Toronto', 'CA', 43.638, -79.382, 'spots', 'running'],
  ['Humber Bay Shores Park', 'Toronto', 'CA', 43.622, -79.478, 'spots', 'running'],
  ['Boulderz Climbing Centre', 'Toronto', 'CA', 43.660, -79.331, 'gyms', 'climbing'],
  ['Junction Climb', 'Toronto', 'CA', 43.663, -79.463, 'gyms', 'climbing'],
  ['Kew Gardens Tennis Courts', 'Toronto', 'CA', 43.669, -79.298, 'sports', 'tennis'],
  ['Toronto Pan Am Sports Centre', 'Toronto', 'CA', 43.787, -79.192, 'gyms', 'swimming'],
  ['Nathan Phillips Square Ice Rink', 'Toronto', 'CA', 43.652, -79.383, 'spots', 'skating'],
  ['Woodbine Beach Volleyball', 'Toronto', 'CA', 43.659, -79.306, 'sports', 'other'],
  ['Evergreen Brick Works Trails', 'Toronto', 'CA', 43.685, -79.365, 'spots', 'hiking'],
  ['Rouge National Urban Park', 'Toronto', 'CA', 43.808, -79.174, 'spots', 'hiking'],
  // === VANCOUVER / BC (16 spots) ===
  ['Stanley Park Seawall', 'Vancouver', 'CA', 49.301, -123.144, 'spots', 'cycling'],
  ['Grouse Grind Trail', 'North Vancouver', 'CA', 49.370, -123.085, 'spots', 'hiking'],
  ['Tofino — Cox Bay Surf', 'Tofino', 'CA', 49.102, -125.888, 'spots', 'surfing'],
  ['Whistler Mountain Bike Park', 'Whistler', 'CA', 50.115, -122.954, 'spots', 'cycling'],
  ['English Bay Beach', 'Vancouver', 'CA', 49.286, -123.143, 'spots', 'swimming'],
  ['Kitsilano Beach', 'Vancouver', 'CA', 49.274, -123.154, 'spots', 'swimming'],
  ['Lynn Canyon Trails', 'North Vancouver', 'CA', 49.340, -123.021, 'spots', 'hiking'],
  ['Squamish Chief Trail', 'Squamish', 'CA', 49.682, -123.143, 'spots', 'climbing'],
  ['Jericho Beach', 'Vancouver', 'CA', 49.272, -123.192, 'spots', 'running'],
  ['Pacific Spirit Regional Park', 'Vancouver', 'CA', 49.258, -123.210, 'spots', 'running'],
  ['Deep Cove Kayaking', 'North Vancouver', 'CA', 49.328, -122.946, 'spots', 'surfing'],
  ['Hive Bouldering Gym', 'Vancouver', 'CA', 49.264, -123.100, 'gyms', 'climbing'],
  ['Cypress Mountain Ski Area', 'West Vancouver', 'CA', 49.395, -123.205, 'spots', 'skiing'],
  ['Spanish Banks Beach', 'Vancouver', 'CA', 49.275, -123.226, 'spots', 'running'],
  ['Burnaby Mountain Trail', 'Burnaby', 'CA', 49.280, -122.950, 'spots', 'hiking'],
  ['Victoria Inner Harbour', 'Victoria', 'CA', 48.422, -123.370, 'spots', 'running'],
  // === ALBERTA (12 spots) ===
  ['Johnston Canyon Trail', 'Banff', 'CA', 51.245, -115.839, 'spots', 'hiking'],
  ['Lake Louise Lakeshore Trail', 'Lake Louise', 'CA', 51.416, -116.178, 'spots', 'hiking'],
  ['Kananaskis Country — Grassi Lakes', 'Canmore', 'CA', 50.893, -115.393, 'spots', 'hiking'],
  ['Jasper SkyTram Trails', 'Jasper', 'CA', 52.862, -118.065, 'spots', 'hiking'],
  ['Nose Hill Park', 'Calgary', 'CA', 51.114, -114.102, 'spots', 'running'],
  ['Prince\'s Island Park', 'Calgary', 'CA', 51.055, -114.073, 'spots', 'running'],
  ['Bow River Pathway', 'Calgary', 'CA', 51.045, -114.060, 'spots', 'cycling'],
  ['COP — WinSport Ski Hill', 'Calgary', 'CA', 51.082, -114.202, 'spots', 'skiing'],
  ['Sunshine Village Ski Resort', 'Banff', 'CA', 51.073, -115.774, 'spots', 'skiing'],
  ['Canmore Nordic Centre', 'Canmore', 'CA', 51.051, -115.326, 'spots', 'skiing'],
  ['Edmonton River Valley Trails', 'Edmonton', 'CA', 53.530, -113.508, 'spots', 'running'],
  ['Lake Minnewanka Trail', 'Banff', 'CA', 51.291, -115.524, 'spots', 'hiking'],
  // === REST OF CANADA (18 spots) ===
  ['Halifax Waterfront Boardwalk', 'Halifax', 'CA', 44.648, -63.571, 'spots', 'running'],
  ['Point Pleasant Park', 'Halifax', 'CA', 44.622, -63.569, 'spots', 'hiking'],
  ['Cabot Trail — Skyline Trail', 'Ingonish', 'CA', 46.756, -60.900, 'spots', 'hiking'],
  ['Plaines d\'Abraham', 'Quebec City', 'CA', 46.800, -71.225, 'spots', 'running'],
  ['Mont Sainte-Anne Ski', 'Quebec City', 'CA', 47.076, -70.907, 'spots', 'skiing'],
  ['Montmorency Falls Trail', 'Quebec City', 'CA', 46.890, -71.148, 'spots', 'hiking'],
  ['The Forks Skating Trail', 'Winnipeg', 'CA', 49.887, -97.131, 'spots', 'skating'],
  ['Assiniboine Park', 'Winnipeg', 'CA', 49.869, -97.225, 'spots', 'running'],
  ['Churchill Beluga Kayak', 'Churchill', 'CA', 58.767, -94.165, 'spots', 'surfing'],
  ['Wascana Park', 'Regina', 'CA', 50.430, -104.609, 'spots', 'running'],
  ['Meewasin Trail', 'Saskatoon', 'CA', 52.125, -106.655, 'spots', 'cycling'],
  ['Signal Hill Trail', 'St. John\'s', 'CA', 47.570, -52.681, 'spots', 'hiking'],
  ['East Coast Trail', 'St. John\'s', 'CA', 47.567, -52.704, 'spots', 'hiking'],
  ['Niagara Glen Trail', 'Niagara Falls', 'CA', 43.143, -79.053, 'spots', 'hiking'],
  ['Niagara Gorge Climbing', 'Niagara Falls', 'CA', 43.140, -79.055, 'spots', 'climbing'],
  ['Bruce Peninsula Grotto', 'Tobermory', 'CA', 45.241, -81.525, 'spots', 'swimming'],
  ['Kelowna City Park Beach', 'Kelowna', 'CA', 49.883, -119.496, 'spots', 'swimming'],
  ['Pacific Rim National Park', 'Ucluelet', 'CA', 48.977, -125.672, 'spots', 'surfing'],
];

const USA_SPOTS: SpotT[] = [
  // === CALIFORNIA (20 spots) ===
  ['Venice Beach Muscle Beach', 'Los Angeles', 'US', 33.985, -118.472, 'gyms', 'fitness'],
  ['Griffith Park Trails', 'Los Angeles', 'US', 34.137, -118.300, 'spots', 'hiking'],
  ['Runyon Canyon Park', 'Los Angeles', 'US', 34.106, -118.348, 'spots', 'hiking'],
  ['Santa Monica Beach', 'Santa Monica', 'US', 34.010, -118.497, 'spots', 'swimming'],
  ['Yosemite — Mist Trail', 'Yosemite', 'US', 37.735, -119.558, 'spots', 'hiking'],
  ['Mission Beach Boardwalk', 'San Diego', 'US', 32.770, -117.252, 'spots', 'running'],
  ['Golden Gate Park', 'San Francisco', 'US', 37.769, -122.486, 'spots', 'cycling'],
  ['Baker Beach', 'San Francisco', 'US', 37.793, -122.483, 'spots', 'swimming'],
  ['Torrey Pines State Reserve', 'San Diego', 'US', 32.920, -117.253, 'spots', 'hiking'],
  ['Malibu Surfrider Beach', 'Malibu', 'US', 34.035, -118.682, 'spots', 'surfing'],
  ['Joshua Tree — Ryan Mountain Trail', 'Joshua Tree', 'US', 33.988, -116.134, 'spots', 'climbing'],
  ['Lake Tahoe — Emerald Bay Trail', 'South Lake Tahoe', 'US', 38.952, -120.108, 'spots', 'hiking'],
  ['Huntington Beach Surf', 'Huntington Beach', 'US', 33.655, -117.999, 'spots', 'surfing'],
  ['Marin Headlands Trails', 'Sausalito', 'US', 37.831, -122.499, 'spots', 'hiking'],
  ['LA Fitness Silver Lake', 'Los Angeles', 'US', 34.081, -118.261, 'gyms', 'fitness'],
  ['Trestles Surf Break', 'San Clemente', 'US', 33.383, -117.589, 'spots', 'surfing'],
  ['Big Sur — Pfeiffer Falls Trail', 'Big Sur', 'US', 36.240, -121.783, 'spots', 'hiking'],
  ['Sender One Climbing Gym', 'Los Angeles', 'US', 34.020, -118.456, 'gyms', 'climbing'],
  ['Presidio Coastal Trail', 'San Francisco', 'US', 37.799, -122.475, 'spots', 'running'],
  ['Mammoth Mountain Ski', 'Mammoth Lakes', 'US', 37.631, -119.032, 'spots', 'skiing'],
  // === NEW YORK (10 spots) ===
  ['Central Park Running Loop', 'New York', 'US', 40.782, -73.965, 'spots', 'running'],
  ['Brooklyn Bridge Park', 'New York', 'US', 40.700, -73.996, 'spots', 'running'],
  ['Hudson River Greenway', 'New York', 'US', 40.735, -74.010, 'spots', 'cycling'],
  ['Prospect Park Loop', 'New York', 'US', 40.662, -73.969, 'spots', 'running'],
  ['Chelsea Piers Sports Complex', 'New York', 'US', 40.747, -74.008, 'gyms', 'fitness'],
  ['The Cliffs Climbing Gym', 'New York', 'US', 40.679, -73.996, 'gyms', 'climbing'],
  ['Rockaway Beach Surf', 'New York', 'US', 40.583, -73.816, 'spots', 'surfing'],
  ['Randall\'s Island Sports Fields', 'New York', 'US', 40.793, -73.922, 'sports', 'football'],
  ['Central Park Tennis Center', 'New York', 'US', 40.795, -73.959, 'sports', 'tennis'],
  ['East River Esplanade', 'New York', 'US', 40.750, -73.970, 'spots', 'running'],
  // === FLORIDA (10 spots) ===
  ['South Beach', 'Miami', 'US', 25.783, -80.130, 'spots', 'swimming'],
  ['Bayfront Park', 'Miami', 'US', 25.774, -80.186, 'spots', 'running'],
  ['Oleta River State Park', 'Miami', 'US', 25.925, -80.142, 'spots', 'cycling'],
  ['Tampa Riverwalk', 'Tampa', 'US', 27.945, -82.460, 'spots', 'running'],
  ['Everglades — Anhinga Trail', 'Homestead', 'US', 25.395, -80.613, 'spots', 'hiking'],
  ['Key West — Smathers Beach', 'Key West', 'US', 24.549, -81.771, 'spots', 'swimming'],
  ['Cocoa Beach Surf', 'Cocoa Beach', 'US', 28.347, -80.607, 'spots', 'surfing'],
  ['St. Pete Beach', 'St. Petersburg', 'US', 27.726, -82.739, 'spots', 'swimming'],
  ['Ichetucknee Springs — Tubing', 'Fort White', 'US', 29.984, -82.762, 'spots', 'swimming'],
  ['Jacksonville Beach Running Path', 'Jacksonville', 'US', 30.286, -81.396, 'spots', 'running'],
  // === COLORADO (10 spots) ===
  ['Red Rocks Amphitheatre Trails', 'Morrison', 'US', 39.665, -105.205, 'spots', 'hiking'],
  ['Boulder — Flatirons Trail', 'Boulder', 'US', 39.988, -105.292, 'spots', 'hiking'],
  ['Vail Ski Resort', 'Vail', 'US', 39.640, -106.374, 'spots', 'skiing'],
  ['Breckenridge Ski Resort', 'Breckenridge', 'US', 39.481, -106.066, 'spots', 'skiing'],
  ['Garden of the Gods', 'Colorado Springs', 'US', 38.878, -104.870, 'spots', 'hiking'],
  ['Cherry Creek Trail', 'Denver', 'US', 39.715, -104.949, 'spots', 'running'],
  ['Eldorado Canyon Climbing', 'Eldorado Springs', 'US', 39.931, -105.284, 'spots', 'climbing'],
  ['Steamboat Springs Ski', 'Steamboat Springs', 'US', 40.457, -106.804, 'spots', 'skiing'],
  ['Movement Climbing Gym Denver', 'Denver', 'US', 39.753, -104.987, 'gyms', 'climbing'],
  ['Sloan\'s Lake Park', 'Denver', 'US', 39.750, -105.032, 'spots', 'running'],
  // === HAWAII (5 spots) ===
  ['Pipeline — Banzai Beach', 'Haleiwa', 'US', 21.664, -158.051, 'spots', 'surfing'],
  ['Waikiki Beach', 'Honolulu', 'US', 21.276, -157.827, 'spots', 'surfing'],
  ['Maui — Haleakala Summit Trail', 'Maui', 'US', 20.713, -156.154, 'spots', 'hiking'],
  ['Diamond Head Trail', 'Honolulu', 'US', 21.260, -157.805, 'spots', 'hiking'],
  ['Kailua Beach', 'Kailua', 'US', 21.393, -157.726, 'spots', 'swimming'],
  // === REST OF USA (45 spots) ===
  // Arizona
  ['Camelback Mountain Trail', 'Phoenix', 'US', 33.522, -111.970, 'spots', 'hiking'],
  ['Sedona — Cathedral Rock Trail', 'Sedona', 'US', 34.830, -111.788, 'spots', 'hiking'],
  // Texas
  ['Lady Bird Lake Hike & Bike Trail', 'Austin', 'US', 30.262, -97.752, 'spots', 'running'],
  ['Barton Springs Pool', 'Austin', 'US', 30.264, -97.771, 'spots', 'swimming'],
  ['Katy Trail', 'Dallas', 'US', 32.809, -96.800, 'spots', 'running'],
  ['Buffalo Bayou Park', 'Houston', 'US', 29.764, -95.386, 'spots', 'cycling'],
  ['San Antonio Riverwalk', 'San Antonio', 'US', 29.423, -98.489, 'spots', 'running'],
  // Oregon
  ['Forest Park — Wildwood Trail', 'Portland', 'US', 45.537, -122.756, 'spots', 'hiking'],
  ['Columbia River Gorge — Multnomah Falls', 'Portland', 'US', 45.576, -122.116, 'spots', 'hiking'],
  ['Smith Rock Climbing', 'Terrebonne', 'US', 44.363, -121.142, 'spots', 'climbing'],
  ['Bend — Phil\'s Trail MTB', 'Bend', 'US', 44.037, -121.375, 'spots', 'cycling'],
  // Washington
  ['Discovery Park Trail', 'Seattle', 'US', 47.661, -122.415, 'spots', 'hiking'],
  ['Green Lake Running Path', 'Seattle', 'US', 47.680, -122.340, 'spots', 'running'],
  ['Mount Rainier — Skyline Trail', 'Ashford', 'US', 46.786, -121.735, 'spots', 'hiking'],
  ['Seattle Bouldering Project', 'Seattle', 'US', 47.564, -122.332, 'gyms', 'climbing'],
  // Massachusetts
  ['Charles River Esplanade', 'Boston', 'US', 42.357, -71.075, 'spots', 'running'],
  ['Boston Harbor Kayaking', 'Boston', 'US', 42.359, -71.048, 'spots', 'surfing'],
  ['Cape Cod — Race Point Beach', 'Provincetown', 'US', 42.075, -70.188, 'spots', 'swimming'],
  // Pennsylvania
  ['Wissahickon Valley Trail', 'Philadelphia', 'US', 40.033, -75.206, 'spots', 'hiking'],
  ['Schuylkill River Trail', 'Philadelphia', 'US', 39.966, -75.183, 'spots', 'cycling'],
  // Illinois
  ['Chicago Lakefront Trail', 'Chicago', 'US', 41.896, -87.614, 'spots', 'running'],
  ['Millennium Park Fitness', 'Chicago', 'US', 41.882, -87.623, 'spots', 'yoga'],
  // Minnesota
  ['Chain of Lakes Running Path', 'Minneapolis', 'US', 44.952, -93.307, 'spots', 'running'],
  ['Theodore Wirth Park MTB', 'Minneapolis', 'US', 44.998, -93.324, 'spots', 'cycling'],
  // Utah
  ['Zion — Angels Landing Trail', 'Springdale', 'US', 37.269, -112.948, 'spots', 'hiking'],
  ['Moab — Slickrock Bike Trail', 'Moab', 'US', 38.585, -109.538, 'spots', 'cycling'],
  ['Arches National Park — Delicate Arch Trail', 'Moab', 'US', 38.743, -109.499, 'spots', 'hiking'],
  // Nevada
  ['Red Rock Canyon — Calico Tanks Trail', 'Las Vegas', 'US', 36.143, -115.455, 'spots', 'hiking'],
  ['Las Vegas Athletic Club', 'Las Vegas', 'US', 36.116, -115.174, 'gyms', 'fitness'],
  // Georgia
  ['Piedmont Park', 'Atlanta', 'US', 33.787, -84.374, 'spots', 'running'],
  ['Stone Mountain Trail', 'Stone Mountain', 'US', 33.806, -84.145, 'spots', 'hiking'],
  // North Carolina
  ['Blue Ridge Parkway — Craggy Gardens', 'Asheville', 'US', 35.607, -82.378, 'spots', 'hiking'],
  ['Wrightsville Beach Surf', 'Wrightsville Beach', 'US', 34.210, -77.796, 'spots', 'surfing'],
  // Tennessee
  ['Percy Warner Park Trails', 'Nashville', 'US', 36.070, -86.872, 'spots', 'hiking'],
  // Michigan
  ['Sleeping Bear Dunes Trail', 'Empire', 'US', 44.876, -86.059, 'spots', 'hiking'],
  // Montana
  ['Glacier NP — Highline Trail', 'West Glacier', 'US', 48.697, -113.782, 'spots', 'hiking'],
  // Wyoming
  ['Grand Teton — Cascade Canyon', 'Moose', 'US', 43.746, -110.808, 'spots', 'hiking'],
  // New Mexico
  ['Tent Rocks Trail', 'Cochiti', 'US', 35.674, -106.411, 'spots', 'hiking'],
  ['Santa Fe — Dale Ball Trails', 'Santa Fe', 'US', 35.680, -105.920, 'spots', 'running'],
  // Wisconsin
  ['Devil\'s Lake State Park Trail', 'Baraboo', 'US', 43.420, -89.729, 'spots', 'hiking'],
  // Connecticut
  ['West Hartford Reservoir Trail', 'West Hartford', 'US', 41.748, -72.754, 'spots', 'running'],
  // Louisiana
  ['City Park New Orleans', 'New Orleans', 'US', 29.988, -90.095, 'spots', 'running'],
  // Virginia
  ['Shenandoah NP — Old Rag Mountain', 'Sperryville', 'US', 38.551, -78.316, 'spots', 'hiking'],
  ['Mount Vernon Trail', 'Alexandria', 'US', 38.785, -77.058, 'spots', 'cycling'],
  // Maryland
  ['Chesapeake Bay Kayaking', 'Annapolis', 'US', 38.978, -76.493, 'spots', 'surfing'],
];

const WORLD_SPOTS: SpotT[] = [
  // === EUROPE (25 spots) ===
  ['Chamonix — Aiguille du Midi Trail', 'Chamonix', 'FR', 45.923, 6.870, 'spots', 'climbing'],
  ['Fontainebleau Bouldering Forest', 'Fontainebleau', 'FR', 48.404, 2.699, 'spots', 'climbing'],
  ['Barceloneta Beach', 'Barcelona', 'ES', 41.378, 2.189, 'spots', 'swimming'],
  ['Montjuic Running Path', 'Barcelona', 'ES', 41.364, 2.160, 'spots', 'running'],
  ['Mallorca — Cap de Formentor Cycling', 'Mallorca', 'ES', 39.962, 3.213, 'spots', 'cycling'],
  ['Hyde Park', 'London', 'GB', 51.507, -0.164, 'spots', 'running'],
  ['Hampstead Heath', 'London', 'GB', 51.561, -0.164, 'spots', 'swimming'],
  ['Regent\'s Park Running Track', 'London', 'GB', 51.528, -0.154, 'spots', 'running'],
  ['Jardin du Luxembourg', 'Paris', 'FR', 48.846, 2.337, 'spots', 'running'],
  ['Bois de Boulogne', 'Paris', 'FR', 48.862, 2.249, 'spots', 'cycling'],
  ['Zermatt — Matterhorn Trail', 'Zermatt', 'CH', 46.020, 7.749, 'spots', 'hiking'],
  ['Verbier Ski Resort', 'Verbier', 'CH', 46.097, 7.229, 'spots', 'skiing'],
  ['Englischer Garten', 'Munich', 'DE', 48.163, 11.596, 'spots', 'surfing'],
  ['Tiergarten Park', 'Berlin', 'DE', 52.514, 13.350, 'spots', 'running'],
  ['Prater Park', 'Vienna', 'AT', 48.214, 16.400, 'spots', 'running'],
  ['Algarve — Sagres Surf Beach', 'Sagres', 'PT', 37.004, -8.939, 'spots', 'surfing'],
  ['Lisbon — Cascais Coastal Path', 'Cascais', 'PT', 38.697, -9.423, 'spots', 'running'],
  ['Kalymnos Climbing Island', 'Kalymnos', 'GR', 36.951, 26.987, 'spots', 'climbing'],
  ['Santorini — Fira to Oia Hike', 'Santorini', 'GR', 36.416, 25.432, 'spots', 'hiking'],
  ['Dolomites — Tre Cime di Lavaredo', 'Cortina', 'IT', 46.611, 12.295, 'spots', 'hiking'],
  ['Cinque Terre Coastal Trail', 'La Spezia', 'IT', 44.127, 9.711, 'spots', 'hiking'],
  ['Lofoten Islands — Reinebringen Trail', 'Reine', 'NO', 67.932, 13.085, 'spots', 'hiking'],
  ['Holmenkollen Cross-Country Ski', 'Oslo', 'NO', 59.963, 10.668, 'spots', 'skiing'],
  ['Killarney National Park Trails', 'Killarney', 'IE', 51.981, -9.544, 'spots', 'hiking'],
  ['Edinburgh — Arthur\'s Seat Trail', 'Edinburgh', 'GB', 55.944, -3.162, 'spots', 'hiking'],
  // === ASIA (20 spots) ===
  ['Bali — Uluwatu Surf Break', 'Uluwatu', 'ID', -8.829, 115.085, 'spots', 'surfing'],
  ['Bali — Padang Padang Beach', 'Pecatu', 'ID', -8.808, 115.100, 'spots', 'surfing'],
  ['Bali — Ubud Yoga Barn', 'Ubud', 'ID', -8.504, 115.264, 'wellness', 'yoga'],
  ['Rishikesh — Ganga Yoga Ashrams', 'Rishikesh', 'IN', 30.086, 78.268, 'wellness', 'yoga'],
  ['Rishikesh — Bungee Jumping', 'Rishikesh', 'IN', 30.120, 78.295, 'spots', 'other'],
  ['Phuket — Kata Beach', 'Phuket', 'TH', 7.817, 98.297, 'spots', 'surfing'],
  ['Phuket — Muay Thai Gym', 'Phuket', 'TH', 7.885, 98.387, 'gyms', 'other'],
  ['Bangkok — Lumpini Park', 'Bangkok', 'TH', 13.731, 100.541, 'spots', 'running'],
  ['Bangkok — RSM Muay Thai Academy', 'Bangkok', 'TH', 13.738, 100.550, 'gyms', 'other'],
  ['Tokyo — Yoyogi Park', 'Tokyo', 'JP', 35.672, 139.695, 'spots', 'running'],
  ['Tokyo — Meiji Jingu Running Path', 'Tokyo', 'JP', 35.676, 139.699, 'spots', 'running'],
  ['Taipei — Elephant Mountain Trail', 'Taipei', 'TW', 25.027, 121.557, 'spots', 'hiking'],
  ['Seoul — Bukhansan National Park', 'Seoul', 'KR', 37.660, 126.986, 'spots', 'hiking'],
  ['Hong Kong — Dragon\'s Back Trail', 'Hong Kong', 'HK', 22.243, 114.230, 'spots', 'hiking'],
  ['Siargao — Cloud 9 Surf Break', 'Siargao', 'PH', 9.838, 126.170, 'spots', 'surfing'],
  ['Railay Beach Climbing', 'Krabi', 'TH', 8.013, 98.838, 'spots', 'climbing'],
  ['Sri Lanka — Mirissa Surf Beach', 'Mirissa', 'LK', 5.945, 80.456, 'spots', 'surfing'],
  ['Hampi Bouldering', 'Hampi', 'IN', 15.335, 76.461, 'spots', 'climbing'],
  ['Kathmandu — Annapurna Base Camp Trek', 'Pokhara', 'NP', 28.530, 83.877, 'spots', 'hiking'],
  ['Singapore — East Coast Park', 'Singapore', 'SG', 1.301, 103.912, 'spots', 'cycling'],
  // === OCEANIA (10 spots) ===
  ['Bondi Beach', 'Sydney', 'AU', -33.891, 151.275, 'spots', 'surfing'],
  ['Bondi to Coogee Coastal Walk', 'Sydney', 'AU', -33.893, 151.274, 'spots', 'hiking'],
  ['Gold Coast — Snapper Rocks Surf', 'Gold Coast', 'AU', -28.168, 153.543, 'spots', 'surfing'],
  ['Blue Mountains — Three Sisters Trail', 'Katoomba', 'AU', -33.732, 150.312, 'spots', 'hiking'],
  ['Melbourne — Tan Running Track', 'Melbourne', 'AU', -37.831, 144.979, 'spots', 'running'],
  ['Noosa National Park Trails', 'Noosa', 'AU', -26.381, 153.098, 'spots', 'hiking'],
  ['Queenstown — Remarkables Ski', 'Queenstown', 'NZ', -45.054, 168.726, 'spots', 'skiing'],
  ['Milford Track Great Walk', 'Te Anau', 'NZ', -44.870, 167.929, 'spots', 'hiking'],
  ['Tongariro Alpine Crossing', 'Taupo', 'NZ', -39.234, 175.649, 'spots', 'hiking'],
  ['Abel Tasman Coastal Track', 'Nelson', 'NZ', -40.865, 173.008, 'spots', 'hiking'],
  // === SOUTH AMERICA (10 spots) ===
  ['Copacabana Beach', 'Rio de Janeiro', 'BR', -22.971, -43.183, 'spots', 'swimming'],
  ['Ipanema Beach Volleyball', 'Rio de Janeiro', 'BR', -22.983, -43.205, 'sports', 'other'],
  ['Sugarloaf Mountain Trail', 'Rio de Janeiro', 'BR', -22.948, -43.157, 'spots', 'hiking'],
  ['Patagonia — Torres del Paine W Trek', 'Puerto Natales', 'CL', -50.942, -73.406, 'spots', 'hiking'],
  ['Mendoza — Aconcagua Approach', 'Mendoza', 'AR', -32.653, -70.011, 'spots', 'hiking'],
  ['Bariloche — Cerro Catedral Ski', 'Bariloche', 'AR', -41.167, -71.445, 'spots', 'skiing'],
  ['Medellin — Parque Arvi Trails', 'Medellin', 'CO', 6.281, -75.499, 'spots', 'hiking'],
  ['Lima — Costa Verde Surf', 'Lima', 'PE', -12.133, -77.030, 'spots', 'surfing'],
  ['Cusco — Inca Trail', 'Cusco', 'PE', -13.163, -72.546, 'spots', 'hiking'],
  ['Huaraz — Laguna 69 Trek', 'Huaraz', 'PE', -9.023, -77.617, 'spots', 'hiking'],
  // === AFRICA / MIDDLE EAST (10 spots) ===
  ['Dubai — Kite Beach Fitness Area', 'Dubai', 'AE', 25.148, 55.196, 'spots', 'fitness'],
  ['Dubai — Al Qudra Cycling Track', 'Dubai', 'AE', 25.003, 55.217, 'spots', 'cycling'],
  ['Cape Town — Lion\'s Head Trail', 'Cape Town', 'ZA', -33.935, 18.389, 'spots', 'hiking'],
  ['Cape Town — Table Mountain', 'Cape Town', 'ZA', -33.957, 18.403, 'spots', 'hiking'],
  ['Muizenberg Beach Surf', 'Cape Town', 'ZA', -34.108, 18.474, 'spots', 'surfing'],
  ['Marrakech — Toubkal Summit Trek', 'Imlil', 'MA', 31.137, -7.920, 'spots', 'hiking'],
  ['Dahab — Blue Hole Dive Site', 'Dahab', 'EG', 28.572, 34.540, 'spots', 'swimming'],
  ['Kilimanjaro — Machame Route', 'Moshi', 'TZ', -3.076, 37.353, 'spots', 'hiking'],
  ['Zanzibar — Nungwi Beach', 'Zanzibar', 'TZ', -5.727, 39.298, 'spots', 'swimming'],
  ['Dead Sea — Ein Gedi Trail', 'Ein Gedi', 'IL', 31.460, 35.391, 'spots', 'hiking'],
  // === MEXICO / CARIBBEAN (5 spots) ===
  ['Tulum Beach', 'Tulum', 'MX', 20.214, -87.429, 'spots', 'swimming'],
  ['Tulum Yoga Retreat', 'Tulum', 'MX', 20.210, -87.465, 'wellness', 'yoga'],
  ['Cancun — Playa Delfines', 'Cancun', 'MX', 21.082, -86.782, 'spots', 'swimming'],
  ['Puerto Escondido — Zicatela Surf', 'Puerto Escondido', 'MX', 15.857, -97.067, 'spots', 'surfing'],
  ['Sayulita Surf Beach', 'Sayulita', 'MX', 20.869, -105.442, 'spots', 'surfing'],
];

// ============================================
// CAPTION TEMPLATES — filled in Part 3
// ============================================

const CREATOR_CAPTION_GROUPS: Record<string, string[]> = {
  training: [
    'New PR today! Consistency beats intensity every time',
    'Form is everything. Here is a quick technique breakdown',
    'My client just hit their 6-month transformation goal',
    'Morning session done. Who else trains before sunrise?',
    'Progressive overload is the key to growth',
    'Recovery day tips that actually work',
    'Full body workout you can do anywhere',
    'The biggest mistake beginners make in the gym',
  ],
  yoga: [
    'Find your flow. Today was all about letting go',
    'Breath is the bridge between body and mind',
    'Morning sun salutations to start the day right',
    'Flexibility is not about touching your toes, it is about what you learn on the way down',
    'Restorative practice for when life gets heavy',
    'Hold the pose. Trust the process',
    'My favorite hip opener sequence for desk workers',
    'Savasana is not sleeping. It is the most important pose',
  ],
  nutrition: [
    'You cannot out-train a bad diet. Meal prep Sunday',
    'Protein timing matters more than you think',
    'Simple swaps that cut 500 calories without feeling deprived',
    'My go-to post-workout smoothie recipe',
    'Reading labels changed my life. Here is what to look for',
    'Hydration check! Most of you are not drinking enough water',
    'Gut health is the foundation of everything',
    'Macro breakdown of my favorite high-protein meal',
  ],
  combat: [
    'Hands up, chin down. Basics win fights',
    'Sparring day. Nothing builds confidence like combat training',
    'Technique beats power every single time',
    'Heavy bag session to end the week strong',
    'Defense is the best offense. Drill your slips and rolls',
    'From white belt to black belt, the journey never stops',
    'Cardio kickboxing burns more calories than you think',
    'Fight camp prep is no joke. Here is what my week looks like',
  ],
  wellness: [
    'Five minutes of breathwork changed my entire morning',
    'Mental health is health. No exceptions',
    'Guided meditation for stress relief. Save this one',
    'Your nervous system needs rest, not just your muscles',
    'Journaling prompt: what does wellness mean to you?',
    'Corporate burnout is real. Here is how I help teams recover',
    'Sound healing session today. The vibrations were incredible',
    'Mindfulness is a practice, not a destination',
  ],
  sports: [
    'Race day! Months of training come down to this',
    'Coaching youth athletes is the most rewarding work',
    'Speed drill breakdown for any sport',
    'The off-season is where champions are made',
    'Game film analysis reveals everything. Study your craft',
    'Agility ladder work to improve footwork and reaction time',
    'Swimming technique tip: rotate from the hips, not the shoulders',
    'Trail running season is here and the mountains are calling',
  ],
  rehab: [
    'Pain is information, not punishment. Listen to your body',
    'Post-surgery recovery milestone. Small wins matter',
    'Foam rolling routine that my clients swear by',
    'Mobility work is not optional, it is essential',
    'The most underrated exercise for back pain relief',
    'Stretching should never hurt. Here is how to do it right',
    'Recovery is not passive. Active rehab gets results',
    'Helping someone move pain-free again is why I do this',
  ],
  dance: [
    'Dance like nobody is watching. Then post it anyway',
    'Choreography breakdown for beginners. Try this at home',
    'Movement is medicine. Today we healed through dance',
    'Outdoor adventure fitness hits different',
    'Latin rhythms make every workout feel like a party',
    'Age is just a number. My oldest student is 78',
    'Contemporary flow piece inspired by nature',
    'Hiking and bodyweight training. The perfect combo',
  ],
};

const CREATOR_CAPTION_MAP: Record<string, string> = {
  'Personal Training': 'training',
  'Group Fitness': 'training',
  'Functional Training': 'training',
  'Performance': 'training',
  'Online Coaching': 'training',
  'Yoga & Pilates': 'yoga',
  'Nutrition & Diet': 'nutrition',
  'Weight Management': 'nutrition',
  'Lifestyle & Habits': 'nutrition',
  'Combat Sports': 'combat',
  'Combat Fitness': 'combat',
  'Mind & Wellness': 'wellness',
  'Holistic Health': 'wellness',
  'Mind-Body Integration': 'wellness',
  'Corporate Wellness': 'wellness',
  'Sports Coaching': 'sports',
  'Aquatic Sports': 'sports',
  'Extreme Sports': 'sports',
  'Rehabilitation': 'rehab',
  'Stretching & Flexibility': 'rehab',
  'Wellness Services': 'rehab',
  'Dance & Movement': 'dance',
  'Outdoor & Adventure': 'dance',
  'Specialized Populations': 'dance',
};

const BUSINESS_CAPTION_GROUPS: Record<string, string[]> = {
  gym: [
    'New equipment day! Come check out our upgraded free weights section',
    'Member spotlight: 100 pounds lost in 12 months. We are so proud',
    'Early bird classes now start at 5:30 AM. No excuses',
    'This weekend: free trial passes for you and a friend',
    'Our trainers just got re-certified. World-class coaching awaits',
    'Gym etiquette reminder: rack your weights, wipe your bench',
  ],
  studio: [
    'New class schedule is live! Book your spot before they fill up',
    'Candlelight yoga this Friday. Limited to 15 spots',
    'Beginner-friendly workshops every Saturday morning',
    'Our studio just turned 5! Celebrate with us this weekend',
    'New instructor joining our team. Welcome aboard!',
    'Mindful movement for every body. All levels always welcome',
  ],
  combat: [
    'Fight night this Saturday! Come support our athletes',
    'Kids martial arts program now enrolling for spring',
    'New heavy bags just installed. Come break them in',
    'Self-defense workshop this Sunday. Open to all skill levels',
    'Our team brought home 3 gold medals from the tournament',
    'Discipline. Respect. Technique. That is what we teach here',
  ],
  sports: [
    'League registration is now open for the spring season',
    'Court resurfacing complete! Book your sessions now',
    'Junior development program starts next month',
    'Open house this weekend. Free play on all courts and fields',
    'Congratulations to our members who competed this weekend',
    'New coaching clinics added to the schedule. Sign up today',
  ],
  wellness: [
    'Your health journey starts with the right guidance',
    'New recovery services now available. Book your session',
    'Nutrition consultation packages now 20% off for members',
    'Wellness is not a luxury, it is a necessity',
    'Personalized plans that actually fit your lifestyle',
    'Meet our newest practitioner. Specializing in sports recovery',
  ],
};

const BUSINESS_CAPTION_MAP: Record<string, string> = {
  gym: 'gym',
  crossfit: 'gym',
  hiit_studio: 'gym',
  bootcamp: 'gym',
  yoga_studio: 'studio',
  pilates: 'studio',
  meditation: 'studio',
  dance_studio: 'studio',
  martial_arts: 'combat',
  boxing: 'combat',
  mma: 'combat',
  sports_club: 'sports',
  tennis: 'sports',
  climbing: 'sports',
  running_club: 'sports',
  swim_school: 'sports',
  golf: 'sports',
  cycling: 'sports',
  pool: 'sports',
  wellness_spa: 'wellness',
  nutrition: 'wellness',
  personal_training: 'wellness',
};

const PERSONAL_CAPTIONS: string[] = [
  'Loving this new workout routine',
  'Best session in weeks',
  'Finally nailed that move I have been practicing',
  'Rest day but still got my steps in',
  'Post-workout glow is real',
  'Trying something new today. Stepped out of my comfort zone',
  'This view was worth every step of the climb',
  'Sore but happy. That is the motto',
  'Found my new favorite spot for outdoor training',
  'Consistency over perfection. Day 47 of showing up',
];

const PEAK_CAPTIONS: Record<string, string[]> = {
  training: ['Quick tip: perfect your squat form', 'Watch this 30-second ab burner', 'Full body warm-up routine', 'Post-workout stretching flow'],
  wellness: ['One minute breathing exercise for stress', 'Morning mindfulness check-in', 'Guided body scan for sleep', 'Daily gratitude journaling prompt'],
  sports: ['Sprint drill you can do anywhere', 'Race day preparation checklist', 'Footwork agility drill breakdown', 'Cool-down routine after long runs'],
  combat: ['Jab-cross combo in slow motion', 'Defensive slip drill for beginners', 'Heavy bag round timer challenge', 'Shadow boxing flow for cardio'],
};

// ============================================
// BUSINESS TEMPLATES — filled in Part 3
// ============================================

const ACTIVITY_TEMPLATES: Record<string, [string, string, number, number, string][]> = {
  gym: [
    ['Strength Circuit', 'Full body strength training circuit', 60, 20, '#FF6B6B'],
    ['Cardio Blast', 'High energy cardio session', 45, 25, '#4ECDC4'],
    ['Yoga Flow', 'Gentle yoga for recovery', 60, 15, '#9B59B6'],
    ['Core & Abs', 'Focused core strengthening', 30, 20, '#E74C3C'],
    ['Open Gym', 'Self-directed training time', 120, 50, '#3498DB'],
  ],
  yoga_studio: [
    ['Vinyasa Flow', 'Dynamic flowing yoga sequence', 75, 20, '#9B59B6'],
    ['Hot Yoga', 'Heated power yoga class', 60, 25, '#E74C3C'],
    ['Restorative Yoga', 'Deep relaxation and gentle stretching', 60, 15, '#2ECC71'],
    ['Yin Yoga', 'Long holds for deep tissue release', 75, 12, '#3498DB'],
    ['Meditation Circle', 'Guided group meditation session', 30, 20, '#F39C12'],
  ],
  crossfit: [
    ['WOD', 'Workout of the day', 60, 20, '#E74C3C'],
    ['Olympic Lifting', 'Snatch and clean & jerk technique', 60, 12, '#FF6B6B'],
    ['Endurance WOD', 'Longer format conditioning workout', 45, 20, '#4ECDC4'],
    ['Gymnastics Skills', 'Handstands, muscle-ups, and ring work', 60, 15, '#9B59B6'],
    ['Open Gym', 'Self-directed programming time', 90, 30, '#3498DB'],
  ],
  pool: [
    ['Lap Swim', 'Open lane swimming for all levels', 60, 30, '#3498DB'],
    ['Aqua Fitness', 'Water-based cardio and resistance training', 45, 20, '#4ECDC4'],
    ['Swim Lessons', 'Technique-focused swim instruction', 45, 8, '#2ECC71'],
    ['Water Polo Practice', 'Team water polo training session', 60, 16, '#E74C3C'],
    ['Family Swim', 'Open pool time for families', 90, 40, '#F39C12'],
  ],
  martial_arts: [
    ['Karate Fundamentals', 'Traditional karate technique and kata', 60, 20, '#E74C3C'],
    ['Judo Randori', 'Judo throwing and groundwork practice', 60, 16, '#FF6B6B'],
    ['BJJ Gi Class', 'Brazilian Jiu-Jitsu in the gi', 75, 20, '#9B59B6'],
    ['Kids Martial Arts', 'Fun martial arts for ages 6-12', 45, 15, '#F39C12'],
    ['Self-Defense Workshop', 'Practical self-defense techniques', 60, 20, '#3498DB'],
  ],
  dance_studio: [
    ['Hip Hop Fundamentals', 'Learn hip hop basics and grooves', 60, 25, '#E74C3C'],
    ['Contemporary Flow', 'Expressive contemporary dance class', 75, 20, '#9B59B6'],
    ['Salsa & Bachata', 'Latin partner dance class', 60, 24, '#FF6B6B'],
    ['Ballet Barre', 'Classical ballet technique at the barre', 60, 15, '#3498DB'],
    ['Zumba Party', 'Dance fitness party to Latin rhythms', 45, 30, '#4ECDC4'],
  ],
  sports_club: [
    ['Tennis Clinic', 'Group tennis instruction and drills', 60, 8, '#2ECC71'],
    ['Basketball Open Run', 'Pickup basketball games', 90, 20, '#E74C3C'],
    ['Volleyball League Night', 'Recreational volleyball league play', 90, 24, '#3498DB'],
    ['Multi-Sport Kids Camp', 'Rotating sports for ages 8-14', 120, 20, '#F39C12'],
    ['Adult Swim Lanes', 'Reserved lane swim for members', 60, 20, '#4ECDC4'],
  ],
  bootcamp: [
    ['Dawn Patrol Bootcamp', 'Outdoor sunrise fitness session', 45, 30, '#FF6B6B'],
    ['Strength & Conditioning', 'Kettlebells, sandbags, and bodyweight', 60, 25, '#E74C3C'],
    ['Hill Sprints', 'Interval hill running workout', 30, 20, '#4ECDC4'],
    ['Partner Workout', 'Two-person team challenge workout', 45, 24, '#9B59B6'],
  ],
  pilates: [
    ['Reformer Pilates', 'Machine-based Pilates class', 55, 10, '#9B59B6'],
    ['Mat Pilates', 'Classical mat Pilates exercises', 50, 15, '#4ECDC4'],
    ['Pilates Barre Fusion', 'Pilates meets ballet barre', 55, 12, '#FF6B6B'],
    ['Pre/Postnatal Pilates', 'Safe Pilates for expectant and new moms', 45, 8, '#2ECC71'],
  ],
  tennis: [
    ['Group Lesson', 'Tennis fundamentals and match play', 60, 8, '#2ECC71'],
    ['Cardio Tennis', 'High-energy tennis-based fitness', 60, 12, '#E74C3C'],
    ['Junior Development', 'Youth tennis skills and competition prep', 60, 10, '#F39C12'],
    ['Doubles Mixer', 'Social doubles round-robin event', 90, 16, '#3498DB'],
  ],
  climbing: [
    ['Intro to Bouldering', 'Beginner bouldering techniques and safety', 60, 12, '#4ECDC4'],
    ['Lead Climbing Clinic', 'Lead climbing skills and rope management', 90, 8, '#E74C3C'],
    ['Climbing Fitness', 'Strength training for climbers', 60, 15, '#FF6B6B'],
    ['Kids Climbing Club', 'Fun climbing sessions for ages 6-14', 60, 12, '#F39C12'],
    ['Open Climb', 'Self-directed bouldering and top-rope time', 120, 40, '#3498DB'],
  ],
  boxing: [
    ['Boxing Fundamentals', 'Stance, footwork, and basic combos', 60, 20, '#E74C3C'],
    ['Heavy Bag Workout', 'High-intensity bag work session', 45, 20, '#FF6B6B'],
    ['Sparring Session', 'Controlled sparring for intermediate and up', 60, 12, '#9B59B6'],
    ['Cardio Boxing', 'Boxing-inspired fitness class', 45, 25, '#4ECDC4'],
  ],
  running_club: [
    ['Group Run — Easy Pace', 'Conversational pace group run', 60, 30, '#2ECC71'],
    ['Interval Training', 'Track intervals for speed improvement', 45, 20, '#E74C3C'],
    ['Trail Run Adventure', 'Guided trail running on local paths', 75, 15, '#4ECDC4'],
    ['Race Prep Long Run', 'Marathon and half marathon training run', 90, 25, '#3498DB'],
  ],
  hiit_studio: [
    ['HIIT 45', 'All-out 45-minute interval session', 45, 25, '#E74C3C'],
    ['Tabata Express', 'Quick Tabata-style workout', 30, 20, '#FF6B6B'],
    ['Strength HIIT', 'Weights combined with intervals', 50, 20, '#9B59B6'],
    ['HIIT & Stretch', 'Intense intervals followed by recovery stretching', 60, 20, '#4ECDC4'],
  ],
  swim_school: [
    ['Baby & Toddler Swim', 'Parent-child water introduction ages 6m-3y', 30, 10, '#F39C12'],
    ['Learn to Swim — Kids', 'Progressive swim lessons ages 4-12', 45, 8, '#4ECDC4'],
    ['Adult Swim Lessons', 'Beginner to intermediate adult instruction', 45, 6, '#3498DB'],
    ['Squad Training', 'Competitive swim squad practice', 60, 15, '#E74C3C'],
  ],
  golf: [
    ['Beginner Clinic', 'Golf basics — grip, stance, and swing', 60, 8, '#2ECC71'],
    ['Short Game Workshop', 'Chipping, pitching, and putting drills', 60, 6, '#4ECDC4'],
    ['Driving Range Session', 'Supervised driving range practice', 45, 12, '#3498DB'],
    ['Junior Golf Academy', 'Youth golf development program', 60, 10, '#F39C12'],
    ['9-Hole Scramble', 'Fun team format social golf event', 150, 16, '#9B59B6'],
  ],
  cycling: [
    ['Indoor Spin', 'High-energy indoor cycling class', 45, 30, '#E74C3C'],
    ['Endurance Ride', 'Longer steady-state cycling session', 60, 25, '#4ECDC4'],
    ['Hill Climb Challenge', 'Resistance-focused climbing intervals', 45, 25, '#FF6B6B'],
    ['Outdoor Group Ride', 'Guided road cycling at various paces', 90, 20, '#2ECC71'],
  ],
  mma: [
    ['MMA Fundamentals', 'Striking, grappling, and transitions', 60, 20, '#E74C3C'],
    ['BJJ No-Gi', 'No-gi Brazilian Jiu-Jitsu class', 60, 20, '#9B59B6'],
    ['Muay Thai', 'Thai boxing technique and pad work', 60, 20, '#FF6B6B'],
    ['MMA Conditioning', 'Fight-specific conditioning workout', 45, 25, '#4ECDC4'],
    ['Open Mat', 'Free rolling and drilling time', 90, 30, '#3498DB'],
  ],
};

const SERVICE_TEMPLATES: Record<string, [string, string, string, number, number, boolean, string | null][]> = {
  gym: [
    ['Monthly Membership', 'Unlimited access to all facilities', 'membership', 4999, 0, true, 'monthly'],
    ['Day Pass', 'Single day access', 'pass', 1999, 0, false, null],
    ['Personal Training Session', '1-on-1 with certified trainer', 'training', 7999, 60, false, null],
    ['10-Class Pack', 'Valid for any group class', 'pack', 14999, 0, false, null],
  ],
  yoga_studio: [
    ['Monthly Unlimited', 'Unlimited yoga classes', 'membership', 12999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single class pass', 'pass', 2499, 75, false, null],
    ['5-Class Pack', 'Five classes at a discount', 'pack', 9999, 0, false, null],
    ['Private Session', 'One-on-one yoga instruction', 'training', 8999, 60, false, null],
  ],
  crossfit: [
    ['Monthly Unlimited', 'Unlimited WODs and open gym', 'membership', 17999, 0, true, 'monthly'],
    ['Drop-In WOD', 'Single workout of the day', 'pass', 2999, 60, false, null],
    ['Foundations Course', '4-session intro to CrossFit basics', 'training', 19999, 240, false, null],
    ['10-Class Pack', 'Ten WOD sessions', 'pack', 24999, 0, false, null],
  ],
  pool: [
    ['Monthly Swim Pass', 'Unlimited pool access', 'membership', 5999, 0, true, 'monthly'],
    ['Day Pass', 'Single day pool access', 'pass', 1499, 0, false, null],
    ['10-Swim Pack', 'Ten swim sessions', 'pack', 11999, 0, false, null],
    ['Private Swim Lesson', 'One-on-one swim instruction', 'training', 5999, 45, false, null],
  ],
  martial_arts: [
    ['Monthly Membership', 'Unlimited martial arts classes', 'membership', 14999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single martial arts class', 'pass', 2999, 60, false, null],
    ['Private Lesson', 'One-on-one instruction with sensei', 'training', 8999, 60, false, null],
  ],
  dance_studio: [
    ['Monthly Unlimited', 'Unlimited dance classes all styles', 'membership', 10999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single dance class any style', 'pass', 1999, 60, false, null],
    ['8-Class Pack', 'Eight dance classes', 'pack', 12999, 0, false, null],
    ['Private Choreography', 'Custom choreography session', 'training', 9999, 60, false, null],
  ],
  wellness_spa: [
    ['60-Min Massage', 'Full body therapeutic massage', 'treatment', 9999, 60, false, null],
    ['Cryotherapy Session', 'Whole body cryotherapy treatment', 'treatment', 5999, 15, false, null],
    ['Monthly Wellness Pass', 'Unlimited sauna and recovery room access', 'membership', 14999, 0, true, 'monthly'],
    ['Recovery Package', 'Massage plus cryotherapy combo', 'pack', 13999, 90, false, null],
  ],
  sports_club: [
    ['Monthly Membership', 'Full access to all courts and facilities', 'membership', 8999, 0, true, 'monthly'],
    ['Day Pass', 'Single day facility access', 'pass', 2499, 0, false, null],
    ['Court Rental — 1 Hour', 'Reserve any court for one hour', 'rental', 3999, 60, false, null],
    ['Junior Sports Program', 'Monthly youth multi-sport enrollment', 'membership', 5999, 0, true, 'monthly'],
  ],
  personal_training: [
    ['Single Session', 'One-on-one personal training', 'training', 7999, 60, false, null],
    ['5-Session Pack', 'Five personal training sessions', 'pack', 34999, 300, false, null],
    ['Monthly Coaching', '12 sessions per month plus meal plan', 'membership', 49999, 0, true, 'monthly'],
  ],
  bootcamp: [
    ['Monthly Unlimited', 'Unlimited outdoor bootcamp sessions', 'membership', 9999, 0, true, 'monthly'],
    ['Drop-In Session', 'Single bootcamp workout', 'pass', 1999, 45, false, null],
    ['10-Session Pack', 'Ten bootcamp sessions', 'pack', 14999, 0, false, null],
  ],
  pilates: [
    ['Monthly Unlimited', 'Unlimited mat and reformer classes', 'membership', 15999, 0, true, 'monthly'],
    ['Reformer Class Drop-In', 'Single reformer Pilates class', 'pass', 3499, 55, false, null],
    ['5-Class Reformer Pack', 'Five reformer sessions', 'pack', 14999, 0, false, null],
    ['Private Pilates', 'One-on-one Pilates instruction', 'training', 9999, 55, false, null],
  ],
  meditation: [
    ['Monthly Pass', 'Unlimited meditation sessions', 'membership', 7999, 0, true, 'monthly'],
    ['Drop-In Session', 'Single guided meditation', 'pass', 1499, 30, false, null],
    ['8-Week Mindfulness Course', 'Structured mindfulness program', 'training', 29999, 480, false, null],
  ],
  tennis: [
    ['Monthly Membership', 'Unlimited court access and clinics', 'membership', 12999, 0, true, 'monthly'],
    ['Court Rental — 1 Hour', 'Single court booking', 'rental', 4999, 60, false, null],
    ['Private Lesson', 'One-on-one with certified pro', 'training', 8999, 60, false, null],
    ['10-Lesson Pack', 'Ten group clinic sessions', 'pack', 19999, 0, false, null],
  ],
  climbing: [
    ['Monthly Membership', 'Unlimited climbing access', 'membership', 7999, 0, true, 'monthly'],
    ['Day Pass', 'Single day climbing access', 'pass', 2499, 0, false, null],
    ['Intro to Climbing Course', 'Beginner skills and safety course', 'training', 5999, 120, false, null],
    ['10-Visit Punch Card', 'Ten climbing sessions', 'pack', 19999, 0, false, null],
  ],
  boxing: [
    ['Monthly Unlimited', 'Unlimited boxing classes and open gym', 'membership', 12999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single boxing class', 'pass', 2499, 60, false, null],
    ['Private Session', 'One-on-one with a boxing coach', 'training', 7999, 60, false, null],
    ['8-Class Pack', 'Eight boxing classes', 'pack', 15999, 0, false, null],
  ],
  running_club: [
    ['Monthly Membership', 'All group runs and training plans', 'membership', 3999, 0, true, 'monthly'],
    ['Drop-In Run', 'Join a single group run', 'pass', 999, 60, false, null],
    ['Race Training Program', '12-week structured race preparation', 'training', 19999, 0, false, null],
  ],
  hiit_studio: [
    ['Monthly Unlimited', 'Unlimited HIIT classes', 'membership', 11999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single HIIT session', 'pass', 2499, 45, false, null],
    ['10-Class Pack', 'Ten HIIT sessions at a discount', 'pack', 19999, 0, false, null],
  ],
  swim_school: [
    ['Monthly Swim Lessons', 'Weekly swim lessons for one month', 'membership', 8999, 0, true, 'monthly'],
    ['Single Lesson', 'One swim lesson', 'pass', 2999, 45, false, null],
    ['Term Enrollment', '10-week progressive swim program', 'training', 24999, 450, false, null],
    ['Private Lesson', 'One-on-one swim instruction', 'training', 5999, 30, false, null],
  ],
  nutrition: [
    ['Initial Consultation', 'Comprehensive nutrition assessment', 'consultation', 14999, 60, false, null],
    ['Follow-Up Session', 'Progress review and plan adjustment', 'consultation', 7999, 30, false, null],
    ['Monthly Coaching', 'Weekly check-ins and meal planning', 'membership', 19999, 0, true, 'monthly'],
  ],
  golf: [
    ['Monthly Membership', 'Unlimited green fees and range balls', 'membership', 19999, 0, true, 'monthly'],
    ['Green Fee — 18 Holes', 'Single round of 18 holes', 'pass', 5999, 240, false, null],
    ['Private Lesson', 'One-on-one with PGA pro', 'training', 9999, 60, false, null],
    ['Range Bucket', 'Large bucket of range balls', 'pass', 1499, 0, false, null],
  ],
  cycling: [
    ['Monthly Unlimited', 'Unlimited spin and group rides', 'membership', 9999, 0, true, 'monthly'],
    ['Drop-In Spin Class', 'Single indoor cycling session', 'pass', 2499, 45, false, null],
    ['10-Ride Pack', 'Ten ride sessions', 'pack', 19999, 0, false, null],
  ],
  mma: [
    ['Monthly Unlimited', 'Unlimited MMA, BJJ, and striking classes', 'membership', 16999, 0, true, 'monthly'],
    ['Drop-In Class', 'Single MMA class', 'pass', 2999, 60, false, null],
    ['Private Session', 'One-on-one MMA coaching', 'training', 8999, 60, false, null],
    ['Fight Camp Package', '8-week fight preparation program', 'pack', 49999, 0, false, null],
  ],
};

// ============================================
// GENERATOR FUNCTIONS — filled in Part 3
// ============================================

// Global counter for unique post images (ensures no duplicates across all posts)
let globalPostCounter = 0;

function getCaptionGroup(expertiseCategory: string): string {
  return CREATOR_CAPTION_MAP[expertiseCategory] || 'training';
}

function getBusinessCaptionGroup(bizCategory: string): string {
  return BUSINESS_CAPTION_MAP[bizCategory] || 'gym';
}

function getPeakCaptionGroup(expertiseCategory: string): string {
  const map: Record<string, string> = {
    'Personal Training': 'training',
    'Group Fitness': 'training',
    'Functional Training': 'training',
    'Performance': 'training',
    'Online Coaching': 'training',
    'Weight Management': 'training',
    'Lifestyle & Habits': 'training',
    'Mind & Wellness': 'wellness',
    'Holistic Health': 'wellness',
    'Mind-Body Integration': 'wellness',
    'Corporate Wellness': 'wellness',
    'Yoga & Pilates': 'wellness',
    'Nutrition & Diet': 'wellness',
    'Rehabilitation': 'wellness',
    'Stretching & Flexibility': 'wellness',
    'Wellness Services': 'wellness',
    'Sports Coaching': 'sports',
    'Aquatic Sports': 'sports',
    'Extreme Sports': 'sports',
    'Dance & Movement': 'sports',
    'Outdoor & Adventure': 'sports',
    'Specialized Populations': 'sports',
    'Combat Sports': 'combat',
    'Combat Fitness': 'combat',
  };
  return map[expertiseCategory] || 'training';
}

function generatePosts(
  profileId: string,
  accountType: string,
  niche: string,
  _index: number
): { id: string; author_id: string; content: string; media_urls: string[]; media_type: string; visibility: string; likes_count: number; comments_count: number; tags: string[]; days_ago: number }[] {
  const count = accountType === 'pro_creator' ? 8 : accountType === 'pro_business' ? 5 : 3;
  const posts: { id: string; author_id: string; content: string; media_urls: string[]; media_type: string; visibility: string; likes_count: number; comments_count: number; tags: string[]; days_ago: number }[] = [];

  let captions: string[];
  let tags: string[];
  if (accountType === 'pro_creator') {
    const group = getCaptionGroup(niche);
    captions = CREATOR_CAPTION_GROUPS[group] || CREATOR_CAPTION_GROUPS['training'];
    tags = NICHE_TAGS[niche] || ['fitness', 'gym', 'health'];
  } else if (accountType === 'pro_business') {
    const group = getBusinessCaptionGroup(niche);
    captions = BUSINESS_CAPTION_GROUPS[group] || BUSINESS_CAPTION_GROUPS['gym'];
    tags = BIZ_TAGS[niche] || ['fitness', 'gym', 'health'];
  } else {
    captions = PERSONAL_CAPTIONS;
    tags = ['fitness', 'gym', 'health'];
  }

  for (let i = 0; i < count; i++) {
    // All posts are images — picsum.photos with unique sequential IDs (no duplicates)
    const imageIndex = globalPostCounter++;
    const mediaUrl = `https://picsum.photos/id/${(imageIndex % 1000) + 10}/800/600`;
    // First creator post has 'fans' visibility
    const visibility = (accountType === 'pro_creator' && i === 0) ? 'fans' : 'public';
    posts.push({
      id: uuidv4(),
      author_id: profileId,
      content: captions[i % captions.length],
      media_urls: [mediaUrl],
      media_type: 'image',
      visibility,
      likes_count: rand(10, 500),
      comments_count: rand(1, 50),
      tags: pick(tags, rand(3, 5)),
      days_ago: rand(0, 30),
    });
  }
  return posts;
}

function generatePeaks(
  profileId: string,
  expertiseCategory: string
): { id: string; author_id: string; video_url: string; thumbnail_url: string; caption: string; duration: number; views_count: number }[] {
  const group = getPeakCaptionGroup(expertiseCategory);
  const captions = PEAK_CAPTIONS[group] || PEAK_CAPTIONS['training'];
  const peaks: { id: string; author_id: string; video_url: string; thumbnail_url: string; caption: string; duration: number; views_count: number }[] = [];
  for (let i = 0; i < 2; i++) {
    peaks.push({
      id: uuidv4(),
      author_id: profileId,
      video_url: VIDEO_URLS[rand(0, VIDEO_URLS.length - 1)],
      thumbnail_url: POST_IMAGES[rand(0, POST_IMAGES.length - 1)],
      caption: captions[i % captions.length],
      duration: rand(5, 15),
      views_count: rand(100, 1000),
    });
  }
  return peaks;
}

function generateActivities(
  businessId: string,
  category: string
): { id: string; business_id: string; name: string; description: string; category: string; duration_minutes: number; max_participants: number; color: string }[] {
  const templates = ACTIVITY_TEMPLATES[category];
  if (!templates) return [];
  return templates.map((t) => ({
    id: uuidv4(),
    business_id: businessId,
    name: t[0],
    description: t[1],
    category: category,
    duration_minutes: t[2],
    max_participants: t[3],
    color: t[4],
  }));
}

function generateScheduleSlots(
  businessId: string,
  activities: { id: string; business_id: string; name: string; description: string; category: string; duration_minutes: number; max_participants: number; color: string }[]
): { id: string; business_id: string; activity_id: string; day_of_week: number; start_time: string; end_time: string; max_participants: number }[] {
  const slots: { id: string; business_id: string; activity_id: string; day_of_week: number; start_time: string; end_time: string; max_participants: number }[] = [];
  const timeSlots = [
    { startHour: 7, startMin: 0 },
    { startHour: 8, startMin: 30 },
    { startHour: 12, startMin: 0 },
    { startHour: 17, startMin: 0 },
    { startHour: 18, startMin: 30 },
    { startHour: 19, startMin: 0 },
  ];
  for (const activity of activities) {
    const numSlots = rand(3, 5);
    const usedDayTime = new Set<string>();
    let attempts = 0;
    for (let i = 0; i < numSlots && attempts < 30; i++) {
      const day = rand(1, 6);
      const ts = timeSlots[rand(0, timeSlots.length - 1)];
      const key = `${day}-${ts.startHour}:${ts.startMin}`;
      if (usedDayTime.has(key)) {
        attempts++;
        i--;
        continue;
      }
      usedDayTime.add(key);
      const startTime = `${String(ts.startHour).padStart(2, '0')}:${String(ts.startMin).padStart(2, '0')}`;
      const endTotalMin = ts.startHour * 60 + ts.startMin + activity.duration_minutes;
      const endHour = Math.floor(endTotalMin / 60);
      const endMin = endTotalMin % 60;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      slots.push({
        id: uuidv4(),
        business_id: businessId,
        activity_id: activity.id,
        day_of_week: day,
        start_time: startTime,
        end_time: endTime,
        max_participants: activity.max_participants,
      });
    }
  }
  return slots;
}

function generateServices(
  businessId: string,
  category: string
): { id: string; business_id: string; name: string; description: string; category: string; price_cents: number; duration_minutes: number; is_subscription: boolean; subscription_period: string | null }[] {
  const templates = SERVICE_TEMPLATES[category];
  if (!templates) return [];
  return templates.map((t) => ({
    id: uuidv4(),
    business_id: businessId,
    name: t[0],
    description: t[1],
    category: t[2],
    price_cents: t[3],
    duration_minutes: t[4],
    is_subscription: t[5],
    subscription_period: t[6],
  }));
}

function generateOpeningHours(): Record<string, { open: string; close: string }> {
  return {
    monday: { open: '06:00', close: '22:00' },
    tuesday: { open: '06:00', close: '22:00' },
    wednesday: { open: '06:00', close: '22:00' },
    thursday: { open: '06:00', close: '22:00' },
    friday: { open: '06:00', close: '22:00' },
    saturday: { open: '07:00', close: '21:00' },
    sunday: { open: '08:00', close: '20:00' },
  };
}

function generateFollows(
  creatorIds: string[],
  businessIds: string[],
  personalIds: string[]
): { id: string; follower_id: string; following_id: string }[] {
  const follows: { id: string; follower_id: string; following_id: string }[] = [];
  const seen = new Set<string>();

  const addFollow = (followerId: string, followingId: string) => {
    if (followerId === followingId) return;
    const key = `${followerId}->${followingId}`;
    if (seen.has(key)) return;
    seen.add(key);
    follows.push({ id: uuidv4(), follower_id: followerId, following_id: followingId });
  };

  // Each personal follows 5-10 random creators + 2-3 random businesses
  for (const pId of personalIds) {
    const followCreators = pick(creatorIds, rand(5, 10));
    for (const cId of followCreators) addFollow(pId, cId);
    const followBiz = pick(businessIds, rand(2, 3));
    for (const bId of followBiz) addFollow(pId, bId);
  }

  // Each creator follows 3-5 other random creators
  for (const cId of creatorIds) {
    const others = creatorIds.filter((id) => id !== cId);
    const followOthers = pick(others, rand(3, 5));
    for (const oId of followOthers) addFollow(cId, oId);
  }

  return follows;
}

// ============================================
// MAIN SEED FUNCTION — filled in Part 4
// ============================================

async function seedDemoData() {
  console.log(`Mode: ${USE_API ? 'API (admin endpoint)' : 'Direct DB'}`);
  const client: any = USE_API ? new ApiQueryClient() : await pool.connect();
  try {
    // 1. Clean existing bot data (respect FK order)
    console.log('Cleaning existing bot data...');
    await client.query("DELETE FROM business_services WHERE business_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await client.query("DELETE FROM follows WHERE follower_id IN (SELECT id FROM profiles WHERE is_bot = true) OR following_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await client.query("DELETE FROM posts WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await client.query("DELETE FROM peaks WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await client.query("DELETE FROM spots WHERE creator_id IN (SELECT id FROM profiles WHERE is_bot = true)");
    await client.query("DELETE FROM profiles WHERE is_bot = true");
    // Also clean test account
    await client.query("DELETE FROM follows WHERE follower_id IN (SELECT id FROM profiles WHERE is_team = true) OR following_id IN (SELECT id FROM profiles WHERE is_team = true)");
    await client.query("DELETE FROM profiles WHERE is_team = true");
    if (USE_API) await (client as ApiQueryClient).flush();

    await client.query('BEGIN');

    // 2. Insert creator profiles
    console.log('\nCreating 72 pro creator profiles...');
    const creatorIds: { id: string; niche: string }[] = [];
    for (let i = 0; i < CREATORS.length; i++) {
      const c = CREATORS[i];
      const id = uuidv4();
      await client.query(
        `INSERT INTO profiles (id, username, full_name, account_type, bio, expertise, interests, avatar_url, location, is_verified, is_bot, onboarding_completed, created_at, updated_at)
         VALUES ($1, $2, $3, 'pro_creator', $4, $5, $6, $7, $8, $9, true, true, NOW(), NOW())`,
        [id, c[0], c[1], c[5], c[3], c[4], AVATARS[i % AVATARS.length], c[6], c[9]]
      );
      creatorIds.push({ id, niche: c[2] });
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 3. Insert business profiles + spots
    console.log('Creating 44 pro business profiles...');
    const businessIds: { id: string; category: string; hasActivities: boolean }[] = [];
    for (let i = 0; i < BUSINESSES.length; i++) {
      const b = BUSINESSES[i];
      const id = uuidv4();
      // BusinessT: [0:username, 1:businessName, 2:category, 3:interests, 4:bio, 5:city, 6:lat, 7:lng, 8:hasActivities]
      await client.query(
        `INSERT INTO profiles (id, username, full_name, account_type, bio, interests, avatar_url, location, is_verified, business_name, business_category, business_latitude, business_longitude, is_bot, onboarding_completed, created_at, updated_at)
         VALUES ($1, $2, $3, 'pro_business', $4, $5, $6, $7, true, $8, $9, $10, $11, true, true, NOW(), NOW())`,
        [id, b[0], b[1], b[4], b[3], AVATARS[(CREATORS.length + i) % AVATARS.length], b[5], b[1], b[2], b[6], b[7]]
      );
      businessIds.push({ id, category: b[2], hasActivities: b[8] });

      // Map business category to spot category
      const spotCategoryMap: Record<string, string> = {
        gym: 'gyms', crossfit: 'gyms', hiit_studio: 'gyms', bootcamp: 'gyms',
        climbing: 'gyms', boxing: 'gyms', mma: 'gyms',
        yoga_studio: 'wellness', pilates: 'wellness', meditation: 'wellness',
        wellness_spa: 'wellness',
        dance_studio: 'sports', sports_club: 'sports', tennis: 'sports',
        running_club: 'sports', cycling: 'sports', golf: 'sports',
        pool: 'sports', swim_school: 'sports',
        personal_training: 'gyms', nutrition: 'wellness',
      };
      const spotCategory = spotCategoryMap[b[2]] || 'gyms';

      // Map business category to sport type
      const sportTypeMap: Record<string, string> = {
        gym: 'fitness', crossfit: 'fitness', hiit_studio: 'fitness', bootcamp: 'fitness',
        yoga_studio: 'yoga', pilates: 'yoga', meditation: 'yoga',
        dance_studio: 'other', martial_arts: 'other', boxing: 'other', mma: 'other',
        sports_club: 'other', tennis: 'tennis', climbing: 'climbing',
        running_club: 'running', cycling: 'cycling', pool: 'swimming',
        swim_school: 'swimming', wellness_spa: 'yoga', personal_training: 'fitness',
        nutrition: 'other', golf: 'other',
      };
      const sportType = sportTypeMap[b[2]] || 'fitness';

      // Opening hours only for businesses that have activities (scheduled)
      const openingHours = b[8] ? JSON.stringify(generateOpeningHours()) : null;

      await client.query(
        `INSERT INTO spots (id, creator_id, name, description, category, sport_type, city, country, latitude, longitude, images, amenities, rating, review_count, is_verified, opening_hours, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'US', $8, $9, $10, $11, $12, $13, true, $14, NOW(), NOW())`,
        [
          uuidv4(), id, b[1], b[4], spotCategory, sportType,
          b[5].split(',')[0], b[6], b[7],
          [SPOT_IMAGES[rand(0, SPOT_IMAGES.length - 1)]],
          ['parking', 'wifi', 'showers'],
          parseFloat((3.5 + Math.random() * 1.5).toFixed(1)), rand(5, 50),
          openingHours,
        ]
      );
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 4. Insert personal profiles
    console.log('Creating 50 personal profiles...');
    const personalIds: string[] = [];
    for (let i = 0; i < PERSONALS.length; i++) {
      const p = PERSONALS[i];
      const id = uuidv4();
      await client.query(
        `INSERT INTO profiles (id, username, full_name, account_type, bio, interests, avatar_url, location, is_verified, is_bot, onboarding_completed, created_at, updated_at)
         VALUES ($1, $2, $3, 'personal', $4, $5, $6, $7, false, true, true, NOW(), NOW())`,
        [id, p[0], p[1], p[3], p[2], AVATARS[(CREATORS.length + BUSINESSES.length + i) % AVATARS.length], p[4]]
      );
      personalIds.push(id);
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 5. Insert spots (Canada + USA + World)
    console.log('Creating 300 spots...');
    const ALL_SPOTS = [...CANADA_SPOTS, ...USA_SPOTS, ...WORLD_SPOTS];
    const creatorIdList = creatorIds.map((c) => c.id);
    for (const s of ALL_SPOTS) {
      await client.query(
        `INSERT INTO spots (id, creator_id, name, category, sport_type, city, country, latitude, longitude, images, amenities, rating, review_count, is_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())`,
        [
          uuidv4(), creatorIdList[rand(0, creatorIdList.length - 1)],
          s[0], s[5], s[6], s[1], s[2], s[3], s[4],
          [SPOT_IMAGES[rand(0, SPOT_IMAGES.length - 1)]],
          pick(['parking', 'wifi', 'showers', 'water', 'restrooms', 'lighting'], rand(2, 4)),
          parseFloat((3.5 + Math.random() * 1.5).toFixed(1)), rand(3, 30),
          Math.random() > 0.5,
        ]
      );
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 6. Insert posts
    console.log('Creating ~900 posts...');
    let totalPosts = 0;
    for (const { id, niche } of creatorIds) {
      const posts = generatePosts(id, 'pro_creator', niche, totalPosts);
      for (const p of posts) {
        await client.query(
          `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, likes_count, comments_count, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - interval '${p.days_ago} days', NOW())`,
          [p.id, p.author_id, p.content, p.media_urls, p.media_type, p.visibility, p.likes_count, p.comments_count, p.tags]
        );
        totalPosts++;
      }
    }
    for (const { id, category } of businessIds) {
      const posts = generatePosts(id, 'pro_business', category, totalPosts);
      for (const p of posts) {
        await client.query(
          `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, likes_count, comments_count, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - interval '${p.days_ago} days', NOW())`,
          [p.id, p.author_id, p.content, p.media_urls, p.media_type, p.visibility, p.likes_count, p.comments_count, p.tags]
        );
        totalPosts++;
      }
    }
    for (let i = 0; i < personalIds.length; i++) {
      const posts = generatePosts(personalIds[i], 'personal', '', totalPosts);
      for (const p of posts) {
        // Override tags with user's interests lowercased
        p.tags = PERSONALS[i][2].map((interest: string) => interest.toLowerCase());
        await client.query(
          `INSERT INTO posts (id, author_id, content, media_urls, media_type, visibility, likes_count, comments_count, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - interval '${p.days_ago} days', NOW())`,
          [p.id, p.author_id, p.content, p.media_urls, p.media_type, p.visibility, p.likes_count, p.comments_count, p.tags]
        );
        totalPosts++;
      }
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 7. Insert peaks (creators only)
    console.log('Creating ~144 peaks...');
    let totalPeaks = 0;
    for (const { id, niche } of creatorIds) {
      const peaks = generatePeaks(id, niche);
      for (const pk of peaks) {
        await client.query(
          `INSERT INTO peaks (id, author_id, video_url, thumbnail_url, caption, duration, views_count, visibility, media_type, expires_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'public', 'video', NOW() + interval '48 hours', NOW() - interval '${rand(0, 12)} hours', NOW())`,
          [pk.id, pk.author_id, pk.video_url, pk.thumbnail_url, pk.caption, pk.duration, pk.views_count]
        );
        totalPeaks++;
      }
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 8. Insert business activities, schedule slots, services
    console.log('Creating business services...');
    let totalServices = 0;
    for (const { id, category } of businessIds) {
      const services = generateServices(id, category);
      for (const sv of services) {
        await client.query(
          `INSERT INTO business_services (id, business_id, name, description, category, price_cents, duration_minutes, is_subscription, subscription_period, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW(), NOW())`,
          [sv.id, sv.business_id, sv.name, sv.description, sv.category, sv.price_cents, sv.duration_minutes, sv.is_subscription, sv.subscription_period]
        );
        totalServices++;
      }
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 9. Insert follows
    console.log('Creating follow relationships...');
    const follows = generateFollows(
      creatorIds.map((c) => c.id),
      businessIds.map((b) => b.id),
      personalIds
    );
    let totalFollows = 0;
    for (const f of follows) {
      await client.query(
        `INSERT INTO follows (id, follower_id, following_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'accepted', NOW(), NOW()) ON CONFLICT DO NOTHING`,
        [f.id, f.follower_id, f.following_id]
      );
      totalFollows++;
    }
    if (USE_API) await (client as ApiQueryClient).flush();

    // 10. Create test account (bots@smuppy.com)
    console.log('Creating test account...');
    const testAccountId = uuidv4();
    await client.query(
      `INSERT INTO profiles (id, username, full_name, account_type, bio, interests, avatar_url, location, is_verified, is_team, onboarding_completed, created_at, updated_at)
       VALUES ($1, 'team_smuppy_smuppy_team', 'Smuppy Team', 'personal', 'Official Smuppy test account', $2, $3, 'Ottawa, ON', true, true, true, NOW(), NOW())`,
      [testAccountId, ['Gym', 'Running', 'Yoga', 'HIIT', 'Nutrition'], AVATARS[0]]
    );
    // Test account follows all bots
    const allBotIds = [...creatorIds.map((c) => c.id), ...businessIds.map((b) => b.id), ...personalIds];
    for (const botId of allBotIds) {
      await client.query(
        `INSERT INTO follows (id, follower_id, following_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'accepted', NOW(), NOW()) ON CONFLICT DO NOTHING`,
        [uuidv4(), testAccountId, botId]
      );
    }

    if (USE_API) await (client as ApiQueryClient).flush();

    // 11. Update counters
    console.log('Updating counters...');
    await client.query(`
      UPDATE profiles SET
        followers_count = (SELECT COUNT(*) FROM follows WHERE following_id = profiles.id AND status = 'accepted'),
        following_count = (SELECT COUNT(*) FROM follows WHERE follower_id = profiles.id AND status = 'accepted'),
        post_count = (SELECT COUNT(*) FROM posts WHERE author_id = profiles.id)
      WHERE is_bot = true OR is_team = true
    `);

    if (USE_API) await (client as ApiQueryClient).flush();
    await client.query('COMMIT');

    console.log('\n=== Seed complete! ===');
    console.log(`Profiles: ${CREATORS.length + BUSINESSES.length + PERSONALS.length + 1}`);
    console.log(`Posts: ${totalPosts}`);
    console.log(`Peaks: ${totalPeaks}`);
    console.log(`Spots: ${ALL_SPOTS.length + BUSINESSES.length}`);
    console.log(`Services: ${totalServices}`);
    console.log(`Follows: ${totalFollows + allBotIds.length}`);
    console.log(`Test account: team_smuppy_smuppy_team (follows all ${allBotIds.length} bots)`);

  } catch (error) {
    if (!USE_API) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    }
    console.error('Error seeding:', error);
    throw error;
  } finally {
    client.release();
    if (!USE_API && pool) await pool.end();
  }
}

seedDemoData().catch(console.error);
