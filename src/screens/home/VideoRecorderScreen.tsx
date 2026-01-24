import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../../config/theme';
import {
  FilterProvider,
  useFilters,
  FilterSelector,
  OverlayEditor,
  DraggableOverlay,
} from '../../filters';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const MAX_SEGMENT_DURATION = 15; // 15 seconds per segment

interface VideoRecorderScreenProps {
  navigation: any;
  route: any;
}

function VideoRecorderScreenInner({ navigation, route }: VideoRecorderScreenProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [segmentCount, setSegmentCount] = useState(0);
  const [currentDuration, setCurrentDuration] = useState(0);
  const [savedSegments, setSavedSegments] = useState<string[]>([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRecordingRef = useRef(false);

  // Filter state
  const [showFilters, setShowFilters] = useState(true);
  const [showOverlayEditor, setShowOverlayEditor] = useState(false);
  const { activeFilter, activeOverlays, updateOverlay } = useFilters();

  // Handle overlay position change
  const handleOverlayPositionChange = useCallback((overlayId: string, position: any) => {
    updateOverlay(overlayId, { position: { ...position } });
  }, [updateOverlay]);

  // Progress animation (0 to 1 over 15 seconds)
  const progress = useSharedValue(0);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecordingRef.current) return;

    // Check media library permission
    if (!mediaPermission?.granted) {
      const { granted } = await requestMediaPermission();
      if (!granted) {
        Alert.alert('Permission needed', 'Please allow access to save videos to your library.');
        return;
      }
    }

    isRecordingRef.current = true;
    setIsRecording(true);
    setCurrentDuration(0);

    // Start progress animation
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: MAX_SEGMENT_DURATION * 1000,
      easing: Easing.linear,
    });

    // Start duration timer
    timerRef.current = setInterval(() => {
      setCurrentDuration(prev => prev + 1);
    }, 1000);

    try {
      // Record with max duration of 15 seconds
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_SEGMENT_DURATION,
      });

      if (video && video.uri) {
        // Save to media library
        await saveToLibrary(video.uri);

        // If still recording (user hasn't stopped), start new segment
        if (isRecordingRef.current) {
          setSegmentCount(prev => prev + 1);
          // Small delay before starting next segment
          setTimeout(() => {
            if (isRecordingRef.current) {
              startRecording();
            }
          }, 100);
        }
      }
    } catch (error) {
      console.error('Recording error:', error);
      stopRecording();
      Alert.alert('Error', 'Failed to record video. Please try again.');
    }
  };

  const stopRecording = async () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop progress animation
    cancelAnimation(progress);
    progress.value = 0;

    // Stop camera recording
    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (error) {
        // Recording might have already stopped
      }
    }
  };

  const saveToLibrary = async (uri: string) => {
    try {
      const asset = await MediaLibrary.createAssetAsync(uri);
      setSavedSegments(prev => [...prev, asset.uri]);
      // Show brief confirmation
      setSegmentCount(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save to library:', error);
    }
  };

  const handleClose = () => {
    stopRecording();
    navigation.goBack();
  };

  const handleDone = () => {
    stopRecording();

    if (savedSegments.length > 0) {
      Alert.alert(
        'Videos Saved',
        `${savedSegments.length} video segment${savedSegments.length > 1 ? 's' : ''} saved to your photo library.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      navigation.goBack();
    }
  };

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
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="video"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.segmentBadge}>
            <Ionicons name="videocam" size={16} color="#FFF" />
            <Text style={styles.segmentText}>
              {segmentCount > 0 ? `${segmentCount} saved` : '15s segments'}
            </Text>
          </View>

          <View style={styles.headerRightButtons}>
            {/* Overlay button */}
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowOverlayEditor(true)}
            >
              <Ionicons name="layers-outline" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.headerButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse-outline" size={28} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        {isRecording && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBackground}>
              <Animated.View style={[styles.progressBar, progressStyle]} />
            </View>
            <Text style={styles.timerText}>{currentDuration}s / 15s</Text>
          </View>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}

        {/* Active filter indicator */}
        {activeFilter && (
          <View style={styles.activeFilterBadge}>
            <Ionicons name="sparkles" size={14} color="#0EBF8A" />
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

        {/* Filter Selector - shown when not recording */}
        {showFilters && !isRecording && (
          <View style={styles.filterSelectorContainer}>
            <FilterSelector
              compact
              onOpenOverlays={() => setShowOverlayEditor(true)}
            />
          </View>
        )}

        {/* Info text */}
        {!isRecording && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Hold to record. Videos auto-save every 15 seconds.
            </Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
          {/* Record button */}
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.8}
          >
            <View style={[styles.recordButtonInner, isRecording && styles.recordButtonInnerActive]} />
          </TouchableOpacity>

          {/* Done button (if segments saved) */}
          {segmentCount > 0 && !isRecording && (
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <Ionicons name="checkmark" size={24} color="#0A0A0F" />
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </CameraView>

      {/* Overlay Editor Modal */}
      <OverlayEditor
        visible={showOverlayEditor}
        onClose={() => setShowOverlayEditor(false)}
      />
    </View>
  );
}

// Wrapper component with FilterProvider
export default function VideoRecorderScreen(props: VideoRecorderScreenProps) {
  return (
    <FilterProvider>
      <VideoRecorderScreenInner {...props} />
    </FilterProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRightButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Progress
  progressContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  progressBackground: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0EBF8A',
    borderRadius: 2,
  },
  timerText: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 8,
  },

  // Recording indicator
  recordingIndicator: {
    position: 'absolute',
    top: 130,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  recordingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },

  // Info
  infoContainer: {
    position: 'absolute',
    bottom: 180,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  // Bottom
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  recordButtonActive: {
    borderColor: '#FF3B30',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF3B30',
  },
  recordButtonInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
    marginBottom: 20,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },

  // Permission
  permissionText: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },

  // Filter styles
  filterSelectorContainer: {
    position: 'absolute',
    bottom: 160,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  activeFilterBadge: {
    position: 'absolute',
    top: 160,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#0EBF8A',
  },
  activeFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0EBF8A',
  },
});
