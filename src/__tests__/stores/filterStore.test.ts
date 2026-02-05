/**
 * Filter Store Tests
 * Tests for AR filter state management
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import { useFilterStore, FILTER_DEFINITIONS } from '../../stores/filterStore';
import type { PoseLandmarks } from '../../filters/types';

describe('FilterStore', () => {
  beforeEach(() => {
    useFilterStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have no active filter', () => {
      expect(useFilterStore.getState().activeFilter).toBeNull();
    });

    it('should have empty overlays', () => {
      expect(useFilterStore.getState().activeOverlays).toEqual([]);
    });

    it('should have body tracking disabled', () => {
      expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(false);
    });

    it('should have null body pose', () => {
      expect(useFilterStore.getState().bodyPose).toBeNull();
    });
  });

  describe('Filter Actions', () => {
    it('should set a filter by ID', () => {
      const filterId = FILTER_DEFINITIONS[0].id;
      useFilterStore.getState().setFilter(filterId);

      const state = useFilterStore.getState();
      expect(state.activeFilter).not.toBeNull();
      expect(state.activeFilter!.filterId).toBe(filterId);
    });

    it('should use default intensity from definition', () => {
      const definition = FILTER_DEFINITIONS[0];
      useFilterStore.getState().setFilter(definition.id);

      expect(useFilterStore.getState().activeFilter!.intensity).toBe(definition.defaultIntensity);
    });

    it('should accept custom intensity', () => {
      const filterId = FILTER_DEFINITIONS[0].id;
      useFilterStore.getState().setFilter(filterId, 0.8);

      expect(useFilterStore.getState().activeFilter!.intensity).toBe(0.8);
    });

    it('should clear filter when passed null', () => {
      useFilterStore.getState().setFilter(FILTER_DEFINITIONS[0].id);
      useFilterStore.getState().setFilter(null);

      expect(useFilterStore.getState().activeFilter).toBeNull();
    });

    it('should ignore invalid filter IDs', () => {
      useFilterStore.getState().setFilter('non-existent-filter');
      expect(useFilterStore.getState().activeFilter).toBeNull();
    });

    it('should clear filter with clearFilter', () => {
      useFilterStore.getState().setFilter(FILTER_DEFINITIONS[0].id);
      useFilterStore.getState().clearFilter();

      expect(useFilterStore.getState().activeFilter).toBeNull();
    });
  });

  describe('Filter Intensity', () => {
    it('should update intensity of active filter', () => {
      useFilterStore.getState().setFilter(FILTER_DEFINITIONS[0].id);
      useFilterStore.getState().setFilterIntensity(0.9);

      expect(useFilterStore.getState().activeFilter!.intensity).toBe(0.9);
    });

    it('should clamp intensity to 0-1 range', () => {
      useFilterStore.getState().setFilter(FILTER_DEFINITIONS[0].id);

      useFilterStore.getState().setFilterIntensity(1.5);
      expect(useFilterStore.getState().activeFilter!.intensity).toBe(1);

      useFilterStore.getState().setFilterIntensity(-0.5);
      expect(useFilterStore.getState().activeFilter!.intensity).toBe(0);
    });

    it('should not crash when no active filter', () => {
      expect(() => {
        useFilterStore.getState().setFilterIntensity(0.5);
      }).not.toThrow();
    });
  });

  describe('Body Tracking', () => {
    it('should enable body tracking', () => {
      useFilterStore.getState().enableBodyTracking();
      expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(true);
    });

    it('should disable body tracking', () => {
      useFilterStore.getState().enableBodyTracking();
      useFilterStore.getState().disableBodyTracking();
      expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(false);
    });

    it('should auto-enable body tracking for filters that require it', () => {
      const bodyFilter = FILTER_DEFINITIONS.find((f) => f.requiresBodyTracking);
      if (bodyFilter) {
        useFilterStore.getState().setFilter(bodyFilter.id);
        expect(useFilterStore.getState().isBodyTrackingEnabled).toBe(true);
      }
    });

    it('should update body pose', () => {
      const mockPose: PoseLandmarks = { landmarks: [], worldLandmarks: [], timestamp: 0 };
      useFilterStore.getState().updateBodyPose(mockPose);
      expect(useFilterStore.getState().bodyPose).toBe(mockPose);
    });
  });

  describe('Overlay Actions', () => {
    it('should add an overlay', () => {
      const id = useFilterStore.getState().addOverlay('workout_timer');
      expect(id).toBe('test-uuid-1234');
      expect(useFilterStore.getState().activeOverlays).toHaveLength(1);
    });

    it('should set default params for overlay type', () => {
      useFilterStore.getState().addOverlay('workout_timer');
      const overlay = useFilterStore.getState().activeOverlays[0];

      expect(overlay.type).toBe('workout_timer');
      expect(overlay.params).toHaveProperty('totalSeconds');
      expect(overlay.params).toHaveProperty('isRunning');
      expect(overlay.isVisible).toBe(true);
    });

    it('should accept custom position', () => {
      useFilterStore.getState().addOverlay('rep_counter', { x: 0.3, y: 0.7 });
      const overlay = useFilterStore.getState().activeOverlays[0];

      expect(overlay.position.x).toBe(0.3);
      expect(overlay.position.y).toBe(0.7);
    });

    it('should remove an overlay', () => {
      const id = useFilterStore.getState().addOverlay('workout_timer');
      useFilterStore.getState().removeOverlay(id);

      expect(useFilterStore.getState().activeOverlays).toHaveLength(0);
    });

    it('should update overlay params', () => {
      const id = useFilterStore.getState().addOverlay('rep_counter');
      useFilterStore.getState().updateOverlayParams(id, { currentReps: 5 });

      const overlay = useFilterStore.getState().activeOverlays[0];
      expect(overlay.params.currentReps).toBe(5);
    });
  });

  describe('Utilities', () => {
    it('should get all filter definitions', () => {
      const filters = useFilterStore.getState().getAllFilters();
      expect(filters.length).toBeGreaterThan(0);
      expect(filters).toBe(FILTER_DEFINITIONS);
    });

    it('should get filters by category', () => {
      const bodyFilters = useFilterStore.getState().getFiltersByCategory('body');
      expect(bodyFilters.length).toBeGreaterThan(0);
      bodyFilters.forEach((f) => expect(f.category).toBe('body'));
    });

    it('should get a filter definition by ID', () => {
      const definition = useFilterStore.getState().getFilterDefinition(FILTER_DEFINITIONS[0].id);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(FILTER_DEFINITIONS[0].id);
    });

    it('should return undefined for unknown filter ID', () => {
      expect(useFilterStore.getState().getFilterDefinition('unknown')).toBeUndefined();
    });

    it('should reset all state', () => {
      useFilterStore.getState().setFilter(FILTER_DEFINITIONS[0].id);
      useFilterStore.getState().addOverlay('workout_timer');
      useFilterStore.getState().enableBodyTracking();

      useFilterStore.getState().reset();

      const state = useFilterStore.getState();
      expect(state.activeFilter).toBeNull();
      expect(state.activeOverlays).toEqual([]);
      expect(state.isBodyTrackingEnabled).toBe(false);
    });
  });
});
