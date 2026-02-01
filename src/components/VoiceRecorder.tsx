import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';

interface VoiceRecorderProps {
  onSend: (uri: string, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const { colors } = useTheme();
  const { showError } = useSmuppyAlert();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      if (!granted) {
        showError('Permission Required', 'Microphone access is needed to record voice messages.');
      }
    })();

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  // Pulse animation while recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isRecording, pulseAnim]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (!permissionGranted) {
      showError('Permission Denied', 'Please enable microphone access in settings.');
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);

      // Start duration counter
      durationInterval.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      if (__DEV__) console.error('Failed to start recording:', err);
      showError('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }

      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);

      if (uri && duration >= 1) {
        onSend(uri, duration);
      } else if (duration < 1) {
        showError('Too Short', 'Voice message must be at least 1 second');
        onCancel();
      }
    } catch (err) {
      if (__DEV__) console.error('Failed to stop recording:', err);
      onCancel();
    }
  };

  const cancelRecording = async () => {
    if (recording) {
      try {
        if (durationInterval.current) {
          clearInterval(durationInterval.current);
        }
        await recording.stopAndUnloadAsync();
      } catch (err) {
        if (__DEV__) console.error('Error canceling recording:', err);
      }
    }
    setRecording(null);
    setIsRecording(false);
    onCancel();
  };

  return (
    <View style={styles.container}>
      {/* Cancel button */}
      <TouchableOpacity style={styles.cancelButton} onPress={cancelRecording}>
        <Ionicons name="close" size={24} color={colors.gray} />
      </TouchableOpacity>

      {/* Recording indicator */}
      <View style={styles.recordingInfo}>
        {isRecording && (
          <Animated.View
            style={[
              styles.recordingDot,
              { transform: [{ scale: pulseAnim }] }
            ]}
          />
        )}
        <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        {isRecording && <Text style={styles.recordingLabel}>Recording...</Text>}
      </View>

      {/* Record/Stop button */}
      <TouchableOpacity
        style={[styles.recordButton, isRecording && styles.recordButtonActive]}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <Ionicons
          name={isRecording ? "stop" : "mic"}
          size={28}
          color="#fff"
        />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    padding: 8,
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginRight: 8,
  },
  recordingLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonActive: {
    backgroundColor: '#FF3B30',
  },
});
