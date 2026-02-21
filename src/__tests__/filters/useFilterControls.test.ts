/**
 * useFilterControls Hook Tests
 * Tests for the simplified filter control interface used in camera screens.
 *
 * Since the hook uses useFilters from the Zustand store, we mock that
 * and test the logic layer of useFilterControls.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-overlay'),
}));

// Track all store actions via mocks
const mockSetFilter = jest.fn();
const mockSetFilterIntensity = jest.fn();
const mockClearFilter = jest.fn();
const mockAddOverlay = jest.fn(() => 'overlay-id-1');
const mockRemoveOverlay = jest.fn();
const mockUpdateOverlayParams = jest.fn();
const mockReset = jest.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetFiltersByCategory = jest.fn((): any[] => []);

let mockActiveFilter: { filterId: string; intensity: number } | null = null;
let mockActiveOverlays: Array<{ id: string; type: string }> = [];

// Mock the filterStore to provide useFilters
jest.mock('../../stores/filterStore', () => ({
  useFilters: jest.fn(() => ({
    activeFilter: mockActiveFilter,
    activeOverlays: mockActiveOverlays,
    setFilter: mockSetFilter,
    setFilterIntensity: mockSetFilterIntensity,
    clearFilter: mockClearFilter,
    addOverlay: mockAddOverlay,
    removeOverlay: mockRemoveOverlay,
    updateOverlayParams: mockUpdateOverlayParams,
    reset: mockReset,
    getFiltersByCategory: mockGetFiltersByCategory,
  })),
  FILTER_DEFINITIONS: [
    { id: 'muscle_boost', name: 'Muscle Boost', category: 'body', defaultIntensity: 0.5, requiresBodyTracking: true },
    { id: 'tan_tone', name: 'Tan & Tone', category: 'body', defaultIntensity: 0.5, requiresBodyTracking: false },
    { id: 'sweat_glow', name: 'Sweat Glow', category: 'body', defaultIntensity: 0.4, requiresBodyTracking: true },
    { id: 'gym_lighting', name: 'Gym Lighting', category: 'lighting', defaultIntensity: 0.6, requiresBodyTracking: false },
    { id: 'natural_glow', name: 'Natural Glow', category: 'lighting', defaultIntensity: 0.5, requiresBodyTracking: false },
    { id: 'golden_hour', name: 'Golden Hour', category: 'lighting', defaultIntensity: 0.5, requiresBodyTracking: false },
    { id: 'energy_aura', name: 'Energy Aura', category: 'effects', defaultIntensity: 0.6, requiresBodyTracking: true },
    { id: 'lightning_flex', name: 'Lightning Flex', category: 'effects', defaultIntensity: 0.7, requiresBodyTracking: true },
    { id: 'neon_outline', name: 'Neon Outline', category: 'effects', defaultIntensity: 0.5, requiresBodyTracking: true },
  ],
}));

// Mock React hooks for hook execution in node environment
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: jest.fn((fn: unknown) => fn),
  useMemo: jest.fn((fn: () => unknown) => fn()),
}));

import { useFilterControls } from '../../filters/hooks/useFilterControls';

describe('useFilterControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveFilter = null;
    mockActiveOverlays = [];
  });

  // ==========================================================================
  // 1. Module Export
  // ==========================================================================
  describe('Module Export', () => {
    it('should export useFilterControls as a function', () => {
      expect(typeof useFilterControls).toBe('function');
    });
  });

  // ==========================================================================
  // 2. Derived State - No Active Filter
  // ==========================================================================
  describe('Derived State (no active filter)', () => {
    it('should return null activeFilterId when no filter is set', () => {
      const controls = useFilterControls();
      expect(controls.activeFilterId).toBeNull();
    });

    it('should return null activeFilterName when no filter is set', () => {
      const controls = useFilterControls();
      expect(controls.activeFilterName).toBeNull();
    });

    it('should default filterIntensity to 0.5 when no filter', () => {
      const controls = useFilterControls();
      expect(controls.filterIntensity).toBe(0.5);
    });

    it('should return hasActiveFilter as false', () => {
      const controls = useFilterControls();
      expect(controls.hasActiveFilter).toBe(false);
    });

    it('should return hasActiveOverlays as false when no overlays', () => {
      const controls = useFilterControls();
      expect(controls.hasActiveOverlays).toBe(false);
    });

    it('should return overlayCount as 0', () => {
      const controls = useFilterControls();
      expect(controls.overlayCount).toBe(0);
    });
  });

  // ==========================================================================
  // 3. Derived State - Active Filter
  // ==========================================================================
  describe('Derived State (with active filter)', () => {
    beforeEach(() => {
      mockActiveFilter = { filterId: 'muscle_boost', intensity: 0.7 };
    });

    it('should return correct activeFilterId', () => {
      const controls = useFilterControls();
      expect(controls.activeFilterId).toBe('muscle_boost');
    });

    it('should return correct activeFilterName from definitions', () => {
      const controls = useFilterControls();
      expect(controls.activeFilterName).toBe('Muscle Boost');
    });

    it('should return correct filterIntensity', () => {
      const controls = useFilterControls();
      expect(controls.filterIntensity).toBe(0.7);
    });

    it('should return hasActiveFilter as true', () => {
      const controls = useFilterControls();
      expect(controls.hasActiveFilter).toBe(true);
    });
  });

  // ==========================================================================
  // 4. Derived State - Active Overlays
  // ==========================================================================
  describe('Derived State (with overlays)', () => {
    beforeEach(() => {
      mockActiveOverlays = [
        { id: 'ov-1', type: 'workout_timer' },
        { id: 'ov-2', type: 'rep_counter' },
      ];
    });

    it('should return hasActiveOverlays as true', () => {
      const controls = useFilterControls();
      expect(controls.hasActiveOverlays).toBe(true);
    });

    it('should return correct overlayCount', () => {
      const controls = useFilterControls();
      expect(controls.overlayCount).toBe(2);
    });
  });

  // ==========================================================================
  // 5. Quick Actions
  // ==========================================================================
  describe('Quick Actions', () => {
    it('applyFilter should call setFilter with filterId', () => {
      const controls = useFilterControls();
      controls.applyFilter('gym_lighting');
      expect(mockSetFilter).toHaveBeenCalledWith('gym_lighting');
    });

    it('removeFilter should call clearFilter', () => {
      const controls = useFilterControls();
      controls.removeFilter();
      expect(mockClearFilter).toHaveBeenCalled();
    });

    it('adjustIntensity should call setFilterIntensity with clamped value', () => {
      const controls = useFilterControls();
      controls.adjustIntensity(0.8);
      expect(mockSetFilterIntensity).toHaveBeenCalledWith(0.8);
    });

    it('adjustIntensity should clamp to max 1', () => {
      const controls = useFilterControls();
      controls.adjustIntensity(1.5);
      expect(mockSetFilterIntensity).toHaveBeenCalledWith(1);
    });

    it('adjustIntensity should clamp to min 0', () => {
      const controls = useFilterControls();
      controls.adjustIntensity(-0.5);
      expect(mockSetFilterIntensity).toHaveBeenCalledWith(0);
    });
  });

  // ==========================================================================
  // 6. Overlay Actions
  // ==========================================================================
  describe('Overlay Actions', () => {
    it('addTimerOverlay should add a workout_timer overlay', () => {
      const controls = useFilterControls();
      const id = controls.addTimerOverlay(90);

      expect(mockAddOverlay).toHaveBeenCalledWith('workout_timer', { y: 0.1 });
      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        totalSeconds: 90,
        currentSeconds: 90,
        isRunning: false,
        mode: 'countdown',
      }));
      expect(id).toBe('overlay-id-1');
    });

    it('addTimerOverlay should default to 60 seconds', () => {
      const controls = useFilterControls();
      controls.addTimerOverlay();

      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        totalSeconds: 60,
        currentSeconds: 60,
      }));
    });

    it('addRepCounterOverlay should add a rep_counter overlay', () => {
      const controls = useFilterControls();
      controls.addRepCounterOverlay('Push-ups', 20);

      expect(mockAddOverlay).toHaveBeenCalledWith('rep_counter', { y: 0.15 });
      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        exerciseName: 'Push-ups',
        targetReps: 20,
        currentReps: 0,
      }));
    });

    it('addRepCounterOverlay should use defaults', () => {
      const controls = useFilterControls();
      controls.addRepCounterOverlay();

      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        exerciseName: 'Reps',
        targetReps: 10,
      }));
    });

    it('addDayChallengeOverlay should add a day_challenge overlay', () => {
      const controls = useFilterControls();
      controls.addDayChallengeOverlay(5, 60);

      expect(mockAddOverlay).toHaveBeenCalledWith('day_challenge', { y: 0.1 });
      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        currentDay: 5,
        totalDays: 60,
        challengeName: 'Challenge',
      }));
    });

    it('addCalorieOverlay should add a calorie_burn overlay', () => {
      const controls = useFilterControls();
      controls.addCalorieOverlay(1000);

      expect(mockAddOverlay).toHaveBeenCalledWith('calorie_burn', { y: 0.15 });
      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        calories: 0,
        targetCalories: 1000,
      }));
    });

    it('addHeartRateOverlay should add a heart_rate_pulse overlay', () => {
      const controls = useFilterControls();
      controls.addHeartRateOverlay(150);

      expect(mockAddOverlay).toHaveBeenCalledWith('heart_rate_pulse', { y: 0.1, x: 0.8 });
      expect(mockUpdateOverlayParams).toHaveBeenCalledWith('overlay-id-1', expect.objectContaining({
        bpm: 150,
        isAnimating: true,
      }));
    });

    it('removeAllOverlays should remove each active overlay', () => {
      mockActiveOverlays = [
        { id: 'ov-1', type: 'workout_timer' },
        { id: 'ov-2', type: 'rep_counter' },
      ];

      const controls = useFilterControls();
      controls.removeAllOverlays();

      expect(mockRemoveOverlay).toHaveBeenCalledTimes(2);
      expect(mockRemoveOverlay).toHaveBeenCalledWith('ov-1');
      expect(mockRemoveOverlay).toHaveBeenCalledWith('ov-2');
    });

    it('removeAllOverlays should be safe when no overlays exist', () => {
      mockActiveOverlays = [];

      const controls = useFilterControls();
      controls.removeAllOverlays();

      expect(mockRemoveOverlay).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 7. Presets
  // ==========================================================================
  describe('Presets', () => {
    it('applyWorkoutPreset should set muscle_boost filter and add overlays', () => {
      const controls = useFilterControls();
      controls.applyWorkoutPreset();

      expect(mockSetFilter).toHaveBeenCalledWith('muscle_boost', 0.5);
      expect(mockAddOverlay).toHaveBeenCalled();
    });

    it('applyGlamPreset should set natural_glow filter', () => {
      const controls = useFilterControls();
      controls.applyGlamPreset();

      expect(mockSetFilter).toHaveBeenCalledWith('natural_glow', 0.6);
    });

    it('applyEnergyPreset should set energy_aura filter and heart rate overlay', () => {
      const controls = useFilterControls();
      controls.applyEnergyPreset();

      expect(mockSetFilter).toHaveBeenCalledWith('energy_aura', 0.7);
      expect(mockAddOverlay).toHaveBeenCalledWith('heart_rate_pulse', expect.any(Object));
    });

    it('clearAll should call reset', () => {
      const controls = useFilterControls();
      controls.clearAll();

      expect(mockReset).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 8. Cycling
  // ==========================================================================
  describe('Filter Cycling', () => {
    it('cycleNextFilter should set first filter when no filter is active', () => {
      mockActiveFilter = null;
      const controls = useFilterControls();
      controls.cycleNextFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('muscle_boost');
    });

    it('cycleNextFilter should set next filter in list', () => {
      mockActiveFilter = { filterId: 'muscle_boost', intensity: 0.5 };
      const controls = useFilterControls();
      controls.cycleNextFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('tan_tone');
    });

    it('cycleNextFilter should wrap around to first filter', () => {
      mockActiveFilter = { filterId: 'neon_outline', intensity: 0.5 };
      const controls = useFilterControls();
      controls.cycleNextFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('muscle_boost');
    });

    it('cyclePrevFilter should set last filter when no filter is active', () => {
      mockActiveFilter = null;
      const controls = useFilterControls();
      controls.cyclePrevFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('neon_outline');
    });

    it('cyclePrevFilter should set previous filter in list', () => {
      mockActiveFilter = { filterId: 'tan_tone', intensity: 0.5 };
      const controls = useFilterControls();
      controls.cyclePrevFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('muscle_boost');
    });

    it('cyclePrevFilter should wrap around to last filter', () => {
      mockActiveFilter = { filterId: 'muscle_boost', intensity: 0.5 };
      const controls = useFilterControls();
      controls.cyclePrevFilter();

      expect(mockSetFilter).toHaveBeenCalledWith('neon_outline');
    });
  });

  // ==========================================================================
  // 9. getFiltersByCategory
  // ==========================================================================
  describe('getFiltersByCategory', () => {
    it('should delegate to store getFiltersByCategory', () => {
      const mockBodyFilters = [{ id: 'muscle_boost', category: 'body' }] as unknown[];
      mockGetFiltersByCategory.mockReturnValue(mockBodyFilters);

      const controls = useFilterControls();
      const result = controls.getFiltersByCategory('body');

      expect(mockGetFiltersByCategory).toHaveBeenCalledWith('body');
      expect(result).toBe(mockBodyFilters);
    });
  });

  // ==========================================================================
  // 10. Return Shape
  // ==========================================================================
  describe('Return Shape', () => {
    it('should return all expected properties', () => {
      const controls = useFilterControls();

      // State
      expect(controls).toHaveProperty('activeFilterId');
      expect(controls).toHaveProperty('activeFilterName');
      expect(controls).toHaveProperty('filterIntensity');
      expect(controls).toHaveProperty('hasActiveFilter');
      expect(controls).toHaveProperty('hasActiveOverlays');
      expect(controls).toHaveProperty('overlayCount');

      // Quick actions
      expect(typeof controls.applyFilter).toBe('function');
      expect(typeof controls.removeFilter).toBe('function');
      expect(typeof controls.adjustIntensity).toBe('function');

      // Overlay actions
      expect(typeof controls.addTimerOverlay).toBe('function');
      expect(typeof controls.addRepCounterOverlay).toBe('function');
      expect(typeof controls.addDayChallengeOverlay).toBe('function');
      expect(typeof controls.addCalorieOverlay).toBe('function');
      expect(typeof controls.addHeartRateOverlay).toBe('function');
      expect(typeof controls.removeAllOverlays).toBe('function');

      // Presets
      expect(typeof controls.applyWorkoutPreset).toBe('function');
      expect(typeof controls.applyGlamPreset).toBe('function');
      expect(typeof controls.applyEnergyPreset).toBe('function');
      expect(typeof controls.clearAll).toBe('function');

      // Utilities
      expect(typeof controls.getFiltersByCategory).toBe('function');
      expect(typeof controls.cycleNextFilter).toBe('function');
      expect(typeof controls.cyclePrevFilter).toBe('function');
    });
  });
});
