/**
 * AR Filters Module
 * Smuppy Mobile - Futuristic Filters for Fitness Content
 *
 * This module provides:
 * - Real-time visual filters using Skia shaders
 * - Animated workout overlays
 * - Body tracking integration (planned)
 * - Filter selection UI components
 */

// Store and Hooks (migrated from Context to Zustand)
export { useFilters, useFilterStore, FILTER_DEFINITIONS } from '../stores/filterStore';
export { useFilterControls } from './hooks/useFilterControls';

// Deprecated: FilterProvider is no longer needed with Zustand
// Keeping for backward compatibility - it's now a passthrough
import { ReactNode } from 'react';
export const FilterProvider = ({ children }: { children: ReactNode }): ReactNode => children;

// Types
export * from './types';

// Core Engine
export { filterEngine, FilterEngine } from './core/FilterEngine';
export { shaderManager, ShaderManager } from './core/ShaderManager';

// UI Components
export { FilterSelector } from './components/FilterSelector';
export { FilterPreview, FilterOverlay } from './components/FilterPreview';
export { OverlayEditor, DraggableOverlay } from './components/OverlayEditor';
export { CameraFilterView, FilteredImageView } from './components/CameraFilterView';

// Overlays
export { WorkoutTimer } from './overlays/WorkoutTimer';
export { RepCounter } from './overlays/RepCounter';
export { DayChallenge } from './overlays/DayChallenge';
export { CalorieBurn } from './overlays/CalorieBurn';
export { HeartRatePulse } from './overlays/HeartRatePulse';

// Filter IDs for easy reference
export { FILTER_IDS, OVERLAY_IDS } from './types';
