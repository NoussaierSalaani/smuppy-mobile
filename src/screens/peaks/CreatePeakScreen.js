import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Video } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import RecordButton from '../../components/peaks/RecordButton';
import { DARK_COLORS as COLORS } from '../../config/theme';


const DURATION_OPTIONS = [
  { value: 6, label: '6s', icon: '⚡' },
  { value: 10, label: '10s', icon: '' },
  { value: 15, label: '15s', icon: '' },
];

const CreatePeakScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  
  const { replyTo, originalPeak } = route.params || {};
  
  const cameraRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('back');
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [cameraKey, setCameraKey] = useState(1);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  
  // Custom alert state
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  // Full reset
  const resetCamera = () => {
    setIsRecording(false);
    setRecordedVideo(null);
    setIsPreviewPlaying(false);
    setCameraKey(prev => prev + 1);
  };

  // Show custom alert
  const showCustomAlert = (message) => {
    setAlertMessage(message);
    setShowAlert(true);
  };

  // Close alert and reset
  const closeAlert = () => {
    setShowAlert(false);
    setAlertMessage('');
    resetCamera();
  };

  // Toggle preview play/pause
  const togglePreviewPlayback = async () => {
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
  const handleRecordStart = async () => {
    setIsRecording(true);
    setRecordedVideo(null);
    
    if (cameraRef.current) {
      try {
        const video = await cameraRef.current.recordAsync({
          maxDuration: selectedDuration,
        });
        
        setRecordedVideo(video);
        setIsRecording(false);
        setIsPreviewPlaying(false);
      } catch (error) {
        setIsRecording(false);
        showCustomAlert('Unable to record video. Please try again.');
      }
    }
  };

  // End recording
  const handleRecordEnd = async (_recordedDuration) => {
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch (error) {
        // Stop recording error handled silently
      }
    }
  };

  // Recording too short
  const handleRecordCancel = (message) => {
    setIsRecording(false);
    setRecordedVideo(null);
    
    if (cameraRef.current) {
      try {
        cameraRef.current.stopRecording();
      } catch (error) {}
    }
    
    showCustomAlert(message);
  };

  // Close screen
  const handleClose = async () => {
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
      } catch (error) {}
    }
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch (error) {}
    }
    navigation.goBack();
  };

  // Refaire le peak
  const handleRetake = async () => {
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch (error) {}
    }
    resetCamera();
  };

  // Valider et aller à l'écran suivant
  const handleConfirm = async () => {
    if (videoPreviewRef.current) {
      try {
        await videoPreviewRef.current.stopAsync();
      } catch (error) {}
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
  const CustomAlert = () => (
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
          {/* Header */}
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

            <TouchableOpacity 
              style={styles.headerButton}
              onPress={toggleCameraFacing}
            >
              <Ionicons name="camera-reverse-outline" size={28} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          {/* Info réponse */}
          {replyTo && originalPeak && !isRecording && (
            <View style={styles.replyInfo}>
              <Text style={styles.replyText}>
                Reply to {originalPeak.user?.name}
              </Text>
            </View>
          )}

          {/* Zone du bas - Record */}
          <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
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
                      {option.icon}{option.icon ? ' ' : ''}{option.label}
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
              resizeMode="cover"
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
    </View>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  replyInfo: {
    position: 'absolute',
    top: 120,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(17, 227, 163, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  replyText: {
    fontSize: 14,
    color: COLORS.white,
    textAlign: 'center',
  },
  
  // Bottom section
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  
  // Duration selector
  durationSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
    padding: 4,
    marginBottom: 20,
  },
  durationOption: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  durationOptionActive: {
    backgroundColor: COLORS.primary,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  durationTextActive: {
    color: COLORS.dark,
  },
  
  recordButtonContainer: {
    marginBottom: 10,
  },
  
  instructions: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 10,
  },
  
  // Preview container
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
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  durationBadgeText: {
    fontSize: 14,
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
    gap: 20,
    paddingHorizontal: 20,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  retakeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 36,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  
  // Custom Alert
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    overflow: 'hidden',
  },
  alertGradient: {
    padding: 30,
    alignItems: 'center',
  },
  alertIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(17, 227, 163, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 10,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 22,
  },
  alertButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 25,
  },
  alertButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
});

export default CreatePeakScreen;