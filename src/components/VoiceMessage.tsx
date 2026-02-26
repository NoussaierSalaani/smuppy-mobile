import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

type VoiceMessageProps = Readonly<{
  uri: string;
  isFromMe: boolean;
}>;


const BAR_COUNT = 20;
const PROGRESS_UPDATE_THRESHOLD = 0.02; // Only re-render when progress changes by 2%

export default React.memo(function VoiceMessage({ uri, isFromMe }: VoiceMessageProps) {
  const { colors } = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const retryCountRef = useRef(0);

  // Refs to track values without triggering re-renders
  const lastProgressRef = useRef(0);
  const durationRef = useRef(0);
  const positionRef = useRef(0);

  // Stable random bar heights — generated once per URI
  const barHeights = useMemo(() => {
    const heights: number[] = [];
    let seed = 0;
    for (let i = 0; i < uri.length; i++) seed = Math.trunc((seed << 5) - seed + (uri.codePointAt(i) ?? 0));
    for (let i = 0; i < BAR_COUNT; i++) {
      seed = (seed * 16807 + 0) % 2147483647;
      heights.push(8 + (seed % 17));
    }
    return heights;
  }, [uri]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    positionRef.current = status.positionMillis || 0;

    if (status.durationMillis && status.durationMillis !== durationRef.current) {
      durationRef.current = status.durationMillis;
      setDuration(status.durationMillis);
    }

    // Only update progress state when change exceeds threshold (reduces re-renders)
    if (status.durationMillis) {
      const newProgress = status.positionMillis / status.durationMillis;
      if (Math.abs(newProgress - lastProgressRef.current) >= PROGRESS_UPDATE_THRESHOLD) {
        lastProgressRef.current = newProgress;
        setProgress(newProgress);
      }
    }

    setIsPlaying(status.isPlaying);

    if (status.didJustFinish) {
      lastProgressRef.current = 0;
      positionRef.current = 0;
      setIsPlaying(false);
      setProgress(0);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadSound = async () => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      setIsLoaded(false);
      setLoadError(false);

      try {
        const { sound: newSound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, progressUpdateIntervalMillis: 250 },
          onPlaybackStatusUpdate
        );

        if (cancelled) {
          await newSound.unloadAsync();
          return;
        }

        soundRef.current = newSound;

        if (status.isLoaded) {
          setIsLoaded(true);
          retryCountRef.current = 0; // Reset retry count on success
          if (status.durationMillis) {
            durationRef.current = status.durationMillis;
            setDuration(status.durationMillis);
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[VoiceMessage] Error loading sound:', err);
        if (!cancelled) setLoadError(true);
      }
    };

    loadSound();

    return () => {
      cancelled = true;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [uri, onPlaybackStatusUpdate, reloadTick]);

  const togglePlayback = useCallback(async () => {
    if (loadError) {
      if (retryCountRef.current >= 5) return; // Cap retries to prevent resource spam
      retryCountRef.current += 1;
      setLoadError(false);
      setReloadTick(t => t + 1);
      return;
    }

    const sound = soundRef.current;
    if (!sound) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis && status.positionMillis >= status.durationMillis) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch (err) {
      if (__DEV__) console.warn('[VoiceMessage] Playback error:', err);
    }
  }, [isPlaying, loadError]);

  const displayTime = useMemo(() => {
    const millis = isPlaying || progress > 0 ? positionRef.current : duration;
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [isPlaying, progress, duration]);

  // Memoize waveform bars — only recalculate when progress or theme changes
  const waveformBars = useMemo(() =>
    barHeights.map((h, i) => (
      <View
        key={`bar-${i}`} // NOSONAR — static waveform array derived from URI seed, never reordered
        style={[
          styles.waveformBar,
          {
            height: h,
            backgroundColor: (() => {
              const opacity = i / BAR_COUNT < progress ? 1 : 0.4;
              return isFromMe ? `rgba(255,255,255,${opacity})` : `rgba(14,191,138,${opacity})`;
            })(),
          },
        ]}
      />
    )),
  [barHeights, progress, isFromMe]);

  return (
    <View style={[
      styles.container,
      { backgroundColor: isFromMe ? colors.primary : colors.gray100 }
    ]}>
      <TouchableOpacity
        style={[
          styles.playButton,
          { backgroundColor: isFromMe ? 'rgba(255,255,255,0.9)' : colors.primary }
        ]}
        onPress={togglePlayback}
        disabled={!isLoaded && !loadError}
        accessibilityLabel={(() => { if (isPlaying) { return "Pause voice message"; } if (loadError) { return "Tap to retry loading"; } return "Play voice message"; })()}
        accessibilityRole="button"
      >
        <Ionicons
          name={(() => { if (loadError) { return "refresh" as const; } if (isPlaying) { return "pause" as const; } return "play" as const; })()}
          size={20}
          color={isFromMe ? colors.primary : "#fff"}
        />
      </TouchableOpacity>

      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {waveformBars}
        </View>

        <Text style={[
          styles.duration,
          { color: isFromMe ? 'rgba(255,255,255,0.8)' : colors.gray }
        ]}>
          {loadError ? 'Tap to retry' : displayTime}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    minWidth: 180,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  waveformContainer: {
    flex: 1,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  duration: {
    fontSize: 11,
    marginTop: 4,
  },
});
