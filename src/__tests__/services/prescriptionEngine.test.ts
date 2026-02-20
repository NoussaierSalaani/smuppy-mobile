/**
 * Prescription Engine Tests
 *
 * Tests the generatePrescriptions and getPrescriptionById functions
 * from src/services/prescriptionEngine.ts
 *
 * No external dependencies to mock — this service is pure logic
 * operating on local JSON data. We mock the imported types only.
 */

// ---------------------------------------------------------------------------
// Mocks — the module imports types from moodDetection and weatherService
// but we only need the type definitions, not runtime code.
// ---------------------------------------------------------------------------

jest.mock('../../services/moodDetection', () => ({}));
jest.mock('../../services/weatherService', () => ({}));
jest.mock('../../stores/vibeStore', () => ({}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { generatePrescriptions, getPrescriptionById } from '../../services/prescriptionEngine';
import type { Prescription } from '../../services/prescriptionEngine';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface TestWeatherData {
  temp: number;
  condition: string;
  description: string;
  isOutdoorFriendly: boolean;
  humidity: number;
  windSpeed: number;
  icon: string;
  fetchedAt: number;
}

interface TestPreferences {
  enabledCategories: string[];
  excludedTypes: string[];
  activityLevel: 'low' | 'medium' | 'high';
  outdoorPreference: 'always' | 'weather_permitting' | 'never';
  frequency: string;
}

const makeWeather = (overrides: Partial<TestWeatherData> = {}): TestWeatherData => ({
  temp: 20,
  condition: 'clear',
  description: 'Clear sky',
  isOutdoorFriendly: true,
  humidity: 50,
  windSpeed: 5,
  icon: '01d',
  fetchedAt: Date.now(),
  ...overrides,
});

const makePreferences = (overrides: Partial<TestPreferences> = {}): TestPreferences => ({
  enabledCategories: ['movement', 'mindfulness', 'social', 'creative', 'nutrition'],
  excludedTypes: [],
  activityLevel: 'medium',
  outdoorPreference: 'weather_permitting',
  frequency: 'daily',
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prescriptionEngine', () => {
  // =========================================================================
  // getPrescriptionById
  // =========================================================================

  describe('getPrescriptionById', () => {
    it('should return a prescription for a valid ID', () => {
      const rx = getPrescriptionById('mv-walk-15');

      expect(rx).toBeDefined();
      expect(rx!.id).toBe('mv-walk-15');
      expect(rx!.title).toBe('Sunshine Walk');
      expect(rx!.category).toBe('movement');
    });

    it('should return undefined for an unknown ID', () => {
      const rx = getPrescriptionById('nonexistent-id');

      expect(rx).toBeUndefined();
    });

    it('should return prescriptions with all required fields', () => {
      const rx = getPrescriptionById('mf-breathe-5');

      expect(rx).toBeDefined();
      expect(rx!.id).toBeTruthy();
      expect(rx!.title).toBeTruthy();
      expect(rx!.description).toBeTruthy();
      expect(rx!.instructions).toBeInstanceOf(Array);
      expect(rx!.instructions.length).toBeGreaterThan(0);
      expect(rx!.category).toBeTruthy();
      expect(['timer', 'manual']).toContain(rx!.completionMethod);
      expect(rx!.durationMinutes).toBeGreaterThan(0);
      expect(['easy', 'moderate', 'challenging']).toContain(rx!.difficulty);
      expect(rx!.moodTargets).toBeInstanceOf(Array);
      expect(rx!.conditions).toBeDefined();
      expect(typeof rx!.vibeScoreReward).toBe('number');
    });

    it('should find prescriptions across all categories', () => {
      const categories = ['movement', 'mindfulness', 'social', 'creative', 'nutrition'];
      const ids = ['mv-walk-15', 'mf-breathe-5', 'sc-message-5', 'cr-draw-15', 'nt-hydrate'];

      ids.forEach((id, i) => {
        const rx = getPrescriptionById(id);
        expect(rx).toBeDefined();
        expect(rx!.category).toBe(categories[i]);
      });
    });
  });

  // =========================================================================
  // generatePrescriptions
  // =========================================================================

  describe('generatePrescriptions', () => {
    it('should return an array of prescriptions', () => {
      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        makePreferences() as never,
        [],
      );

      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should exclude already completed prescriptions', () => {
      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        makePreferences() as never,
        ['nt-hydrate'],
      );

      const hydrate = results.find((rx: Prescription) => rx.id === 'nt-hydrate');
      expect(hydrate).toBeUndefined();
    });

    it('should filter by enabled categories', () => {
      const prefs = makePreferences({ enabledCategories: ['nutrition'] });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      results.forEach((rx: Prescription) => {
        expect(rx.category).toBe('nutrition');
      });
    });

    it('should exclude prescriptions in excludedTypes', () => {
      const prefs = makePreferences({ excludedTypes: ['nt-hydrate', 'nt-snack-mindful'] });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      const excluded = results.filter((rx: Prescription) =>
        rx.id === 'nt-hydrate' || rx.id === 'nt-snack-mindful'
      );
      expect(excluded).toHaveLength(0);
    });

    it('should exclude challenging prescriptions for low activity level', () => {
      const prefs = makePreferences({ activityLevel: 'low' });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      const challenging = results.filter((rx: Prescription) => rx.difficulty === 'challenging');
      expect(challenging).toHaveLength(0);
    });

    it('should exclude easy movement prescriptions for high activity level', () => {
      const prefs = makePreferences({ activityLevel: 'high' });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      const easyMovement = results.filter(
        (rx: Prescription) => rx.difficulty === 'easy' && rx.category === 'movement'
      );
      expect(easyMovement).toHaveLength(0);
    });

    it('should exclude outdoor prescriptions when outdoorPreference is never', () => {
      const prefs = makePreferences({ outdoorPreference: 'never' });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      const outdoor = results.filter((rx: Prescription) => rx.conditions.requiresOutdoor);
      expect(outdoor).toHaveLength(0);
    });

    it('should exclude outdoor prescriptions when weather_permitting and weather is not outdoor-friendly', () => {
      const weather = makeWeather({ isOutdoorFriendly: false });
      const prefs = makePreferences({ outdoorPreference: 'weather_permitting' });

      const results = generatePrescriptions(
        'neutral',
        weather as never,
        prefs as never,
        [],
      );

      const outdoor = results.filter((rx: Prescription) => rx.conditions.requiresOutdoor);
      expect(outdoor).toHaveLength(0);
    });

    it('should include outdoor prescriptions when weather_permitting and weather is outdoor-friendly', () => {
      const weather = makeWeather({ isOutdoorFriendly: true, temp: 20, condition: 'clear' });
      const prefs = makePreferences({
        outdoorPreference: 'weather_permitting',
        enabledCategories: ['movement', 'creative'],
      });

      const results = generatePrescriptions(
        'neutral',
        weather as never,
        prefs as never,
        [],
      );

      const outdoor = results.filter((rx: Prescription) => rx.conditions.requiresOutdoor);
      expect(outdoor.length).toBeGreaterThan(0);
    });

    it('should exclude prescriptions when temperature is below minTemp', () => {
      const weather = makeWeather({ temp: -5, isOutdoorFriendly: true });
      const prefs = makePreferences({ outdoorPreference: 'always' });

      const results = generatePrescriptions(
        'neutral',
        weather as never,
        prefs as never,
        [],
      );

      // Sunshine Walk requires minTemp of 5
      const walk = results.find((rx: Prescription) => rx.id === 'mv-walk-15');
      expect(walk).toBeUndefined();
    });

    it('should exclude prescriptions when weather condition is in weatherExclude', () => {
      const weather = makeWeather({ condition: 'rain', isOutdoorFriendly: false });
      const prefs = makePreferences({ outdoorPreference: 'always' });

      const results = generatePrescriptions(
        'neutral',
        weather as never,
        prefs as never,
        [],
      );

      // Sunshine Walk and Photo Walk exclude 'rain'
      const walk = results.find((rx: Prescription) => rx.id === 'mv-walk-15');
      expect(walk).toBeUndefined();

      const photoWalk = results.find((rx: Prescription) => rx.id === 'cr-photo-walk');
      expect(photoWalk).toBeUndefined();
    });

    it('should prioritize mood-matching prescriptions (sort order)', () => {
      const prefs = makePreferences({
        enabledCategories: ['movement', 'mindfulness', 'social', 'creative', 'nutrition'],
      });

      const results = generatePrescriptions(
        'relaxed',
        makeWeather() as never,
        prefs as never,
        [],
      );

      if (results.length >= 2) {
        // First results should have 'relaxed' in moodTargets
        const firstFew = results.slice(0, 3);
        const relaxedCount = firstFew.filter((rx: Prescription) =>
          rx.moodTargets.includes('relaxed')
        ).length;
        // At least some of the top results should match
        expect(relaxedCount).toBeGreaterThan(0);
      }
    });

    it('should return empty array when all categories are disabled', () => {
      const prefs = makePreferences({ enabledCategories: [] });

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        prefs as never,
        [],
      );

      expect(results).toHaveLength(0);
    });

    it('should return empty array when all prescriptions are completed', () => {
      // Get all prescription IDs first
      const allIds = [
        'mv-walk-15', 'mv-stretch-5', 'mv-dance-10', 'mv-yoga-20',
        'mf-breathe-5', 'mf-gratitude-10', 'mf-body-scan-15',
        'sc-message-5', 'sc-call-15',
        'cr-draw-15', 'cr-photo-walk',
        'nt-hydrate', 'nt-snack-mindful',
      ];

      const results = generatePrescriptions(
        'neutral',
        makeWeather() as never,
        makePreferences() as never,
        allIds,
      );

      expect(results).toHaveLength(0);
    });

    it('should return prescriptions as Prescription objects with correct shape', () => {
      const results = generatePrescriptions(
        'energetic',
        makeWeather() as never,
        makePreferences() as never,
        [],
      );

      results.forEach((rx: Prescription) => {
        expect(typeof rx.id).toBe('string');
        expect(typeof rx.title).toBe('string');
        expect(typeof rx.description).toBe('string');
        expect(Array.isArray(rx.instructions)).toBe(true);
        expect(typeof rx.category).toBe('string');
        expect(typeof rx.completionMethod).toBe('string');
        expect(typeof rx.durationMinutes).toBe('number');
        expect(typeof rx.difficulty).toBe('string');
        expect(Array.isArray(rx.moodTargets)).toBe(true);
        expect(typeof rx.conditions).toBe('object');
        expect(typeof rx.vibeScoreReward).toBe('number');
      });
    });
  });
});
