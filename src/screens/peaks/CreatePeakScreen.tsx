import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import RecordButton from '../../components/peaks/RecordButton';
import { DARK_COLORS as COLORS } from '../../config/theme';
import {
  FilterProvider,
  useFilters,
  FilterSelector,
  OverlayEditor,
  DraggableOverlay,
} from '../../filters';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  CreatePeak: { replyTo?: string; originalPeak?: OriginalPeak };
  PeakPreview: { videoUri: string; duration: number; replyTo?: string; originalPeak?: OriginalPeak };
  [key: string]: object | undefined;
};

// Inner component that uses filter context
const CreatePeakScreenInner = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreatePeak'>>();

  const { replyTo, originalPeak } = route.params || {};

  const cameraRef = useRef<CameraView>(null);
  const videoPreviewRef = useRef<Video>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<RecordedVideo | null>(null);
  const [cameraKey, setCameraKey] = useState(1);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  // Custom alert state (for errors)
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Toast state (for quick messages like "too short")
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const { activeFilter, activeOverlays, updateOverlay } = useFilters();

  // Animation for filter panel
  const filterPanelProgress = useSharedValue(0);

  const toggleFilters = useCallback(() => {
    const newValue = !showFilters;
    setShowFilters(newValue);
    filterPanelProgress.value = withSpring(newValue ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
  }, [showFilters, filterPanelProgress]);

  const filterPanelStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(
          filterPanelProgress.value,
          [0, 1],
          [200, 0],
          Extrapolation.CLAMP
        ),
      },
    ],
    opacity: filterPanelProgress.value,
  }));

  // Handle overlay position change
  const handleOverlayPositionChange = useCallback((overlayId: string, position: any) => {
    updateOverlay(overlayId, { position: { ...position } });
  }, [updateOverlay]);

  const toggleCameraFacing = (): void => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // Full reset
  const resetCamera = (): void => {
    setIsRecording(false);
    setRecordedVideo(null);
    setIsPreviewPlaying(false);
    setCameraKey(prev => prev + 1);
  };

  // Show custom alert (for errors)
  const showCustomAlert = (message: string): void => {
    setAlertMessage(message);
    setShowAlert(true);
  };

  // Close alert and reset
  const closeAlert = (): void => {
    setShowAlert(false);
    setAlertMessage('');
    resetCamera();
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
    // Hide filters when recording starts
    if (showFilters) {
      setShowFilters(false);
      filterPanelProgress.value = withTiming(0, { duration: 200 });
    }

    setIsRecording(true);
    setRecordedVideo(null);

    if (cameraRef.current) {
      try {
        const video = await cameraRef.current.recordAsync({
          maxDuration: selectedDuration,
        });

        if (video) {
          setRecordedVideo(video);
        }
        setIsRecording(false);
        setIsPreviewPlaying(false);
      } catch (_error) {
        setIsRecording(false);
        const isSimulator = !cameraRef.current;
        showCustomAlert(
          isSimulator
            ? 'Video recording is not available on simulator. Please use a real device.'
            : 'Unable to record video. Please try again.'
        );
      }
    }
  };

  // End recording
  const handleRecordEnd = async (_recordedDuration: number): Promise<void> => {
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch (_error) {
        // Stop recording error handled silently
      }
    }
  };

  // Recording too short - show toast instead of invasive modal
  const handleRecordCancel = (message: string): void => {
    setIsRecording(false);
    setRecordedVideo(null);

    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch { /* Ignore stop errors */ }
    }

    showToastMessage(message);
  };

  // Close screen
  const handleClose = async (): Promise<void> => {
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch { /* Ignore stop errors */ }
    }
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Ignore stop errors */ }
    }
    navigation.goBack();
  };

  // Refaire le peak
  const handleRetake = async (): Promise<void> => {
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Ignore stop errors */ }
    }
    resetCamera();
  };

  // Valider et aller à l'écran suivant
  const handleConfirm = async (): Promise<void> => {
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch { /* Ignore stop errors */ }
    }

    if (recordedVideo) {
      navigation.navigate('PeakPreview', {
        videoUri: recordedVideo.uri,
        duration: selectedDuration,
        replyTo,
        originalPeak,
      });
      setRecordedVideo(null);
      setIsPreviewPlaying(false);
    }
  };

  // Custom Alert Component
  const CustomAlert = (): React.JSX.Element => (
    <Modal
      visible={showAlert}
      transparent
      animationType="fade"
      onRequestClose={closeAlert}
    >
      <View style={styles.alertOverlay}>
        <View style={styles.alertContainer}>
          <LinearGradient
            colors={[COLORS.darkCard, COLORS.dark]}
            style={styles.alertGradient}
          >
            <View style={styles.alertIconContainer}>
              <Ionicons name="time-outline" size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.alertTitle}>Peak too short</Text>
            <Text style={styles.alertMessage}>{alertMessage}</Text>
            <TouchableOpacity
              style={styles.alertButton}
              onPress={closeAlert}
            >
              <Text style={styles.alertButtonText}>Try Again</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );

  // Permissions loading
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permissionText}>Loading...</Text>
      </View>
    );
  }

  // Permissions denied
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permissionText}>Camera access required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Allow</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* CAMERA VIEW (quand pas de vidéo enregistrée) */}
      {!recordedVideo && (
        <CameraView
          key={cameraKey}
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="video"
        >
          {/* Header - Minimal */}
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClose}
            >
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>
              {replyTo ? 'Reply' : 'Peak'}
            </Text>

            <View style={{ width: 44 }} />
          </View>

          {/* Right Side Toolbar - TikTok style */}
          {!isRecording && (
            <View style={[styles.sideToolbar, { top: insets.top + 80 }]}>
              {/* Flip Camera */}
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={toggleCameraFacing}
              >
                <Ionicons name="camera-reverse" size={26} color={COLORS.white} />
                <Text style={styles.toolbarLabel}>Flip</Text>
              </TouchableOpacity>

              {/* Filters Toggle */}
              <TouchableOpacity
                style={[
                  styles.toolbarButton,
                  showFilters && styles.toolbarButtonActive,
                ]}
                onPress={toggleFilters}
              >
                <Ionicons
                  name="color-wand"
                  size={26}
                  color={showFilters ? COLORS.primary : COLORS.white}
                />
                <Text style={[
                  styles.toolbarLabel,
                  showFilters && styles.toolbarLabelActive,
                ]}>
                  Filters
                </Text>
              </TouchableOpacity>

              {/* Overlays */}
              <TouchableOpacity
                style={[
                  styles.toolbarButton,
                  activeOverlays.length > 0 && styles.toolbarButtonActive,
                ]}
                onPress={() => setShowOverlayEditor(true)}
              >
                <View>
                  <Ionicons
                    name="layers"
                    size={26}
                    color={activeOverlays.length > 0 ? COLORS.primary : COLORS.white}
                  />
                  {activeOverlays.length > 0 && (
                    <View style={styles.overlayBadge}>
                      <Text style={styles.overlayBadgeText}>{activeOverlays.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={[
                  styles.toolbarLabel,
                  activeOverlays.length > 0 && styles.toolbarLabelActive,
                ]}>
                  Overlays
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Info réponse */}
          {replyTo && originalPeak && !isRecording && (
            <View style={[styles.replyInfo, { top: insets.top + 70 }]}>
              <Text style={styles.replyText}>
                Reply to {originalPeak.user?.name}
              </Text>
            </View>
          )}

          {/* Active filter indicator - centered top */}
          {activeFilter && !isRecording && (
            <View style={[styles.activeFilterBadge, { top: insets.top + 70 }]}>
              <Ionicons name="sparkles" size={14} color={COLORS.primary} />
              <Text style={styles.activeFilterText}>Filter Active</Text>
            </View>
          )}

          {/* Draggable overlays */}
          {activeOverlays.map((overlay) => (
            <DraggableOverlay
              key={overlay.id}
              overlay={overlay}
              containerWidth={SCREEN_WIDTH}
              containerHeight={SCREEN_HEIGHT}
              onPositionChange={(pos) => handleOverlayPositionChange(overlay.id, pos)}
            />
          ))}

          {/* Filter Panel - Animated slide up */}
          {!isRecording && (
            <Animated.View style={[styles.filterPanelContainer, filterPanelStyle]}>
              <FilterSelector
                compact
                onOpenOverlays={() => setShowOverlayEditor(true)}
              />
            </Animated.View>
          )}

          {/* Zone du bas - Record */}
          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 16 }]}>
            {/* Sélecteur de durée */}
            {!isRecording && (
              <View style={styles.durationSelector}>
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
            )}

            {/* Bouton d'enregistrement */}
            <View style={styles.recordButtonContainer}>
              <RecordButton
                maxDuration={selectedDuration}
                minDuration={3}
                onRecordStart={handleRecordStart}
                onRecordEnd={handleRecordEnd}
                onRecordCancel={handleRecordCancel}
              />
            </View>

            {/* Instruction */}
            {!isRecording && (
              <Text style={styles.instructions}>Hold to record</Text>
            )}
          </View>
        </CameraView>
      )}

      {/* VIDEO PREVIEW (après enregistrement) */}
      {recordedVideo && (
        <View style={styles.previewContainer}>
          {/* Video plein écran */}
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
                  <Ionicons name="play" size={50} color={COLORS.white} />
                </View>
              </View>
            )}
          </TouchableOpacity>

          {/* Header */}
          <View style={[styles.previewHeader, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClose}
            >
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>

            <View style={styles.durationBadge}>
              <Text style={styles.durationBadgeText}>{selectedDuration}s</Text>
            </View>

            <View style={{ width: 44 }} />
          </View>

          {/* Boutons en bas */}
          <View style={[styles.previewBottomSection, { paddingBottom: insets.bottom + 20 }]}>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleRetake}
            >
              <Ionicons name="refresh" size={24} color={COLORS.white} />
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
            >
              <Ionicons name="checkmark" size={24} color={COLORS.dark} />
              <Text style={styles.confirmButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Custom Alert */}
      <CustomAlert />

      {/* Toast (quick non-invasive message) */}
      {showToast && (
        <View style={[styles.toastContainer, { top: insets.top + 60 }]}>
          <View style={styles.toast}>
            <Ionicons name="time-outline" size={18} color={COLORS.white} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}

      {/* Overlay Editor Modal */}
      <OverlayEditor
        visible={showOverlayEditor}
        onClose={() => setShowOverlayEditor(false)}
      />
    </View>
  );
};

// Wrapper component with FilterProvider
const CreatePeakScreen = (): React.JSX.Element => {
  return (
    <FilterProvider>
      <CreatePeakScreenInner />
    </FilterProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  camera: {
    flex: 1,
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
    color: COLORS.white,
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
  toolbarButtonActive: {
    backgroundColor: 'rgba(0,230,118,0.15)',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  toolbarLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  toolbarLabelActive: {
    color: COLORS.primary,
  },
  overlayBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.dark,
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
    borderColor: COLORS.primary,
  },
  replyText: {
    fontSize: 13,
    color: COLORS.white,
  },

  // Active filter badge
  activeFilterBadge: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  activeFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Filter Panel
  filterPanelContainer: {
    position: 'absolute',
    bottom: 200,
    left: 0,
    right: 0,
    zIndex: 50,
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
    backgroundColor: COLORS.primary,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  durationTextActive: {
    color: COLORS.dark,
    fontWeight: '700',
  },
  recordButtonContainer: {
    width: 90,
    height: 90,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructions: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },

  // Preview
  previewContainer: {
    flex: 1,
    backgroundColor: COLORS.dark,
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  durationBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
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
    color: COLORS.white,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },

  // Alert
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 20,
    overflow: 'hidden',
  },
  alertGradient: {
    padding: 28,
    alignItems: 'center',
  },
  alertIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(17, 227, 163, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  alertButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 36,
    paddingVertical: 12,
    borderRadius: 22,
  },
  alertButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.dark,
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
    color: COLORS.white,
  },
});

export default CreatePeakScreen;
