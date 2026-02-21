import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import RecordButton from '../../components/peaks/RecordButton';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { HIT_SLOP } from '../../config/theme';
import { hapticButtonPress, hapticSubmit } from '../../utils/haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useUserStore } from '../../stores/userStore';
import { isValidUUID } from '../../utils/formatters';
import { captureException } from '../../lib/sentry';
import { ACCOUNT_TYPE } from '../../config/accountTypes';

interface DurationOption {
  value: number;
  label: string;
}

const DURATION_OPTIONS: DurationOption[] = [
  { value: 6, label: '6s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
  { value: 60, label: '60s' },
];

interface PeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface OriginalPeak {
  id: string;
  user?: PeakUser;
}

interface RecordedVideo {
  uri: string;
}

type RootStackParamList = {
  CreatePeak: { replyTo?: string; originalPeak?: OriginalPeak; challengeId?: string; challengeTitle?: string };
  PeakPreview: { videoUri: string; duration: number; replyTo?: string; originalPeak?: OriginalPeak; challengeId?: string; challengeTitle?: string };
  [key: string]: object | undefined;
};

// Inner component that uses filter context
const CreatePeakScreenInner = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatePeak'>>();

  const { replyTo: rawReplyTo, originalPeak, challengeId: rawChallengeId, challengeTitle } = route.params || {};
  // Validate UUIDs per CLAUDE.md - ignore invalid IDs
  const replyTo = rawReplyTo && isValidUUID(rawReplyTo) ? rawReplyTo : undefined;
  const challengeId = rawChallengeId && isValidUUID(rawChallengeId) ? rawChallengeId : undefined;
  const { showAlert: showSmuppyAlert } = useSmuppyAlert();
  const user = useUserStore((state) => state.user);

  const isBusiness = user?.accountType === ACCOUNT_TYPE.PRO_BUSINESS;

  // Business accounts cannot create peaks — redirect back immediately
  useEffect(() => {
    if (isBusiness) {
      navigation.goBack();
    }
  }, [isBusiness, navigation]);

  const cameraRef = useRef<CameraView>(null);
  const videoPreviewRef = useRef<Video>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [permissionsChecked, setPermissionsChecked] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [recordedVideo, setRecordedVideo] = useState<RecordedVideo | null>(null);
  const [cameraKey, setCameraKey] = useState(1);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [actualDuration, setActualDuration] = useState<number | null>(null);

  // Request both camera + microphone permissions for video mode
  useEffect(() => {
    const requestAllPermissions = async () => {
      try {
        // Request camera permission
        const camResult = await requestCameraPermission();
        const camGranted = camResult?.granted ?? false;

        // Request microphone permission (required for mode="video")
        const micResult = await Audio.requestPermissionsAsync();
        const micGranted = micResult?.granted ?? false;
        setMicPermissionGranted(micGranted);

        setPermissionsReady(camGranted && micGranted);
      } catch (error) {
        if (__DEV__) console.warn('Permission request error:', error);
      } finally {
        setPermissionsChecked(true);
      }
    };

    requestAllPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toast state (for quick messages like "too short")
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');


  const toggleCameraFacing = (): void => {
    hapticButtonPress();
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // Full reset
  const resetCamera = (): void => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordedVideo(null);
    setActualDuration(null);
    setIsPreviewPlaying(false);
    setCameraKey(prev => prev + 1);
  };

  // Show toast (auto-dismiss after 2s)
  const showToastMessage = (message: string): void => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
      setToastMessage('');
    }, 2000);
  };

  // Toggle preview play/pause
  const togglePreviewPlayback = async (): Promise<void> => {
    if (videoPreviewRef.current) {
      if (isPreviewPlaying) {
        await videoPreviewRef.current.pauseAsync();
      } else {
        await videoPreviewRef.current.playAsync();
      }
      setIsPreviewPlaying(!isPreviewPlaying);
    }
  };

  // Start recording
  const handleRecordStart = async (): Promise<void> => {
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordedVideo(null);
    setActualDuration(null);

    if (cameraRef.current) {
      try {
        const video = await cameraRef.current.recordAsync({
          maxDuration: selectedDuration,
        });

        if (video) {
          setRecordedVideo(video);
          // Measure actual video duration via expo-av
          try {
            const { sound } = await Audio.Sound.createAsync({ uri: video.uri });
            const status = await sound.getStatusAsync();
            if (status.isLoaded && status.durationMillis) {
              setActualDuration(Math.round(status.durationMillis / 1000));
            }
            await sound.unloadAsync();
          } catch {
            // Fallback: use selected duration if measurement fails
            setActualDuration(selectedDuration);
          }
        }
        isRecordingRef.current = false;
        setIsRecording(false);
        setIsPreviewPlaying(false);
      } catch (recordError) {
        isRecordingRef.current = false;
        setIsRecording(false);
        if (__DEV__) console.warn('[CreatePeak] Recording failed:', recordError);
        captureException(recordError instanceof Error ? recordError : new Error(String(recordError)));
        showSmuppyAlert({
          title: 'Recording Failed',
          message: 'Unable to record video. Please try again.',
          type: 'error',
          buttons: [{ text: 'Try Again', onPress: resetCamera }],
        });
      }
    }
  };

  // End recording
  const handleRecordEnd = async (_recordedDuration: number): Promise<void> => {
    if (cameraRef.current && isRecordingRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (_error) {
        // Stop recording error handled silently
      }
    }
  };

  // Recording too short - show toast instead of invasive modal
  const handleRecordCancel = (message: string): void => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setRecordedVideo(null);

    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch { /* Expected: camera/video may already be stopped or released */ }
    }

    showToastMessage(message);
  };

  // Close screen
  const handleClose = async (): Promise<void> => {
    hapticButtonPress();
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch { /* Expected: camera/video may already be stopped or released */ }
    }
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Expected: camera/video may already be stopped or released */ }
    }
    navigation.goBack();
  };

  // Retake the peak
  const handleRetake = async (): Promise<void> => {
    hapticButtonPress();
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Expected: camera/video may already be stopped or released */ }
    }
    resetCamera();
  };

  // Confirm and go to next screen
  const handleConfirm = async (): Promise<void> => {
    hapticSubmit();
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Expected: camera/video may already be stopped or released */ }
    }

    if (recordedVideo) {
      navigation.navigate('PeakPreview', {
        videoUri: recordedVideo.uri,
        duration: actualDuration ?? selectedDuration,
        replyTo,
        originalPeak,
        challengeId,
        challengeTitle,
      });
      setRecordedVideo(null);
      setIsPreviewPlaying(false);
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Block business accounts from seeing camera UI
  if (isBusiness) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Permissions loading
  if (!permissionsChecked) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.permissionText, { marginTop: 16 }]}>Setting up camera...</Text>
      </View>
    );
  }

  // Permissions denied — show which is missing + open settings
  if (!permissionsReady) {
    const cameraDenied = !cameraPermission?.granted;
    const micDenied = !micPermissionGranted;
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="camera-outline" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
        <Text style={styles.permissionTitle}>Permissions Required</Text>
        <Text style={styles.permissionText}>
          {cameraDenied && micDenied
            ? 'Camera and microphone access are needed to record Peaks.'
            : cameraDenied
            ? 'Camera access is needed to record Peaks.'
            : 'Microphone access is needed to record video with audio.'}
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.permissionButtonText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.permissionSecondaryButton}
          onPress={handleClose}
        >
          <Text style={styles.permissionSecondaryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* CAMERA VIEW (when no recorded video) */}
      {!recordedVideo && (
        <>
          <CameraView
            key={cameraKey}
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            mode="video"
          />

          {/* UI overlays rendered OUTSIDE CameraView for reliability */}

          {/* Header - Minimal */}
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClose}
              hitSlop={HIT_SLOP.medium}
            >
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>
              {(() => { if (challengeId) return 'Challenge Response'; if (replyTo) return 'Reply'; return 'Peak'; })()}
            </Text>

            <View style={{ width: 44 }} />
          </View>

          {/* Right Side Toolbar */}
          {!isRecording && (
            <View style={[styles.sideToolbar, { top: insets.top + 80 }]}>
              {/* Flip Camera */}
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={toggleCameraFacing}
                hitSlop={HIT_SLOP.medium}
              >
                <Ionicons name="camera-reverse" size={26} color={colors.white} />
                <Text style={styles.toolbarLabel}>Flip</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Reply info */}
          {replyTo && originalPeak && !isRecording && (
            <View style={[styles.replyInfo, { top: insets.top + 70 }]}>
              <Text style={styles.replyText}>
                Reply to {originalPeak.user?.name}
              </Text>
            </View>
          )}

          {/* Bottom zone - Record */}
          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
            {/* Duration selector — hidden via opacity to preserve layout */}
              <View style={[styles.durationSelector, isRecording && styles.hiddenPreserveLayout]}>
                {DURATION_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.durationOption,
                      selectedDuration === option.value && styles.durationOptionActive,
                    ]}
                    onPress={() => setSelectedDuration(option.value)}
                  >
                    <Text style={[
                      styles.durationText,
                      selectedDuration === option.value && styles.durationTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

            {/* Record button */}
            <View style={styles.recordButtonContainer}>
              <RecordButton
                maxDuration={selectedDuration}
                minDuration={3}
                onRecordStart={handleRecordStart}
                onRecordEnd={handleRecordEnd}
                onRecordCancel={handleRecordCancel}
              />
            </View>

            {/* Instruction — hidden via opacity to preserve layout */}
            <Text style={[styles.instructions, isRecording && styles.hiddenPreserveLayout]}>Hold to record</Text>
          </View>
        </>
      )}

      {/* VIDEO PREVIEW (after recording) */}
      {recordedVideo && (
        <View style={styles.previewContainer}>
          {/* Fullscreen video */}
          <TouchableOpacity
            style={styles.videoTouchable}
            activeOpacity={1}
            onPress={togglePreviewPlayback}
          >
            <Video
              ref={videoPreviewRef}
              source={{ uri: recordedVideo.uri }}
              style={styles.previewVideo}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isPreviewPlaying}
              isMuted={false}
            />

            {/* Play button overlay */}
            {!isPreviewPlaying && (
              <View style={styles.playButtonOverlay}>
                <View style={styles.playButton}>
                  <Ionicons name="play" size={50} color={colors.white} />
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Header */}
          <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClose}
              hitSlop={HIT_SLOP.medium}
            >
              <Ionicons name="close" size={28} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.durationBadge}>
              <Text style={styles.durationBadgeText}>{selectedDuration}s</Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {/* Bottom buttons */}
          <View style={[styles.previewBottomSection, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleRetake}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={24} color={colors.white} />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={24} color={colors.dark} />
              <Text style={styles.confirmButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Toast (quick non-invasive message) */}
      {showToast && (
        <View style={[styles.toastContainer, { top: insets.top + 60 }]}>
          <View style={styles.toast}>
            <Ionicons name="time-outline" size={18} color={colors.white} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}

    </View>
  );
};

const CreatePeakScreen = (): React.JSX.Element => {
  return <CreatePeakScreenInner />;
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  permissionSecondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  permissionSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
  },

  // Side Toolbar (TikTok style)
  sideToolbar: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 20,
    zIndex: 90,
  },
  toolbarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },

  // Reply info
  replyInfo: {
    position: 'absolute',
    left: 16,
    right: 80,
    backgroundColor: 'rgba(17, 227, 163, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  replyText: {
    fontSize: 13,
    color: colors.white,
  },

  // Bottom Section
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  durationSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  durationOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 50,
    alignItems: 'center',
  },
  durationOptionActive: {
    backgroundColor: colors.primary,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  durationTextActive: {
    color: colors.dark,
    fontWeight: '700',
  },
  recordButtonContainer: {
    width: 72,
    height: 72,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiddenPreserveLayout: {
    opacity: 0,
    pointerEvents: 'none',
  } as const,
  instructions: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },

  // Preview
  previewContainer: {
    flex: 1,
    backgroundColor: colors.dark,
  },
  videoTouchable: {
    flex: 1,
  },
  previewVideo: {
    flex: 1,
  },
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 6,
  },
  previewHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  durationBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  durationBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.dark,
  },
  previewBottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  retakeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },

  // Toast
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 8,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.white,
  },
});

export default CreatePeakScreen;
