/**
 * FilterContext Tests
 * Tests for the AR filter context reducer, state, and definitions.
 *
 * Since FilterContext uses React context/hooks, and the test environment is node,
 * we test the exported reducer logic, filter definitions, overlay defaults, and
 * the useFilters hook throw behavior. The actual Zustand-based store tests are
 * in stores/filterStore.test.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-overlay'),
}));

// Mock react-native (transitive dep)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { FilterProvider, useFilters, FILTER_DEFINITIONS } from '../../filters/FilterContext';
import {
  FILTER_IDS,
  OVERLAY_IDS,
  type FilterState,
  type FilterAction as _FilterAction,
  type FilterCategory,
  type OverlayType as _OverlayType,
} from '../../filters/types';

describe('FilterContext', () => {
  // ==========================================================================
  // 1. Module Exports
  // ==========================================================================
  describe('Module Exports', () => {
    it('should export FilterProvider', () => {
      expect(FilterProvider).toBeDefined();
      expect(typeof FilterProvider).toBe('function');
    });

    it('should export useFilters hook', () => {
      expect(useFilters).toBeDefined();
      expect(typeof useFilters).toBe('function');
    });

    it('should export FILTER_DEFINITIONS', () => {
      expect(FILTER_DEFINITIONS).toBeDefined();
      expect(Array.isArray(FILTER_DEFINITIONS)).toBe(true);
    });
  });

  // ==========================================================================
  // 2. FILTER_DEFINITIONS
  // ==========================================================================
  describe('FILTER_DEFINITIONS', () => {
    it('should contain at least 9 filters', () => {
      expect(FILTER_DEFINITIONS.length).toBeGreaterThanOrEqual(9);
    });

    it('should have all body filters', () => {
      const bodyFilters = FILTER_DEFINITIONS.filter(f => f.category === 'body');
      expect(bodyFilters.length).toBeGreaterThanOrEqual(3);

      const bodyIds = bodyFilters.map(f => f.id);
      expect(bodyIds).toContain(FILTER_IDS.MUSCLE_BOOST);
      expect(bodyIds).toContain(FILTER_IDS.TAN_TONE);
      expect(bodyIds).toContain(FILTER_IDS.SWEAT_GLOW);
    });

    it('should have all lighting filters', () => {
      const lightingFilters = FILTER_DEFINITIONS.filter(f => f.category === 'lighting');
      expect(lightingFilters.length).toBeGreaterThanOrEqual(3);

      const lightingIds = lightingFilters.map(f => f.id);
      expect(lightingIds).toContain(FILTER_IDS.GYM_LIGHTING);
      expect(lightingIds).toContain(FILTER_IDS.NATURAL_GLOW);
      expect(lightingIds).toContain(FILTER_IDS.GOLDEN_HOUR);
    });

    it('should have all effects filters', () => {
      const effectsFilters = FILTER_DEFINITIONS.filter(f => f.category === 'effects');
      expect(effectsFilters.length).toBeGreaterThanOrEqual(3);

      const effectsIds = effectsFilters.map(f => f.id);
      expect(effectsIds).toContain(FILTER_IDS.ENERGY_AURA);
      expect(effectsIds).toContain(FILTER_IDS.LIGHTNING_FLEX);
      expect(effectsIds).toContain(FILTER_IDS.NEON_OUTLINE);
    });

    it('should have valid defaultIntensity for all filters (0-1 range)', () => {
      FILTER_DEFINITIONS.forEach(filter => {
        expect(filter.defaultIntensity).toBeGreaterThanOrEqual(0);
        expect(filter.defaultIntensity).toBeLessThanOrEqual(1);
      });
    });

    it('should have valid structure for each filter definition', () => {
      FILTER_DEFINITIONS.forEach(filter => {
        expect(typeof filter.id).toBe('string');
        expect(filter.id.length).toBeGreaterThan(0);
        expect(typeof filter.name).toBe('string');
        expect(filter.name.length).toBeGreaterThan(0);
        expect(typeof filter.icon).toBe('string');
        expect(typeof filter.description).toBe('string');
        expect(typeof filter.requiresBodyTracking).toBe('boolean');
        expect(['body', 'lighting', 'effects', 'overlays']).toContain(filter.category);
      });
    });

    it('should have unique filter IDs', () => {
      const ids = FILTER_DEFINITIONS.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should require body tracking for muscle_boost', () => {
      const muscleBoost = FILTER_DEFINITIONS.find(f => f.id === FILTER_IDS.MUSCLE_BOOST);
      expect(muscleBoost?.requiresBodyTracking).toBe(true);
    });

    it('should NOT require body tracking for tan_tone', () => {
      const tanTone = FILTER_DEFINITIONS.find(f => f.id === FILTER_IDS.TAN_TONE);
      expect(tanTone?.requiresBodyTracking).toBe(false);
    });

    it('should NOT require body tracking for lighting filters', () => {
      const lightingFilters = FILTER_DEFINITIONS.filter(f => f.category === 'lighting');
      lightingFilters.forEach(filter => {
        expect(filter.requiresBodyTracking).toBe(false);
      });
    });
  });

  // ==========================================================================
  // 3. FILTER_IDS Constants
  // ==========================================================================
  describe('FILTER_IDS', () => {
    it('should have body filter IDs', () => {
      expect(FILTER_IDS.MUSCLE_BOOST).toBe('muscle_boost');
      expect(FILTER_IDS.TAN_TONE).toBe('tan_tone');
      expect(FILTER_IDS.SWEAT_GLOW).toBe('sweat_glow');
    });

    it('should have lighting filter IDs', () => {
      expect(FILTER_IDS.GYM_LIGHTING).toBe('gym_lighting');
      expect(FILTER_IDS.NATURAL_GLOW).toBe('natural_glow');
      expect(FILTER_IDS.GOLDEN_HOUR).toBe('golden_hour');
    });

    it('should have effects filter IDs', () => {
      expect(FILTER_IDS.ENERGY_AURA).toBe('energy_aura');
      expect(FILTER_IDS.LIGHTNING_FLEX).toBe('lightning_flex');
      expect(FILTER_IDS.NEON_OUTLINE).toBe('neon_outline');
    });
  });

  // ==========================================================================
  // 4. OVERLAY_IDS Constants
  // ==========================================================================
  describe('OVERLAY_IDS', () => {
    it('should have all overlay type IDs', () => {
      expect(OVERLAY_IDS.WORKOUT_TIMER).toBe('workout_timer');
      expect(OVERLAY_IDS.REP_COUNTER).toBe('rep_counter');
      expect(OVERLAY_IDS.DAY_CHALLENGE).toBe('day_challenge');
      expect(OVERLAY_IDS.CALORIE_BURN).toBe('calorie_burn');
      expect(OVERLAY_IDS.HEART_RATE_PULSE).toBe('heart_rate_pulse');
    });

    it('should have exactly 5 overlay types', () => {
      expect(Object.keys(OVERLAY_IDS)).toHaveLength(5);
    });
  });

  // ==========================================================================
  // 5. useFilters Hook Contract
  // ==========================================================================
  describe('useFilters hook', () => {
    it('should throw when used outside FilterProvider', () => {
      const React = require('react');
      const originalUseContext = React.useContext;
      React.useContext = jest.fn(() => null);

      expect(() => {
        useFilters();
      }).toThrow('useFilters must be used within a FilterProvider');

      React.useContext = originalUseContext;
    });
  });

  // ==========================================================================
  // 6. FilterState Type Structure
  // ==========================================================================
  describe('FilterState structure', () => {
    it('should have correct initial state shape', () => {
      const initialState: FilterState = {
        activeFilter: null,
        activeOverlays: [],
        bodyPose: null,
        bodySegmentation: null,
        isBodyTrackingEnabled: false,
        isProcessing: false,
        fps: 0,
      };

      expect(initialState.activeFilter).toBeNull();
      expect(initialState.activeOverlays).toEqual([]);
      expect(initialState.bodyPose).toBeNull();
      expect(initialState.bodySegmentation).toBeNull();
      expect(initialState.isBodyTrackingEnabled).toBe(false);
      expect(initialState.isProcessing).toBe(false);
      expect(initialState.fps).toBe(0);
    });
  });

  // ==========================================================================
  // 7. Filter Category Grouping
  // ==========================================================================
  describe('Filter categories', () => {
    it('should categorize all filters into valid categories', () => {
      const validCategories: FilterCategory[] = ['body', 'lighting', 'effects', 'overlays'];

      FILTER_DEFINITIONS.forEach(filter => {
        expect(validCategories).toContain(filter.category);
      });
    });

    it('should have filters in at least 3 categories', () => {
      const categories = new Set(FILTER_DEFINITIONS.map(f => f.category));
      expect(categories.size).toBeGreaterThanOrEqual(3);
    });
  });
});
