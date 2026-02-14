/**
 * Refresh Bot Peaks Lambda
 * Triggered by EventBridge every 24h
 * Deletes expired bot peaks and creates fresh ones for each bot creator
 *
 * Safe for long-term use:
 * - Idempotent: always deletes all bot peaks first, then creates new ones
 * - No accumulation: hard cap of 2 peaks per creator
 * - Transaction-based: all-or-nothing
 * - Self-contained: no external dependencies beyond DB
 */

import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';

const log = createLogger('refresh-bot-peaks');

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

// Thumbnail images
const THUMBNAILS = [
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800',
  'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800',
  'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800',
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800',
];

// Captions by expertise niche
const CAPTIONS: Record<string, string[]> = {
  training: [
    'Morning workout intensity! Who else is up early grinding?',
    'New PR today! Consistency beats talent every single time',
    'Quick tip: focus on form over weight. Your joints will thank you',
    'Client transformation update - 12 weeks of dedication!',
    'Full body circuit - try this one and let me know how it goes',
    'Rest day vibes. Recovery is part of the process',
  ],
  wellness: [
    'Morning meditation session - start your day with intention',
    'Breathwork exercise for stress relief. Try 4-7-8 technique',
    'Flexibility flow - 15 minutes to transform your mobility',
    'Mindful movement practice. Listen to your body today',
    'Nutrition tip: hydration is the foundation of wellness',
    'Gentle stretching routine for after a long workday',
  ],
  sports: [
    'Training session highlights! Working on technique today',
    'Game day prep - visualization and warm-up routine',
    'Breaking down this move step by step for beginners',
    'Outdoor training hits different. Nature is the best gym',
    'Speed drill from today. Focus on explosive power',
    'Team practice energy! Nothing beats training together',
  ],
  combat: [
    'Sparring rounds from today - always learning new things',
    'Heavy bag work - focusing on combinations and footwork',
    'Self-defense tip everyone should know',
    'Training camp life. Discipline over motivation',
    'Technique breakdown: the perfect jab-cross combo',
    'Recovery session after an intense week of training',
  ],
};

// Map expertise categories to caption groups
const EXPERTISE_CAPTION_MAP: Record<string, string> = {
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

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handler(): Promise<{ statusCode: number; body: string }> {
  log.info('Starting bot peaks refresh...');

  const db = await getPool();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // 1. Delete ALL existing bot peaks (clean slate every run)
    const deleteResult = await client.query(
      `DELETE FROM peaks WHERE author_id IN (SELECT id FROM profiles WHERE is_bot = true)`
    );
    log.info(`Deleted ${deleteResult.rowCount} old bot peaks`);

    // 2. Get all bot creators with their expertise
    const { rows: creators } = await client.query(
      `SELECT id, expertise FROM profiles WHERE is_bot = true AND account_type = 'pro_creator'`
    );
    log.info(`Found ${creators.length} bot creators`);

    // 3. Insert 2 peaks per creator
    let totalPeaks = 0;
    for (const creator of creators) {
      // Determine caption group from expertise
      const expertiseArr = creator.expertise || [];
      const firstExpertise = expertiseArr[0] || '';
      const captionGroup = EXPERTISE_CAPTION_MAP[firstExpertise] || 'training';
      const captions = CAPTIONS[captionGroup];

      for (let i = 0; i < 2; i++) {
        const videoUrl = VIDEO_URLS[rand(0, VIDEO_URLS.length - 1)];
        const thumbnailUrl = THUMBNAILS[rand(0, THUMBNAILS.length - 1)];
        const caption = captions[rand(0, captions.length - 1)];
        const duration = rand(5, 15);
        const viewsCount = rand(50, 500);
        const hoursAgo = rand(0, 12);

        await client.query(
          `INSERT INTO peaks (id, author_id, video_url, thumbnail_url, caption, duration, views_count, visibility, media_type, expires_at, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, 'public', 'video', NOW() + interval '48 hours', NOW() - interval '${hoursAgo} hours', NOW())`,
          [creator.id, videoUrl, thumbnailUrl, caption, duration, viewsCount]
        );
        totalPeaks++;
      }
    }

    await client.query('COMMIT');
    log.info(`Refresh complete: created ${totalPeaks} peaks for ${creators.length} creators`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Bot peaks refreshed',
        deletedPeaks: deleteResult.rowCount,
        createdPeaks: totalPeaks,
        creators: creators.length,
      }),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => { /* ignore rollback error */ });
    log.error('Error refreshing bot peaks', { error: String(error) });
    throw error;
  } finally {
    client.release();
  }
}
