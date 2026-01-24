/**
 * AR Filter System Types
 * Smuppy Mobile - Futuristic Filters
 */

// Body Tracking Types
export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseLandmarks {
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
  timestamp: number;
}

export interface MuscleRegion {
  name: string;
  points: Point2D[];
  intensity: number;
}

export interface BodySegmentation {
  mask: Uint8Array;
  width: number;
  height: number;
}

// Filter Types
export type FilterCategory = 'body' | 'lighting' | 'effects' | 'overlays';

export interface FilterDefinition {
  id: string;
  name: string;
  icon: string;
  category: FilterCategory;
  description: string;
  defaultIntensity: number;
  requiresBodyTracking: boolean;
  shader?: string;
}

export interface ActiveFilter {
  filterId: string;
  intensity: number;
  params?: Record<string, number | string | boolean>;
}

// Overlay Types
export type OverlayType =
  | 'workout_timer'
  | 'rep_counter'
  | 'day_challenge'
  | 'calorie_burn'
  | 'heart_rate_pulse';

export interface OverlayPosition {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface OverlayConfig {
  id: string;
  type: OverlayType;
  position: OverlayPosition;
  params: Record<string, unknown>;
  isVisible: boolean;
}

export interface WorkoutTimerParams {
  totalSeconds: number;
  currentSeconds: number;
  isRunning: boolean;
  mode: 'countdown' | 'stopwatch';
  color: string;
}

export interface RepCounterParams {
  currentReps: number;
  targetReps: number | null;
  exerciseName: string;
  color: string;
}

export interface DayChallengeParams {
  currentDay: number;
  totalDays: number;
  challengeName: string;
  color: string;
}

export interface CalorieBurnParams {
  calories: number;
  targetCalories: number | null;
  color: string;
}

export interface HeartRatePulseParams {
  bpm: number;
  isAnimating: boolean;
  color: string;
}

// Filter State
export interface FilterState {
  activeFilter: ActiveFilter | null;
  activeOverlays: OverlayConfig[];
  bodyPose: PoseLandmarks | null;
  bodySegmentation: BodySegmentation | null;
  isBodyTrackingEnabled: boolean;
  isProcessing: boolean;
  fps: number;
}

// Filter Actions
export type FilterAction =
  | { type: 'SET_FILTER'; payload: ActiveFilter | null }
  | { type: 'SET_FILTER_INTENSITY'; payload: number }
  | { type: 'ADD_OVERLAY'; payload: OverlayConfig }
  | { type: 'REMOVE_OVERLAY'; payload: string }
  | { type: 'UPDATE_OVERLAY'; payload: { id: string; updates: Partial<OverlayConfig> } }
  | { type: 'UPDATE_BODY_POSE'; payload: PoseLandmarks | null }
  | { type: 'UPDATE_BODY_SEGMENTATION'; payload: BodySegmentation | null }
  | { type: 'SET_BODY_TRACKING_ENABLED'; payload: boolean }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'UPDATE_FPS'; payload: number }
  | { type: 'RESET' };

// Filter Context
export interface FilterContextValue extends FilterState {
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

// Camera Frame Processing
export interface FrameProcessor {
  processFrame: (frame: ImageData) => Promise<ImageData>;
  applyFilter: (frame: ImageData, filter: ActiveFilter) => Promise<ImageData>;
  applyOverlays: (frame: ImageData, overlays: OverlayConfig[]) => Promise<ImageData>;
}

// Shader Uniforms
export interface ShaderUniforms {
  intensity: number;
  resolution: [number, number];
  time: number;
  [key: string]: number | number[] | boolean;
}

// Filter Presets
export interface FilterPreset {
  id: string;
  name: string;
  filter: ActiveFilter;
  overlays: OverlayConfig[];
}

// Export all filter IDs as constants
export const FILTER_IDS = {
  // Body filters
  MUSCLE_BOOST: 'muscle_boost',
  TAN_TONE: 'tan_tone',
  SWEAT_GLOW: 'sweat_glow',

  // Lighting filters
  GYM_LIGHTING: 'gym_lighting',
  NATURAL_GLOW: 'natural_glow',
  GOLDEN_HOUR: 'golden_hour',

  // Effects filters
  ENERGY_AURA: 'energy_aura',
  LIGHTNING_FLEX: 'lightning_flex',
  NEON_OUTLINE: 'neon_outline',
} as const;

export const OVERLAY_IDS = {
  WORKOUT_TIMER: 'workout_timer',
  REP_COUNTER: 'rep_counter',
  DAY_CHALLENGE: 'day_challenge',
  CALORIE_BURN: 'calorie_burn',
  HEART_RATE_PULSE: 'heart_rate_pulse',
} as const;
