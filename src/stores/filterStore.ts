/**
 * Filter Store - Zustand Version
 * Manages global filter state for AR effects
 * Migrated from FilterContext.tsx for consistency
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import {
  FilterState,
  FilterDefinition,
  FilterCategory,
  ActiveFilter,
  OverlayConfig,
  OverlayType,
  OverlayPosition,
  PoseLandmarks,
  FILTER_IDS,
} from '../filters/types';

// ============================================
// FILTER DEFINITIONS
// ============================================

const FILTER_DEFINITIONS: FilterDefinition[] = [
  // Body Filters
  {
    id: FILTER_IDS.MUSCLE_BOOST,
    name: 'Muscle Boost',
    icon: '💪',
    category: 'body',
    description: 'Enhance muscle definition with local contrast',
    defaultIntensity: 0.5,
    requiresBodyTracking: true,
  },
  {
    id: FILTER_IDS.TAN_TONE,
    name: 'Tan & Tone',
    icon: '☀️',
    category: 'body',
    description: 'Golden tan with enhanced definition',
    defaultIntensity: 0.5,
    requiresBodyTracking: false,
  },
  {
    id: FILTER_IDS.SWEAT_GLOW,
    name: 'Sweat Glow',
    icon: '💧',
    category: 'body',
    description: 'Realistic workout glow effect',
    defaultIntensity: 0.4,
    requiresBodyTracking: true,
  },
  // Lighting Filters
  {
    id: FILTER_IDS.GYM_LIGHTING,
    name: 'Gym Lighting',
    icon: '💡',
    category: 'lighting',
    description: 'Perfect studio lighting simulation',
    defaultIntensity: 0.6,
    requiresBodyTracking: false,
  },
  {
    id: FILTER_IDS.NATURAL_GLOW,
    name: 'Natural Glow',
    icon: '✨',
    category: 'lighting',
    description: 'Soft, radiant skin glow',
    defaultIntensity: 0.5,
    requiresBodyTracking: false,
  },
  {
    id: FILTER_IDS.GOLDEN_HOUR,
    name: 'Golden Hour',
    icon: '🌅',
    category: 'lighting',
    description: 'Warm golden hour lighting',
    defaultIntensity: 0.5,
    requiresBodyTracking: false,
  },
  // Effects Filters
  {
    id: FILTER_IDS.ENERGY_AURA,
    name: 'Energy Aura',
    icon: '🔥',
    category: 'effects',
    description: 'Colorful energy aura around body',
    defaultIntensity: 0.6,
    requiresBodyTracking: true,
  },
  {
    id: FILTER_IDS.LIGHTNING_FLEX,
    name: 'Lightning Flex',
    icon: '⚡',
    category: 'effects',
    description: 'Electric sparks when flexing',
    defaultIntensity: 0.7,
    requiresBodyTracking: true,
  },
  {
    id: FILTER_IDS.NEON_OUTLINE,
    name: 'Neon Outline',
    icon: '🌈',
    category: 'effects',
    description: 'Neon glow body outline',
    defaultIntensity: 0.5,
    requiresBodyTracking: true,
  },
];

// ============================================
// DEFAULT VALUES
// ============================================

const DEFAULT_OVERLAY_POSITION: OverlayPosition = {
  x: 0.5,
  y: 0.1,
  scale: 1,
  rotation: 0,
};

// Body pose stored outside Zustand to avoid triggering React re-renders at 30-60fps.
// Use getBodyPose() to read, updateBodyPose() on the store to write.
let _bodyPoseRef: PoseLandmarks | null = null;

/** Read body pose without subscribing to Zustand (no re-renders) */
export const getBodyPose = (): PoseLandmarks | null => _bodyPoseRef;

const getDefaultOverlayParams = (type: OverlayType): Record<string, unknown> => {
  switch (type) {
    case 'workout_timer':
      return {
        totalSeconds: 60,
        currentSeconds: 60,
        isRunning: false,
        mode: 'countdown',
        color: '#00E676',
      };
    case 'rep_counter':
      return {
        currentReps: 0,
        targetReps: 10,
        exerciseName: 'Reps',
        color: '#00E676',
      };
    case 'day_challenge':
      return {
        currentDay: 1,
        totalDays: 30,
        challengeName: 'Challenge',
        color: '#00E676',
      };
    case 'calorie_burn':
      return {
        calories: 0,
        targetCalories: 500,
        color: '#FF5722',
      };
    case 'heart_rate_pulse':
      return {
        bpm: 120,
        isAnimating: true,
        color: '#FF1744',
      };
    default:
      return {};
  }
};

// ============================================
// STATIC FILTER HELPERS (no store state needed)
// ============================================

export const getFilterDefinition = (filterId: string): FilterDefinition | undefined => {
  return FILTER_DEFINITIONS.find((f) => f.id === filterId);
};

export const getAllFilters = (): FilterDefinition[] => {
  return FILTER_DEFINITIONS;
};

export const getFiltersByCategory = (category: FilterCategory): FilterDefinition[] => {
  return FILTER_DEFINITIONS.filter((f) => f.category === category);
};

// ============================================
// STORE INTERFACE
// ============================================

interface FilterStoreState extends FilterState {
  // Filter actions
  setFilter: (filterId: string | null, intensity?: number) => void;
  setFilterIntensity: (intensity: number) => void;
  clearFilter: () => void;

  // Overlay actions
  addOverlay: (type: OverlayType, position?: Partial<OverlayPosition>) => string;
  removeOverlay: (overlayId: string) => void;
  updateOverlay: (overlayId: string, updates: Partial<OverlayConfig>) => void;
  updateOverlayParams: (overlayId: string, params: Record<string, unknown>) => void;

  // Body tracking
  enableBodyTracking: () => void;
  disableBodyTracking: () => void;
  updateBodyPose: (pose: PoseLandmarks | null) => void;

  // Utilities
  reset: () => void;
  getFilterDefinition: (filterId: string) => FilterDefinition | undefined;
  getAllFilters: () => FilterDefinition[];
  getFiltersByCategory: (category: FilterCategory) => FilterDefinition[];
}

// ============================================
// ZUSTAND STORE
// ============================================

export const useFilterStore = create<FilterStoreState>()(
  immer((set, _get) => ({
    // Initial state
    activeFilter: null,
    activeOverlays: [],
    bodyPose: null,
    bodySegmentation: null,
    isBodyTrackingEnabled: false,
    isProcessing: false,
    fps: 0,

    // Filter actions
    setFilter: (filterId, intensity) => {
      if (!filterId) {
        set((state) => {
          state.activeFilter = null;
        });
        return;
      }

      const definition = FILTER_DEFINITIONS.find((f) => f.id === filterId);
      if (!definition) {
        if (__DEV__) console.warn(`Filter not found: ${filterId}`);
        return;
      }

      const activeFilter: ActiveFilter = {
        filterId,
        intensity: intensity ?? definition.defaultIntensity,
      };

      set((state) => {
        state.activeFilter = activeFilter;
        // Auto-enable body tracking if required
        if (definition.requiresBodyTracking && !state.isBodyTrackingEnabled) {
          state.isBodyTrackingEnabled = true;
        }
      });
    },

    setFilterIntensity: (intensity) => {
      const clampedIntensity = Math.max(0, Math.min(1, intensity));
      set((state) => {
        if (state.activeFilter) {
          state.activeFilter.intensity = clampedIntensity;
        }
      });
    },

    clearFilter: () => {
      set((state) => {
        state.activeFilter = null;
      });
    },

    // Overlay actions
    addOverlay: (type, position) => {
      const id = uuidv4();
      const overlay: OverlayConfig = {
        id,
        type,
        position: { ...DEFAULT_OVERLAY_POSITION, ...position },
        params: getDefaultOverlayParams(type),
        isVisible: true,
      };

      set((state) => {
        state.activeOverlays.push(overlay);
      });

      return id;
    },

    removeOverlay: (overlayId) => {
      set((state) => {
        const idx = state.activeOverlays.findIndex((o) => o.id === overlayId);
        if (idx !== -1) state.activeOverlays.splice(idx, 1);
      });
    },

    updateOverlay: (overlayId, updates) => {
      set((state) => {
        const index = state.activeOverlays.findIndex((o) => o.id === overlayId);
        if (index !== -1) {
          state.activeOverlays[index] = { ...state.activeOverlays[index], ...updates };
        }
      });
    },

    updateOverlayParams: (overlayId, params) => {
      set((state) => {
        const overlay = state.activeOverlays.find((o) => o.id === overlayId);
        if (overlay) {
          overlay.params = { ...overlay.params, ...params };
        }
      });
    },

    // Body tracking
    enableBodyTracking: () => {
      set((state) => {
        state.isBodyTrackingEnabled = true;
      });
    },

    disableBodyTracking: () => {
      set((state) => {
        state.isBodyTrackingEnabled = false;
      });
    },

    updateBodyPose: (pose) => {
      // Write to module-level ref (no React re-renders at frame rate)
      _bodyPoseRef = pose;
    },

    // Utilities
    reset: () => {
      _bodyPoseRef = null;
      set({
        activeFilter: null,
        activeOverlays: [],
        bodyPose: null,
        bodySegmentation: null,
        isBodyTrackingEnabled: false,
        isProcessing: false,
        fps: 0,
      });
    },

    getFilterDefinition: (filterId: string) => {
      return getFilterDefinition(filterId);
    },

    getAllFilters: () => {
      return getAllFilters();
    },

    getFiltersByCategory: (category: FilterCategory) => {
      return getFiltersByCategory(category);
    },
  }))
);

// ============================================
// SELECTORS (for performance)
// ============================================

export const selectActiveFilter = (state: FilterStoreState) => state.activeFilter;
export const selectActiveOverlays = (state: FilterStoreState) => state.activeOverlays;
export const selectIsBodyTrackingEnabled = (state: FilterStoreState) => state.isBodyTrackingEnabled;
export const selectBodyPose = (state: FilterStoreState) => state.bodyPose;

// ============================================
// LEGACY HOOK COMPATIBILITY
// ============================================

/**
 * Hook that mimics the old useFilters() API with granular selectors.
 * Uses useShallow to prevent re-renders from bodyPose frame-rate updates.
 */
export const useFilters = () => {
  return useFilterStore(
    useShallow((state) => ({
      activeFilter: state.activeFilter,
      activeOverlays: state.activeOverlays,
      isBodyTrackingEnabled: state.isBodyTrackingEnabled,
      isProcessing: state.isProcessing,
      fps: state.fps,
      setFilter: state.setFilter,
      setFilterIntensity: state.setFilterIntensity,
      clearFilter: state.clearFilter,
      addOverlay: state.addOverlay,
      removeOverlay: state.removeOverlay,
      updateOverlay: state.updateOverlay,
      updateOverlayParams: state.updateOverlayParams,
      enableBodyTracking: state.enableBodyTracking,
      disableBodyTracking: state.disableBodyTracking,
      updateBodyPose: state.updateBodyPose,
      reset: state.reset,
      getFilterDefinition: state.getFilterDefinition,
      getAllFilters: state.getAllFilters,
      getFiltersByCategory: state.getFiltersByCategory,
    }))
  );
};

// Legacy export for backward compatibility
export const filterStore = {
  reset: () => useFilterStore.getState().reset(),
};

// Export filter definitions
export { FILTER_DEFINITIONS };
