/**
 * useVibePrescriptions Hook — Reactive access to prescriptions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVibeStore, PrescriptionPreferences } from '../stores/vibeStore';
import { generatePrescriptions, Prescription } from '../services/prescriptionEngine';
import { getWeather, WeatherData } from '../services/weatherService';
import { moodDetection, MoodType } from '../services/moodDetection';
import { isFeatureEnabled } from '../config/featureFlags';

export interface UseVibePrescriptionsReturn {
  prescriptions: Prescription[];
  activePrescription: Prescription | null;
  completePrescription: (id: string) => void;
  setActivePrescription: (rx: Prescription | null) => void;
  preferences: PrescriptionPreferences;
  updatePreferences: (prefs: Partial<PrescriptionPreferences>) => void;
  weather: WeatherData | null;
  isLoading: boolean;
  enabled: boolean;
  refresh: () => void;
}

export function useVibePrescriptions(): UseVibePrescriptionsReturn {
  const enabled = isFeatureEnabled('VIBE_PRESCRIPTIONS');
  const preferences = useVibeStore((s) => s.prescriptionPreferences);
  const completedToday = useVibeStore((s) => s.completedToday);
  const storeComplete = useVibeStore((s) => s.completePrescription);
  const storeUpdatePrefs = useVibeStore((s) => s.updatePreferences);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [activePrescription, setActivePrescription] = useState<Prescription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch weather on mount
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getWeather()
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => { /* fallback already handled in weatherService */ })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [enabled, refreshKey]);

  // Generate prescriptions when inputs change
  const currentMood: MoodType = useMemo(
    () => moodDetection.analyzeMood().primaryMood,
    // Re-compute when refreshKey changes (manual refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey],
  );

  const prescriptions = useMemo(() => {
    if (!enabled || !weather) return [];
    return generatePrescriptions(currentMood, weather, preferences, completedToday);
  }, [enabled, weather, currentMood, preferences, completedToday]);

  const completePrescription = useCallback(
    (id: string) => {
      const rx = prescriptions.find((p) => p.id === id);
      if (rx) {
        storeComplete(id, rx.vibeScoreReward);
        setActivePrescription(null);
      }
    },
    [prescriptions, storeComplete],
  );

  const updatePreferences = useCallback(
    (prefs: Partial<PrescriptionPreferences>) => storeUpdatePrefs(prefs),
    [storeUpdatePrefs],
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    prescriptions,
    activePrescription,
    completePrescription,
    setActivePrescription,
    preferences,
    updatePreferences,
    weather,
    isLoading,
    enabled,
    refresh,
  };
}
