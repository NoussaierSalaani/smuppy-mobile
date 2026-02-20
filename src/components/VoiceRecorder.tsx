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

const MAX_DURATION_SECONDS = 300; // 5-minute max recording

type VoiceRecorderProps = Readonly<{
  onFinish: (uri: string, duration: number) => void;
  onCancel: () => void;
}>;


export default function VoiceRecorder({ onFinish, onCancel }: VoiceRecorderProps) {
  const { colors } = useTheme();
  const { showError } = useSmuppyAlert();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingUriRef = useRef<string | null>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Request permissions on mount + cleanup recording on unmount
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
      // Stop recording on unmount to prevent resource leak
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, [showError]);

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
    // Re-check permission if not granted (allows retry without app restart)
    // Per CLAUDE.md: proper auth and permission handling
    let hasPermission = permissionGranted;
    if (!hasPermission) {
      const { granted } = await Audio.requestPermissionsAsync();
      hasPermission = granted;
      setPermissionGranted(granted);
    }

    if (!hasPermission) {
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

      // Capture URI immediately while recording object is fully initialized
      recordingUriRef.current = newRecording.getURI();
      recordingRef.current = newRecording;
      setRecording(newRecording);
      setIsRecording(true);
      setDuration(0);
      durationRef.current = 0;

      // Start duration counter with auto-stop at max duration
      durationInterval.current = setInterval(async () => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= MAX_DURATION_SECONDS) {
          if (durationInterval.current) clearInterval(durationInterval.current);
          // Auto-stop recording at max duration
          const rec = recordingRef.current;
          if (rec) {
            try {
              const status = await rec.stopAndUnloadAsync();
              await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
              const uri = recordingUriRef.current || rec.getURI();
              const realDurationSec = status.durationMillis
                ? Math.floor(status.durationMillis / 1000)
                : durationRef.current;
              setRecording(null);
              setIsRecording(false);
              recordingRef.current = null;
              recordingUriRef.current = null;
              if (uri && realDurationSec >= 1) {
                onFinish(uri, realDurationSec);
              }
            } catch {
              // Fallback: user must press stop manually
            }
          }
        }
      }, 1000);
    } catch (err) {
      // Reset audio mode so playback isn't broken after a failed recording attempt
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      if (__DEV__) console.warn('Failed to start recording:', err);
      showError('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }

      // Get the actual recording status for real duration
      const status = await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      // Use URI captured at creation (safe) or try getURI as fallback
      const uri = recordingUriRef.current || recording.getURI();

      // Use real duration from recording status, fall back to manual timer
      const realDurationSec = status.durationMillis
        ? Math.floor(status.durationMillis / 1000)
        : durationRef.current;

      setRecording(null);
      setIsRecording(false);
      recordingRef.current = null;
      recordingUriRef.current = null;

      if (uri && realDurationSec >= 1) {
        onFinish(uri, realDurationSec);
      } else if (!uri) {
        if (__DEV__) console.warn('[VoiceRecorder] No recording URI available');
        showError('Error', 'Recording failed. Please try again.');
        onCancel();
      } else {
        showError('Too Short', 'Voice message must be at least 1 second');
        onCancel();
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to stop recording:', err);
      showError('Error', 'Recording failed. Please try again.');
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
        if (__DEV__) console.warn('Error canceling recording:', err);
      }
    }
    setRecording(null);
    setIsRecording(false);
    recordingRef.current = null;
    recordingUriRef.current = null;
    onCancel();
  };

  return (
    <View style={styles.container}>
      {/* Cancel button */}
      <TouchableOpacity style={styles.cancelButton} onPress={cancelRecording} accessibilityLabel="Cancel recording" accessibilityRole="button">
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
        accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
        accessibilityRole="button"
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
