import React, { useState, useEffect, useRef } from 'react';
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

export default function VoiceMessage({ uri, isFromMe }: VoiceMessageProps) {
  const { colors } = useTheme();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadSound();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const loadSound = async () => {
    try {
      const { sound: newSound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      );
      setSound(newSound);
      if (status.isLoaded && status.durationMillis) {
        setDuration(status.durationMillis);
        setIsLoaded(true);
      }
    } catch (err) {
      if (__DEV__) console.warn('Error loading sound:', err);
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    setPosition(status.positionMillis || 0);
    setIsPlaying(status.isPlaying);

    if (status.durationMillis) {
      const progress = status.positionMillis / status.durationMillis;
      progressAnim.setValue(progress);
    }

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPosition(0);
      progressAnim.setValue(0);
    }
  };

  const togglePlayback = async () => {
    if (!sound) return;

    if (isPlaying) {
      await sound.pauseAsync();
    } else {
      await sound.playAsync();
    }
  };

  const formatTime = (millis: number): string => {
    const totalSeconds = Math.floor(millis / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayTime = isPlaying || position > 0 ? position : duration;

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
        {/* Waveform bars (visual representation) */}
        <View style={styles.waveform}>
          {[...Array(20)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.waveformBar,
                {
                  height: 8 + Math.random() * 16,
                  backgroundColor: isFromMe
                    ? `rgba(255,255,255,${i / 20 < (position / duration || 0) ? 1 : 0.4})`
                    : `rgba(14,191,138,${i / 20 < (position / duration || 0) ? 1 : 0.4})`,
                },
              ]}
            />
          ))}
        </View>

        {/* Duration */}
        <Text style={[
          styles.duration,
          { color: isFromMe ? 'rgba(255,255,255,0.8)' : colors.gray }
        ]}>
          {formatTime(displayTime)}
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
