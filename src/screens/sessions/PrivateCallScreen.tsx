// src/screens/sessions/PrivateCallScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '../../config/theme';

const { width, height } = Dimensions.get('window');

export default function PrivateCallScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const { creator } = route.params || {
    creator: {
      name: 'Apte Fitness',
      avatar: 'https://i.pravatar.cc/100?img=33',
    },
  };

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setShowEndConfirm(true);
  };

  const confirmEndCall = () => {
    navigation.replace('SessionEnded', { duration, creator });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Remote Video (Creator) - Full screen */}
      <View style={styles.remoteVideo}>
        {/* Simulated video background */}
        <Image
          source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800' }}
          style={styles.videoBackground}
          resizeMode="cover"
        />
      </View>

      {/* Local Video (Self) - PiP */}
      <View style={[styles.localVideoContainer, { top: insets.top + 60 }]}>
        <View style={styles.localVideo}>
          {isVideoOff ? (
            <View style={styles.videoOffPlaceholder}>
              <Ionicons name="videocam-off" size={24} color="white" />
            </View>
          ) : (
            <Image
              source={{ uri: 'https://i.pravatar.cc/200?img=12' }}
              style={styles.localVideoImage}
            />
          )}
        </View>
      </View>

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.creatorInfo}>
          <Image source={{ uri: creator.avatar }} style={styles.creatorAvatar} />
          <View>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <View style={styles.durationBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.durationText}>{formatDuration(duration)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.flipButton}>
          <Ionicons name="camera-reverse-outline" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
        <BlurView intensity={40} tint="dark" style={styles.controlsBlur}>
          {/* Mute */}
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={() => setIsMuted(!isMuted)}
          >
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={24}
              color="white"
            />
          </TouchableOpacity>

          {/* Video */}
          <TouchableOpacity
            style={[styles.controlButton, isVideoOff && styles.controlButtonActive]}
            onPress={() => setIsVideoOff(!isVideoOff)}
          >
            <Ionicons
              name={isVideoOff ? 'videocam-off' : 'videocam'}
              size={24}
              color="white"
            />
          </TouchableOpacity>

          {/* End Call */}
          <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
            <Ionicons name="call" size={28} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>

          {/* Speaker */}
          <TouchableOpacity
            style={[styles.controlButton, !isSpeakerOn && styles.controlButtonActive]}
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          >
            <Ionicons
              name={isSpeakerOn ? 'volume-high' : 'volume-mute'}
              size={24}
              color="white"
            />
          </TouchableOpacity>

          {/* Chat */}
          <TouchableOpacity style={styles.controlButton}>
            <Ionicons name="chatbubble-ellipses" size={24} color="white" />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* End Call Confirmation */}
      {showEndConfirm && (
        <View style={styles.confirmOverlay}>
          <BlurView intensity={80} tint="dark" style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>End Session?</Text>
            <Text style={styles.confirmSubtitle}>
              Are you sure you want to end this private session?
            </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.continueButton}
                onPress={() => setShowEndConfirm(false)}
              >
                <Text style={styles.continueText}>Continue Session</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.endButton}
                onPress={confirmEndCall}
              >
                <Text style={styles.endText}>End Session</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  videoBackground: {
    width: '100%',
    height: '100%',
  },
  localVideoContainer: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  localVideo: {
    width: 100,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#333',
    borderWidth: 2,
    borderColor: 'white',
  },
  localVideoImage: {
    width: '100%',
    height: '100%',
  },
  videoOffPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#444',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 25,
    paddingRight: 16,
    paddingVertical: 6,
    paddingLeft: 6,
    gap: 10,
  },
  creatorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  creatorName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  durationText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  controlsBlur: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 28,
    overflow: 'hidden',
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  endCallButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModal: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
  },
  confirmSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmButtons: {
    width: '100%',
    gap: 12,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  endText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
