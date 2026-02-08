/**
 * Hook that checks for expired peaks when app comes to foreground.
 * Returns expired peaks + actions (save, dismiss, download, delete).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { awsAPI, Peak } from '../services/aws-api';

interface UseExpiredPeaksReturn {
  expiredPeaks: Peak[];
  isLoading: boolean;
  savePeakToProfile: (peakId: string) => Promise<void>;
  deletePeak: (peakId: string) => Promise<void>;
  downloadPeak: (peakId: string, videoUrl: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useExpiredPeaks(): UseExpiredPeaksReturn {
  const [expiredPeaks, setExpiredPeaks] = useState<Peak[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasFetched = useRef(false);

  const fetchExpired = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await awsAPI.getExpiredPeaks();
      setExpiredPeaks(result.data || []);
    } catch (error) {
      if (__DEV__) console.warn('[useExpiredPeaks] Failed to fetch:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchExpired();
    }
  }, [fetchExpired]);

  // Re-fetch when app returns to foreground (debounced to avoid rapid re-fetches)
  useEffect(() => {
    let lastFetch = 0;
    const DEBOUNCE_MS = 10000; // 10s minimum between foreground fetches
    const handleAppState = (nextState: AppStateStatus) => {
      const now = Date.now();
      if (nextState === 'active' && now - lastFetch > DEBOUNCE_MS) {
        lastFetch = now;
        fetchExpired();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [fetchExpired]);

  const savePeakToProfile = useCallback(async (peakId: string) => {
    await awsAPI.savePeakDecision(peakId, 'save_to_profile');
    setExpiredPeaks(prev => prev.filter(p => p.id !== peakId));
  }, []);

  const deletePeak = useCallback(async (peakId: string) => {
    await awsAPI.deletePeak(peakId);
    setExpiredPeaks(prev => prev.filter(p => p.id !== peakId));
  }, []);

  const downloadPeak = useCallback(async (peakId: string, videoUrl: string): Promise<boolean> => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('PERMISSION_DENIED');
    }

    const fileUri = FileSystem.documentDirectory + 'peak_' + peakId + '.mov';
    await FileSystem.downloadAsync(videoUrl, fileUri);
    await MediaLibrary.saveToLibraryAsync(fileUri);
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    return true;
  }, []);

  return {
    expiredPeaks,
    isLoading,
    savePeakToProfile,
    deletePeak,
    downloadPeak,
    refresh: fetchExpired,
  };
}
