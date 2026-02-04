import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface VoiceMessageProps {
  uri: string;
  isFromMe: boolean;
}

const BAR_COUNT = 20;

export default function VoiceMessage({ uri, isFromMe }: VoiceMessageProps) {
  const { colors } = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  // Stable random bar heights — generated once per URI
  const barHeights = useMemo(() => {
    const heights: number[] = [];
    let seed = 0;
    for (let i = 0; i < uri.length; i++) seed = ((seed << 5) - seed + uri.charCodeAt(i)) | 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      seed = (seed * 16807 + 0) % 2147483647;
      heights.push(8 + (seed % 17));
    }
    return heights;
  }, [uri]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    setPosition(status.positionMillis || 0);
    setIsPlaying(status.isPlaying);

    if (status.durationMillis) {
      setDuration(status.durationMillis);
      const progress = status.positionMillis / status.durationMillis;
      progressAnim.setValue(progress);
    }

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      progressAnim.setValue(0);
    }
  }, [progressAnim]);

  useEffect(() => {
    let cancelled = false;

    const loadSound = async () => {
      // Unload previous sound if any
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }

      setIsLoaded(false);
      setLoadError(false);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const { sound: newSound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
          onPlaybackStatusUpdate
        );

        if (cancelled) {
          await newSound.unloadAsync();
          return;
        }

        soundRef.current = newSound;

        if (status.isLoaded) {
          setIsLoaded(true);
          if (status.durationMillis) {
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
  }, [uri, onPlaybackStatusUpdate]);

  const togglePlayback = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        // If finished, replay from start
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis && status.positionMillis >= status.durationMillis) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch (err) {
      if (__DEV__) console.warn('[VoiceMessage] Playback error:', err);
    }
  }, [isPlaying]);

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayTime = isPlaying || position > 0 ? position : duration;
  const progress = duration > 0 ? position / duration : 0;

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
        disabled={!isLoaded}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={20}
          color={isFromMe ? colors.primary : "#fff"}
        />
      </TouchableOpacity>

      <View style={styles.waveformContainer}>
        <View style={styles.waveform}>
          {barHeights.map((h, i) => (
            <View
              key={i}
              style={[
                styles.waveformBar,
                {
                  height: h,
                  backgroundColor: isFromMe
                    ? `rgba(255,255,255,${i / BAR_COUNT < progress ? 1 : 0.4})`
                    : `rgba(14,191,138,${i / BAR_COUNT < progress ? 1 : 0.4})`,
                },
              ]}
            />
          ))}
        </View>

        <Text style={[
          styles.duration,
          { color: isFromMe ? 'rgba(255,255,255,0.8)' : colors.gray }
        ]}>
          {loadError ? 'Error' : formatTime(displayTime)}
        </Text>
      </View>
    </View>
  );
}

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
