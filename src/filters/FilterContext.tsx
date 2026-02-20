/**
 * Filter Context
 * Manages global filter state for AR effects
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  FilterState,
  FilterAction,
  FilterContextValue,
  FilterDefinition,
  FilterCategory,
  ActiveFilter,
  OverlayConfig,
  OverlayType,
  OverlayPosition,
  PoseLandmarks,
  FILTER_IDS,
} from './types';

// Filter Definitions
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

// Initial State
const initialState: FilterState = {
  activeFilter: null,
  activeOverlays: [],
  bodyPose: null,
  bodySegmentation: null,
  isBodyTrackingEnabled: false,
  isProcessing: false,
  fps: 0,
};

// Reducer
function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_FILTER':
      return {
        ...state,
        activeFilter: action.payload,
      };

    case 'SET_FILTER_INTENSITY':
      if (!state.activeFilter) return state;
      return {
        ...state,
        activeFilter: {
          ...state.activeFilter,
          intensity: action.payload,
        },
      };

    case 'ADD_OVERLAY':
      return {
        ...state,
        activeOverlays: [...state.activeOverlays, action.payload],
      };

    case 'REMOVE_OVERLAY':
      return {
        ...state,
        activeOverlays: state.activeOverlays.filter(o => o.id !== action.payload),
      };

    case 'UPDATE_OVERLAY':
      return {
        ...state,
        activeOverlays: state.activeOverlays.map(o =>
          o.id === action.payload.id ? { ...o, ...action.payload.updates } : o
        ),
      };

    case 'UPDATE_BODY_POSE':
      return {
        ...state,
        bodyPose: action.payload,
      };

    case 'UPDATE_BODY_SEGMENTATION':
      return {
        ...state,
        bodySegmentation: action.payload,
      };

    case 'SET_BODY_TRACKING_ENABLED':
      return {
        ...state,
        isBodyTrackingEnabled: action.payload,
      };

    case 'SET_PROCESSING':
      return {
        ...state,
        isProcessing: action.payload,
      };

    case 'UPDATE_FPS':
      return {
        ...state,
        fps: action.payload,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Create Context
const FilterContext = createContext<FilterContextValue | null>(null);

// Default overlay position
const DEFAULT_OVERLAY_POSITION: OverlayPosition = {
  x: 0.5,
  y: 0.1,
  scale: 1,
  rotation: 0,
};

// Default overlay params by type
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

// Provider Component
type FilterProviderProps = Readonly<{
  children: ReactNode;
}>;


export function FilterProvider({ children }: FilterProviderProps) {
  const [state, dispatch] = useReducer(filterReducer, initialState);

  // Filter actions
  const setFilter = useCallback((filterId: string | null, intensity?: number) => {
    if (!filterId) {
      dispatch({ type: 'SET_FILTER', payload: null });
      return;
    }

    const definition = FILTER_DEFINITIONS.find(f => f.id === filterId);
    if (!definition) {
      if (__DEV__) console.warn(`Filter not found: ${filterId}`);
      return;
    }

    const activeFilter: ActiveFilter = {
      filterId,
      intensity: intensity ?? definition.defaultIntensity,
    };

    dispatch({ type: 'SET_FILTER', payload: activeFilter });

    // Auto-enable body tracking if required
    if (definition.requiresBodyTracking && !state.isBodyTrackingEnabled) {
      dispatch({ type: 'SET_BODY_TRACKING_ENABLED', payload: true });
    }
  }, [state.isBodyTrackingEnabled]);

  const setFilterIntensity = useCallback((intensity: number) => {
    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    dispatch({ type: 'SET_FILTER_INTENSITY', payload: clampedIntensity });
  }, []);

  const clearFilter = useCallback(() => {
    dispatch({ type: 'SET_FILTER', payload: null });
  }, []);

  // Overlay actions
  const addOverlay = useCallback((type: OverlayType, position?: Partial<OverlayPosition>): string => {
    const id = uuidv4();
    const overlay: OverlayConfig = {
      id,
      type,
      position: { ...DEFAULT_OVERLAY_POSITION, ...position },
      params: getDefaultOverlayParams(type),
      isVisible: true,
    };

    dispatch({ type: 'ADD_OVERLAY', payload: overlay });
    return id;
  }, []);

  const removeOverlay = useCallback((overlayId: string) => {
    dispatch({ type: 'REMOVE_OVERLAY', payload: overlayId });
  }, []);

  const updateOverlay = useCallback((overlayId: string, updates: Partial<OverlayConfig>) => {
    dispatch({ type: 'UPDATE_OVERLAY', payload: { id: overlayId, updates } });
  }, []);

  const updateOverlayParams = useCallback((overlayId: string, params: Record<string, unknown>) => {
    dispatch({
      type: 'UPDATE_OVERLAY',
      payload: {
        id: overlayId,
        updates: {
          params: {
            ...state.activeOverlays.find(o => o.id === overlayId)?.params,
            ...params,
          },
        },
      },
    });
  }, [state.activeOverlays]);

  // Body tracking
  const enableBodyTracking = useCallback(() => {
    dispatch({ type: 'SET_BODY_TRACKING_ENABLED', payload: true });
  }, []);

  const disableBodyTracking = useCallback(() => {
    dispatch({ type: 'SET_BODY_TRACKING_ENABLED', payload: false });
  }, []);

  const updateBodyPose = useCallback((pose: PoseLandmarks | null) => {
    dispatch({ type: 'UPDATE_BODY_POSE', payload: pose });
  }, []);

  // Utilities
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const getFilterDefinition = useCallback((filterId: string): FilterDefinition | undefined => {
    return FILTER_DEFINITIONS.find(f => f.id === filterId);
  }, []);

  const getAllFilters = useCallback((): FilterDefinition[] => {
    return FILTER_DEFINITIONS;
  }, []);

  const getFiltersByCategory = useCallback((category: FilterCategory): FilterDefinition[] => {
    return FILTER_DEFINITIONS.filter(f => f.category === category);
  }, []);

  // Memoized context value
  const contextValue = useMemo<FilterContextValue>(() => ({
    ...state,
    setFilter,
    setFilterIntensity,
    clearFilter,
    addOverlay,
    removeOverlay,
    updateOverlay,
    updateOverlayParams,
    enableBodyTracking,
    disableBodyTracking,
    updateBodyPose,
    reset,
    getFilterDefinition,
    getAllFilters,
    getFiltersByCategory,
  }), [
    state,
    setFilter,
    setFilterIntensity,
    clearFilter,
    addOverlay,
    removeOverlay,
    updateOverlay,
    updateOverlayParams,
    enableBodyTracking,
    disableBodyTracking,
    updateBodyPose,
    reset,
    getFilterDefinition,
    getAllFilters,
    getFiltersByCategory,
  ]);

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

// Hook
export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilters must be used within a FilterProvider');
  }
  return context;
}

// Export filter definitions for external use
export { FILTER_DEFINITIONS };
