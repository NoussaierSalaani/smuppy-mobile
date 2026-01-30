/**
 * Prescription Engine — Generates context-aware wellness missions
 *
 * Filters prescriptions by: weather, time of day, user preferences, mood.
 * All templates are client-side JSON — no API needed.
 */

import { MoodType } from './moodDetection';
import { WeatherData } from './weatherService';
import { PrescriptionPreferences } from '../stores/vibeStore';

// ============================================================================
// TYPES
// ============================================================================

export type PrescriptionCategory = 'movement' | 'mindfulness' | 'social' | 'creative' | 'nutrition';
export type PrescriptionDifficulty = 'easy' | 'moderate' | 'challenging';

export type PrescriptionCompletionMethod = 'timer' | 'manual';

export interface Prescription {
  id: string;
  title: string;
  description: string;
  instructions: string[];
  category: PrescriptionCategory;
  completionMethod: PrescriptionCompletionMethod;
  durationMinutes: number;
  difficulty: PrescriptionDifficulty;
  moodTargets: MoodType[];
  conditions: {
    minTemp?: number;
    maxTemp?: number;
    weatherExclude?: string[];
    timeRange?: { start: number; end: number }; // Hours (0-23)
    requiresOutdoor?: boolean;
  };
  vibeScoreReward: number;
}

// ============================================================================
// PRESCRIPTION TEMPLATES
// ============================================================================

const PRESCRIPTIONS: Prescription[] = [
  // ── Movement ──
  {
    id: 'mv-walk-15',
    title: 'Sunshine Walk',
    description: 'Take a 15-minute walk outside. Notice 3 things you find beautiful.',
    instructions: [
      'Put on comfortable shoes',
      'Leave your phone in your pocket',
      'Walk at a relaxed pace and observe your surroundings',
      'Try to notice 3 things you find beautiful',
    ],
    category: 'movement',
    completionMethod: 'manual',
    durationMinutes: 15,
    difficulty: 'easy',
    moodTargets: ['relaxed', 'energetic', 'neutral'],
    conditions: { requiresOutdoor: true, minTemp: 5, weatherExclude: ['rain', 'snow', 'thunderstorm'] },
    vibeScoreReward: 8,
  },
  {
    id: 'mv-stretch-5',
    title: 'Morning Stretch',
    description: 'Stretch your body for 5 minutes. Focus on neck, shoulders, and back.',
    instructions: [
      'Find a clear space where you can move freely',
      'Start with gentle neck rolls, left then right',
      'Move to shoulder shrugs and arm circles',
      'Finish with a slow forward bend for your back',
    ],
    category: 'movement',
    completionMethod: 'manual',
    durationMinutes: 5,
    difficulty: 'easy',
    moodTargets: ['relaxed', 'focused', 'neutral'],
    conditions: { timeRange: { start: 6, end: 12 } },
    vibeScoreReward: 5,
  },
  {
    id: 'mv-dance-10',
    title: 'Dance Break',
    description: 'Put on your favorite song and dance freely for 10 minutes. No one is watching!',
    instructions: [
      'Pick a playlist or song that makes you happy',
      'Find a space where you can move freely',
      'Let go — no choreography needed, just move!',
      'Keep going for at least 2-3 songs',
    ],
    category: 'movement',
    completionMethod: 'manual',
    durationMinutes: 10,
    difficulty: 'moderate',
    moodTargets: ['energetic', 'social', 'creative'],
    conditions: {},
    vibeScoreReward: 7,
  },
  {
    id: 'mv-yoga-20',
    title: 'Flow Session',
    description: 'Follow a 20-minute yoga flow. Focus on your breathing with each pose.',
    instructions: [
      'Find a quiet spot and lay down a mat or towel',
      'Start in a comfortable seated position',
      'Follow a flow or create your own sequence',
      'Breathe deeply with each transition between poses',
    ],
    category: 'movement',
    completionMethod: 'manual',
    durationMinutes: 20,
    difficulty: 'moderate',
    moodTargets: ['relaxed', 'focused'],
    conditions: {},
    vibeScoreReward: 10,
  },

  // ── Mindfulness ──
  {
    id: 'mf-breathe-5',
    title: 'Box Breathing',
    description: 'Breathe in for 4s, hold 4s, out 4s, hold 4s. Repeat for 5 minutes.',
    instructions: [
      'Sit or lie down in a comfortable position',
      'Close your eyes and relax your shoulders',
      'Breathe in through your nose for 4 seconds',
      'Hold for 4s, exhale for 4s, hold for 4s — repeat',
    ],
    category: 'mindfulness',
    completionMethod: 'timer',
    durationMinutes: 5,
    difficulty: 'easy',
    moodTargets: ['relaxed', 'focused', 'neutral'],
    conditions: {},
    vibeScoreReward: 6,
  },
  {
    id: 'mf-gratitude-10',
    title: 'Gratitude Journal',
    description: 'Write down 5 things you are grateful for today. Be specific.',
    instructions: [
      'Grab a pen and paper, or open your notes app',
      'Take a few deep breaths to center yourself',
      'Think about your day — what went well?',
      'Write 5 specific things you feel grateful for',
    ],
    category: 'mindfulness',
    completionMethod: 'timer',
    durationMinutes: 10,
    difficulty: 'easy',
    moodTargets: ['relaxed', 'social', 'creative'],
    conditions: {},
    vibeScoreReward: 7,
  },
  {
    id: 'mf-body-scan-15',
    title: 'Body Scan',
    description: 'Lie down and slowly scan your body from toes to head. Release tension in each area.',
    instructions: [
      'Lie down on your back in a comfortable position',
      'Close your eyes and take 3 deep breaths',
      'Start at your toes — notice any tension and release it',
      'Slowly move your attention upward through each body part',
    ],
    category: 'mindfulness',
    completionMethod: 'timer',
    durationMinutes: 15,
    difficulty: 'moderate',
    moodTargets: ['relaxed', 'neutral'],
    conditions: { timeRange: { start: 18, end: 23 } },
    vibeScoreReward: 8,
  },

  // ── Social ──
  {
    id: 'sc-message-5',
    title: 'Send Some Love',
    description: 'Send a genuine compliment or encouraging message to someone you care about.',
    instructions: [
      'Think of someone who made a positive impact on you recently',
      'Open your messaging app',
      'Write something genuine — be specific about what you appreciate',
      'Hit send and notice how it makes you feel',
    ],
    category: 'social',
    completionMethod: 'manual',
    durationMinutes: 5,
    difficulty: 'easy',
    moodTargets: ['social', 'energetic', 'creative'],
    conditions: {},
    vibeScoreReward: 6,
  },
  {
    id: 'sc-call-15',
    title: 'Catch Up Call',
    description: 'Call someone you haven\'t talked to in a while. Ask how they\'re really doing.',
    instructions: [
      'Think of someone you haven\'t spoken to in a while',
      'Give them a call — a voice call, not a text',
      'Ask how they\'re really doing and listen actively',
      'Share something about your day too',
    ],
    category: 'social',
    completionMethod: 'manual',
    durationMinutes: 15,
    difficulty: 'moderate',
    moodTargets: ['social', 'energetic'],
    conditions: { timeRange: { start: 9, end: 21 } },
    vibeScoreReward: 10,
  },

  // ── Creative ──
  {
    id: 'cr-draw-15',
    title: 'Doodle Time',
    description: 'Draw or doodle for 15 minutes. No rules, no judgment. Let your hand guide you.',
    instructions: [
      'Grab a pen and paper (or a tablet)',
      'Don\'t plan — just start drawing shapes or lines',
      'No judgment, no erasing — keep your hand moving',
      'Let your mind wander as you draw',
    ],
    category: 'creative',
    completionMethod: 'manual',
    durationMinutes: 15,
    difficulty: 'easy',
    moodTargets: ['creative', 'relaxed', 'neutral'],
    conditions: {},
    vibeScoreReward: 7,
  },
  {
    id: 'cr-photo-walk',
    title: 'Photo Walk',
    description: 'Go outside and take 5 photos of things that catch your eye. Share one on Smuppy!',
    instructions: [
      'Head outside with your phone camera ready',
      'Walk slowly and look for interesting details',
      'Take at least 5 photos of things that catch your eye',
      'Pick your favorite and share it on Smuppy!',
    ],
    category: 'creative',
    completionMethod: 'manual',
    durationMinutes: 20,
    difficulty: 'moderate',
    moodTargets: ['creative', 'energetic', 'social'],
    conditions: { requiresOutdoor: true, minTemp: 5, weatherExclude: ['rain', 'snow', 'thunderstorm'] },
    vibeScoreReward: 10,
  },

  // ── Nutrition ──
  {
    id: 'nt-hydrate',
    title: 'Hydration Check',
    description: 'Drink a full glass of water right now. Your body will thank you.',
    instructions: [
      'Get a full glass of water (not a sip!)',
      'Drink it slowly, not all at once',
      'Notice how your body feels after',
    ],
    category: 'nutrition',
    completionMethod: 'manual',
    durationMinutes: 2,
    difficulty: 'easy',
    moodTargets: ['neutral', 'focused', 'energetic', 'relaxed', 'social', 'creative'],
    conditions: {},
    vibeScoreReward: 3,
  },
  {
    id: 'nt-snack-mindful',
    title: 'Mindful Snack',
    description: 'Eat a healthy snack slowly. Focus on the taste, texture, and smell.',
    instructions: [
      'Choose a healthy snack (fruit, nuts, yogurt...)',
      'Sit down — no eating while walking or scrolling',
      'Take small bites and chew slowly',
      'Focus on the taste, texture, and smell of each bite',
    ],
    category: 'nutrition',
    completionMethod: 'manual',
    durationMinutes: 10,
    difficulty: 'easy',
    moodTargets: ['relaxed', 'focused', 'neutral'],
    conditions: {},
    vibeScoreReward: 5,
  },
];

// ============================================================================
// ENGINE
// ============================================================================

/**
 * Generate filtered, context-aware prescriptions.
 */
export function generatePrescriptions(
  mood: MoodType,
  weather: WeatherData,
  preferences: PrescriptionPreferences,
  completedToday: string[],
): Prescription[] {
  const now = new Date();
  const currentHour = now.getHours();

  return PRESCRIPTIONS.filter((rx) => {
    // Already completed today
    if (completedToday.includes(rx.id)) return false;

    // Category preference
    if (!preferences.enabledCategories.includes(rx.category)) return false;

    // Excluded types
    if (preferences.excludedTypes.includes(rx.id)) return false;

    // Difficulty vs activity level
    if (preferences.activityLevel === 'low' && rx.difficulty === 'challenging') return false;
    if (preferences.activityLevel === 'high' && rx.difficulty === 'easy' && rx.category === 'movement') return false;

    // Outdoor preference
    if (rx.conditions.requiresOutdoor) {
      if (preferences.outdoorPreference === 'never') return false;
      if (preferences.outdoorPreference === 'weather_permitting' && !weather.isOutdoorFriendly) return false;
    }

    // Weather conditions
    if (rx.conditions.minTemp !== undefined && weather.temp < rx.conditions.minTemp) return false;
    if (rx.conditions.maxTemp !== undefined && weather.temp > rx.conditions.maxTemp) return false;
    if (rx.conditions.weatherExclude?.includes(weather.condition)) return false;

    // Time range
    if (rx.conditions.timeRange) {
      const { start, end } = rx.conditions.timeRange;
      if (currentHour < start || currentHour > end) return false;
    }

    return true;
  })
    // Prioritize mood-matching prescriptions
    .sort((a, b) => {
      const aMatch = a.moodTargets.includes(mood) ? 1 : 0;
      const bMatch = b.moodTargets.includes(mood) ? 1 : 0;
      return bMatch - aMatch;
    });
}

/**
 * Get a single prescription by ID.
 */
export function getPrescriptionById(id: string): Prescription | undefined {
  return PRESCRIPTIONS.find((rx) => rx.id === id);
}
