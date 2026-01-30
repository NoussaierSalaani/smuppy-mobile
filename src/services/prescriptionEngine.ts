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

export interface Prescription {
  id: string;
  title: string;
  description: string;
  category: PrescriptionCategory;
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
    category: 'movement',
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
    category: 'movement',
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
    category: 'movement',
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
    category: 'movement',
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
    category: 'mindfulness',
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
    category: 'mindfulness',
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
    category: 'mindfulness',
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
    category: 'social',
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
    category: 'social',
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
    category: 'creative',
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
    category: 'creative',
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
    category: 'nutrition',
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
    category: 'nutrition',
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
