/**
 * Vibe Profile Service Tests
 *
 * Tests the buildVibeProfile function from src/services/vibeProfile.ts
 *
 * This service is pure logic — it takes account type and interest tags
 * and returns a VibeProfileConfig. No external dependencies to mock.
 */

// ---------------------------------------------------------------------------
// Mocks — vibeProfile imports MoodType from moodDetection
// ---------------------------------------------------------------------------

jest.mock('../../services/moodDetection', () => ({}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { buildVibeProfile } from '../../services/vibeProfile';
import type { VibeProfileConfig, AccountType } from '../../services/vibeProfile';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vibeProfile', () => {
  // =========================================================================
  // Pro Business — All vibe features disabled
  // =========================================================================

  describe('pro_business accounts', () => {
    it('should disable all vibe features', () => {
      const config = buildVibeProfile('pro_business');

      expect(config.vibeEnabled).toBe(false);
      expect(config.guardianMinSessionMinutes).toBe(0);
      expect(config.guardianAlertThreshold).toBe(1);
      expect(config.guardianPassiveTimeoutMs).toBe(0);
      expect(config.positiveMoods).toHaveLength(0);
    });

    it('should disable features regardless of tags', () => {
      const config = buildVibeProfile('pro_business', ['fitness', 'yoga', 'music']);

      expect(config.vibeEnabled).toBe(false);
      expect(config.positiveMoods).toHaveLength(0);
    });
  });

  // =========================================================================
  // Personal accounts
  // =========================================================================

  describe('personal accounts', () => {
    it('should enable vibe features', () => {
      const config = buildVibeProfile('personal');

      expect(config.vibeEnabled).toBe(true);
    });

    it('should use default thresholds when no interests specified', () => {
      const config = buildVibeProfile('personal');

      expect(config.guardianMinSessionMinutes).toBe(2);
      expect(config.guardianPassiveTimeoutMs).toBe(90_000);
      expect(config.guardianAlertThreshold).toBe(0.7);
    });

    it('should use default thresholds with empty tags array', () => {
      const config = buildVibeProfile('personal', []);

      expect(config.guardianMinSessionMinutes).toBe(2);
      expect(config.guardianPassiveTimeoutMs).toBe(90_000);
      expect(config.guardianAlertThreshold).toBe(0.7);
    });

    it('should set positive moods without "focused" for personal', () => {
      const config = buildVibeProfile('personal');

      expect(config.positiveMoods).toContain('energetic');
      expect(config.positiveMoods).toContain('social');
      expect(config.positiveMoods).toContain('creative');
      expect(config.positiveMoods).not.toContain('focused');
    });

    // --- High session interests ---

    it('should increase guardianMinSessionMinutes for fitness interests', () => {
      const config = buildVibeProfile('personal', ['fitness']);

      expect(config.guardianMinSessionMinutes).toBe(3);
    });

    it('should increase passive timeout for gaming interests', () => {
      const config = buildVibeProfile('personal', ['gaming']);

      expect(config.guardianPassiveTimeoutMs).toBe(120_000);
    });

    it('should increase passive timeout for education interests', () => {
      const config = buildVibeProfile('personal', ['education']);

      expect(config.guardianPassiveTimeoutMs).toBe(120_000);
    });

    it('should increase session minutes for art interests', () => {
      const config = buildVibeProfile('personal', ['art']);

      expect(config.guardianMinSessionMinutes).toBe(3);
    });

    it('should handle all high-session interests', () => {
      const highSessionInterests = [
        'fitness', 'workout', 'gaming', 'education', 'tutorial',
        'photography', 'art', 'design', 'music', 'dance',
      ];

      for (const interest of highSessionInterests) {
        const config = buildVibeProfile('personal', [interest]);
        expect(config.guardianMinSessionMinutes).toBe(3);
        expect(config.guardianPassiveTimeoutMs).toBe(120_000);
      }
    });

    // --- Calm interests ---

    it('should decrease passive timeout for meditation interests', () => {
      const config = buildVibeProfile('personal', ['meditation']);

      expect(config.guardianPassiveTimeoutMs).toBe(60_000);
    });

    it('should lower alert threshold for calm interests', () => {
      const config = buildVibeProfile('personal', ['yoga']);

      expect(config.guardianAlertThreshold).toBe(0.6);
    });

    it('should handle all calm interests', () => {
      const calmInterests = [
        'meditation', 'yoga', 'wellness', 'nature', 'asmr',
        'relaxation', 'mindfulness', 'sleep',
      ];

      for (const interest of calmInterests) {
        const config = buildVibeProfile('personal', [interest]);
        expect(config.guardianPassiveTimeoutMs).toBe(60_000);
        expect(config.guardianAlertThreshold).toBe(0.6);
      }
    });

    // --- Mixed interests ---

    it('should prioritize calm interests for passive timeout when both calm and high-session', () => {
      // Both 'yoga' (calm) and 'fitness' (high-session) present
      // The code checks hasCalm first for passive timeout
      const config = buildVibeProfile('personal', ['yoga', 'fitness']);

      expect(config.guardianPassiveTimeoutMs).toBe(60_000);
    });

    it('should use high-session guardianMinSessionMinutes when high-session interest present alongside calm', () => {
      const config = buildVibeProfile('personal', ['meditation', 'gaming']);

      expect(config.guardianMinSessionMinutes).toBe(3);
    });

    // --- Case insensitivity ---

    it('should normalize tags to lowercase', () => {
      const config = buildVibeProfile('personal', ['FITNESS', 'YOGA']);

      expect(config.guardianMinSessionMinutes).toBe(3);
      expect(config.guardianAlertThreshold).toBe(0.6);
    });

    it('should trim whitespace from tags', () => {
      const config = buildVibeProfile('personal', ['  fitness  ']);

      expect(config.guardianMinSessionMinutes).toBe(3);
    });

    // --- Unrelated interests ---

    it('should use default thresholds for non-matching interests', () => {
      const config = buildVibeProfile('personal', ['cooking', 'travel', 'politics']);

      expect(config.guardianMinSessionMinutes).toBe(2);
      expect(config.guardianPassiveTimeoutMs).toBe(90_000);
      expect(config.guardianAlertThreshold).toBe(0.7);
    });
  });

  // =========================================================================
  // Pro Creator accounts
  // =========================================================================

  describe('pro_creator accounts', () => {
    it('should enable vibe features', () => {
      const config = buildVibeProfile('pro_creator');

      expect(config.vibeEnabled).toBe(true);
    });

    it('should include "focused" in positive moods for creators', () => {
      const config = buildVibeProfile('pro_creator');

      expect(config.positiveMoods).toContain('energetic');
      expect(config.positiveMoods).toContain('social');
      expect(config.positiveMoods).toContain('creative');
      expect(config.positiveMoods).toContain('focused');
    });

    it('should apply same interest-based thresholds as personal', () => {
      const config = buildVibeProfile('pro_creator', ['fitness']);

      expect(config.guardianMinSessionMinutes).toBe(3);
      expect(config.guardianPassiveTimeoutMs).toBe(120_000);
    });

    it('should apply calm interest thresholds', () => {
      const config = buildVibeProfile('pro_creator', ['meditation']);

      expect(config.guardianPassiveTimeoutMs).toBe(60_000);
      expect(config.guardianAlertThreshold).toBe(0.6);
    });
  });

  // =========================================================================
  // Undefined account type
  // =========================================================================

  describe('undefined account type', () => {
    it('should enable vibe features (treated like personal)', () => {
      const config = buildVibeProfile(undefined);

      expect(config.vibeEnabled).toBe(true);
    });

    it('should use default thresholds', () => {
      const config = buildVibeProfile(undefined);

      expect(config.guardianMinSessionMinutes).toBe(2);
      expect(config.guardianPassiveTimeoutMs).toBe(90_000);
      expect(config.guardianAlertThreshold).toBe(0.7);
    });

    it('should NOT include "focused" in positive moods (not a creator)', () => {
      const config = buildVibeProfile(undefined);

      expect(config.positiveMoods).not.toContain('focused');
    });
  });

  // =========================================================================
  // VibeProfileConfig shape
  // =========================================================================

  describe('VibeProfileConfig shape', () => {
    it('should always return all required fields', () => {
      const accountTypes: (AccountType | undefined)[] = ['personal', 'pro_creator', 'pro_business', undefined];

      for (const type of accountTypes) {
        const config = buildVibeProfile(type);

        expect(typeof config.vibeEnabled).toBe('boolean');
        expect(typeof config.guardianMinSessionMinutes).toBe('number');
        expect(typeof config.guardianAlertThreshold).toBe('number');
        expect(typeof config.guardianPassiveTimeoutMs).toBe('number');
        expect(Array.isArray(config.positiveMoods)).toBe(true);
      }
    });
  });
});
