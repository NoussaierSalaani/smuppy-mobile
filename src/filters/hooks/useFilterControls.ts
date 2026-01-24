/**
 * useFilterControls Hook
 * Simplified interface for filter controls in camera screens
 */

import { useCallback, useMemo } from 'react';
import { useFilters, FILTER_DEFINITIONS } from '../FilterContext';
import { FilterCategory, OverlayType } from '../types';

export interface FilterControlsReturn {
  // Filter state
  activeFilterId: string | null;
  activeFilterName: string | null;
  filterIntensity: number;
  hasActiveFilter: boolean;
  hasActiveOverlays: boolean;
  overlayCount: number;

  // Quick actions
  applyFilter: (filterId: string) => void;
  removeFilter: () => void;
  adjustIntensity: (intensity: number) => void;

  // Overlay actions
  addTimerOverlay: (duration?: number) => string;
  addRepCounterOverlay: (exercise?: string, target?: number) => string;
  addDayChallengeOverlay: (currentDay?: number, totalDays?: number) => string;
  addCalorieOverlay: (target?: number) => string;
  addHeartRateOverlay: (bpm?: number) => string;
  removeAllOverlays: () => void;

  // Presets
  applyWorkoutPreset: () => void;
  applyGlamPreset: () => void;
  applyEnergyPreset: () => void;
  clearAll: () => void;

  // Utilities
  getFiltersByCategory: (category: FilterCategory) => typeof FILTER_DEFINITIONS;
  cycleNextFilter: () => void;
  cyclePrevFilter: () => void;
}

export function useFilterControls(): FilterControlsReturn {
  const {
    activeFilter,
    activeOverlays,
    setFilter,
    setFilterIntensity,
    clearFilter,
    addOverlay,
    removeOverlay,
    updateOverlayParams,
    reset,
    getFiltersByCategory: getFilters,
  } = useFilters();

  // Derived state
  const activeFilterId = activeFilter?.filterId ?? null;
  const filterIntensity = activeFilter?.intensity ?? 0.5;
  const hasActiveFilter = activeFilter !== null;
  const hasActiveOverlays = activeOverlays.length > 0;
  const overlayCount = activeOverlays.length;

  const activeFilterName = useMemo(() => {
    if (!activeFilterId) return null;
    const def = FILTER_DEFINITIONS.find(f => f.id === activeFilterId);
    return def?.name ?? null;
  }, [activeFilterId]);

  // Quick actions
  const applyFilter = useCallback((filterId: string) => {
    setFilter(filterId);
  }, [setFilter]);

  const removeFilter = useCallback(() => {
    clearFilter();
  }, [clearFilter]);

  const adjustIntensity = useCallback((intensity: number) => {
    setFilterIntensity(Math.max(0, Math.min(1, intensity)));
  }, [setFilterIntensity]);

  // Overlay actions
  const addTimerOverlay = useCallback((duration: number = 60) => {
    const id = addOverlay('workout_timer', { y: 0.1 });
    updateOverlayParams(id, {
      totalSeconds: duration,
      currentSeconds: duration,
      isRunning: false,
      mode: 'countdown',
    });
    return id;
  }, [addOverlay, updateOverlayParams]);

  const addRepCounterOverlay = useCallback((exercise: string = 'Reps', target: number = 10) => {
    const id = addOverlay('rep_counter', { y: 0.15 });
    updateOverlayParams(id, {
      exerciseName: exercise,
      targetReps: target,
      currentReps: 0,
    });
    return id;
  }, [addOverlay, updateOverlayParams]);

  const addDayChallengeOverlay = useCallback((currentDay: number = 1, totalDays: number = 30) => {
    const id = addOverlay('day_challenge', { y: 0.1 });
    updateOverlayParams(id, {
      currentDay,
      totalDays,
      challengeName: 'Challenge',
    });
    return id;
  }, [addOverlay, updateOverlayParams]);

  const addCalorieOverlay = useCallback((target: number = 500) => {
    const id = addOverlay('calorie_burn', { y: 0.15 });
    updateOverlayParams(id, {
      calories: 0,
      targetCalories: target,
    });
    return id;
  }, [addOverlay, updateOverlayParams]);

  const addHeartRateOverlay = useCallback((bpm: number = 120) => {
    const id = addOverlay('heart_rate_pulse', { y: 0.1, x: 0.8 });
    updateOverlayParams(id, {
      bpm,
      isAnimating: true,
    });
    return id;
  }, [addOverlay, updateOverlayParams]);

  const removeAllOverlays = useCallback(() => {
    activeOverlays.forEach(overlay => {
      removeOverlay(overlay.id);
    });
  }, [activeOverlays, removeOverlay]);

  // Presets
  const applyWorkoutPreset = useCallback(() => {
    setFilter('muscle_boost', 0.5);
    addTimerOverlay(60);
    addRepCounterOverlay('Reps', 12);
  }, [setFilter, addTimerOverlay, addRepCounterOverlay]);

  const applyGlamPreset = useCallback(() => {
    setFilter('natural_glow', 0.6);
  }, [setFilter]);

  const applyEnergyPreset = useCallback(() => {
    setFilter('energy_aura', 0.7);
    addHeartRateOverlay(140);
  }, [setFilter, addHeartRateOverlay]);

  const clearAll = useCallback(() => {
    reset();
  }, [reset]);

  // Utilities
  const getFiltersByCategory = useCallback((category: FilterCategory) => {
    return getFilters(category);
  }, [getFilters]);

  const cycleNextFilter = useCallback(() => {
    const allFilters = FILTER_DEFINITIONS;
    if (allFilters.length === 0) return;

    if (!activeFilterId) {
      setFilter(allFilters[0].id);
      return;
    }

    const currentIndex = allFilters.findIndex(f => f.id === activeFilterId);
    const nextIndex = (currentIndex + 1) % allFilters.length;
    setFilter(allFilters[nextIndex].id);
  }, [activeFilterId, setFilter]);

  const cyclePrevFilter = useCallback(() => {
    const allFilters = FILTER_DEFINITIONS;
    if (allFilters.length === 0) return;

    if (!activeFilterId) {
      setFilter(allFilters[allFilters.length - 1].id);
      return;
    }

    const currentIndex = allFilters.findIndex(f => f.id === activeFilterId);
    const prevIndex = currentIndex === 0 ? allFilters.length - 1 : currentIndex - 1;
    setFilter(allFilters[prevIndex].id);
  }, [activeFilterId, setFilter]);

  return {
    // State
    activeFilterId,
    activeFilterName,
    filterIntensity,
    hasActiveFilter,
    hasActiveOverlays,
    overlayCount,

    // Quick actions
    applyFilter,
    removeFilter,
    adjustIntensity,

    // Overlay actions
    addTimerOverlay,
    addRepCounterOverlay,
    addDayChallengeOverlay,
    addCalorieOverlay,
    addHeartRateOverlay,
    removeAllOverlays,

    // Presets
    applyWorkoutPreset,
    applyGlamPreset,
    applyEnergyPreset,
    clearAll,

    // Utilities
    getFiltersByCategory,
    cycleNextFilter,
    cyclePrevFilter,
  };
}
