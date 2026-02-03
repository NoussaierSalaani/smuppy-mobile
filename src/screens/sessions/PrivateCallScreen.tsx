// src/screens/sessions/PrivateCallScreen.tsx
// 1:1 Private Video Call Screen with Agora
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Animated,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage from '../../components/OptimizedImage';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { usePrivateCall } from '../../hooks/useAgora';
import { LocalVideoView, RemoteVideoView, VideoPlaceholder } from '../../components/AgoraVideoView';
import { awsAPI } from '../../services/aws-api';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

const { width: _width, height: _height } = Dimensions.get('window');

interface _RouteParams {
  sessionId: string;
  creator: {
    id: string;
    name: string;
    avatar: string;
  };
  myUserId: string;
  isIncoming?: boolean;
}

type CallState = 'connecting' | 'ringing' | 'connected' | 'ended';

export default function PrivateCallScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { showAlert } = useSmuppyAlert();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const {
    sessionId,
    creator = { id: 'creator_123', name: 'Apte Fitness', avatar: null },
    myUserId = 'user_123',
    isIncoming = false,
  } = route.params || {};

  // Agora hook for private 1:1 call
  const {
    isJoined,
    isLoading,
    error,
    remoteUsers,
    isMuted,
    isVideoOff,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleVideo,
    switchCamera,
    destroy,
  } = usePrivateCall(myUserId, creator.id);

  const [callState, setCallState] = useState<CallState>(isIncoming ? 'ringing' : 'connecting');
  const [duration, setDuration] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [localVideoLarge, setLocalVideoLarge] = useState(false);
  const [agoraToken, setAgoraToken] = useState<string | null>(null);
  const [agoraChannelName, setAgoraChannelName] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Fetch Agora token from backend
  const fetchAgoraToken = useCallback(async (): Promise<boolean> => {
    if (!sessionId) {
      if (__DEV__) console.warn('No sessionId provided, using fallback channel');
      return true; // Continue with fallback
    }

    try {
      const response = await awsAPI.getSessionToken(sessionId);
      if (response.success && response.token) {
        setAgoraToken(response.token);
        setAgoraChannelName(response.channelName || `private_${sessionId}`);
        return true;
      } else {
        if (__DEV__) console.error('Failed to get Agora token:', response.message);
        return false;
      }
    } catch (err) {
      if (__DEV__) console.error('Error fetching Agora token:', err);
      return false;
    }
  }, [sessionId]);

  // Start call on mount (if not incoming)
  useEffect(() => {
    if (!isIncoming) {
      startCall();
    }
    return () => {
      destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle connection state changes
  useEffect(() => {
    if (isJoined && remoteUsers.length > 0) {
      setCallState('connected');
    } else if (isJoined && remoteUsers.length === 0 && callState === 'connected') {
      // Other user disconnected
      handleCallEnded('The other person left the call');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJoined, remoteUsers.length]);

  // Timer for call duration
  useEffect(() => {
    if (callState !== 'connected') return;

    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callState]);

  // Pulse animation for ringing/connecting
  useEffect(() => {
    if (callState === 'ringing' || callState === 'connecting') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState]);

  const startCall = async () => {
    setCallState('connecting');

    // First fetch the Agora token from backend
    const tokenFetched = await fetchAgoraToken();
    if (!tokenFetched) {
      showAlert({
        title: 'Error',
        message: 'Failed to initialize video call. Please try again.',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
      return;
    }

    // Then join the channel with the token
    const success = await joinChannel(agoraToken || undefined);
    if (success) {
      setCallState('ringing');
    } else {
      showAlert({
        title: 'Error',
        message: error || 'Failed to start call',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    }
  };

  const acceptCall = async () => {
    setCallState('connecting');

    // First fetch the Agora token from backend
    const tokenFetched = await fetchAgoraToken();
    if (!tokenFetched) {
      showAlert({
        title: 'Error',
        message: 'Failed to initialize video call. Please try again.',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
      return;
    }

    const success = await joinChannel(agoraToken || undefined);
    if (!success) {
      showAlert({
        title: 'Error',
        message: error || 'Failed to join call',
        type: 'error',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    }
  };

  const declineCall = () => {
    navigation.goBack();
  };

  const handleCallEnded = (_message: string) => {
    setCallState('ended');
    navigation.replace('SessionEnded', { duration, creator });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    setShowEndConfirm(true);
  };

  const confirmEndCall = async () => {
    await leaveChannel();
    await destroy();
    navigation.replace('SessionEnded', { duration, creator });
  };

  const swapVideos = () => {
    setLocalVideoLarge(!localVideoLarge);
  };

  const remoteUid = remoteUsers[0];
  const channelId = agoraChannelName || `private_${[myUserId, creator.id].sort().join('_')}`;

  // Incoming call UI
  if (callState === 'ringing' && isIncoming) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.incomingContent, { paddingTop: insets.top + 60 }]}>
          <Text style={styles.incomingLabel}>Incoming Video Call</Text>

          <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulseAnim }] }]}>
            <OptimizedImage
              source={creator.avatar}
              style={styles.callerAvatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
          </Animated.View>

          <Text style={styles.callerName}>{creator.name}</Text>
          <Text style={styles.callerStatus}>is calling you...</Text>
        </View>

        <View style={[styles.incomingActions, { paddingBottom: insets.bottom + 50 }]}>
          <TouchableOpacity style={styles.declineButton} onPress={declineCall}>
            <Ionicons name="close" size={32} color="white" />
            <Text style={styles.actionLabel}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.acceptButton} onPress={acceptCall}>
            <Ionicons name="videocam" size={32} color="white" />
            <Text style={styles.actionLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Connecting/Ringing UI (outgoing)
  if (callState === 'connecting' || (callState === 'ringing' && !isIncoming)) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.connectingContent, { paddingTop: insets.top + 60 }]}>
          <Animated.View style={[styles.avatarPulse, { transform: [{ scale: pulseAnim }] }]}>
            <OptimizedImage
              source={creator.avatar}
              style={styles.callerAvatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
          </Animated.View>

          <Text style={styles.callerName}>{creator.name}</Text>
          <Text style={styles.callerStatus}>
            {callState === 'connecting' ? 'Connecting...' : 'Calling...'}
          </Text>

          {isLoading && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          )}
        </View>

        <View style={[styles.connectingActions, { paddingBottom: insets.bottom + 50 }]}>
          <TouchableOpacity style={styles.endCallButtonLarge} onPress={() => navigation.goBack()}>
            <Ionicons name="call" size={32} color="white" style={{ transform: [{ rotate: '135deg' }] }} />
            <Text style={styles.actionLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Connected call UI
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Main Video (Remote or Local based on swap) */}
      <View style={styles.remoteVideo}>
        {localVideoLarge ? (
          <LocalVideoView style={styles.videoBackground} isVideoOff={isVideoOff} />
        ) : remoteUid ? (
          <RemoteVideoView
            uid={remoteUid}
            channelId={channelId}
            style={styles.videoBackground}
          />
        ) : (
          <View style={styles.videoBackground}>
            <VideoPlaceholder label={`Waiting for ${creator.name}...`} />
          </View>
        )}
      </View>

      {/* Local Video (PiP) */}
      <TouchableOpacity
        style={[styles.localVideoContainer, { top: insets.top + 60 }]}
        onPress={swapVideos}
        activeOpacity={0.9}
      >
        <View style={styles.localVideo}>
          {localVideoLarge ? (
            remoteUid ? (
              <RemoteVideoView
                uid={remoteUid}
                channelId={channelId}
                style={styles.localVideoImage}
                zOrderMediaOverlay={true}
              />
            ) : (
              <VideoPlaceholder iconSize={20} />
            )
          ) : (
            <LocalVideoView
              style={styles.localVideoImage}
              isVideoOff={isVideoOff}
              zOrderMediaOverlay={true}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.creatorInfo}>
          <OptimizedImage
            source={creator.avatar}
            style={styles.creatorAvatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <View style={styles.durationBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.durationText}>{formatDuration(duration)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.flipButton} onPress={switchCamera}>
          <Ionicons name="camera-reverse-outline" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
        <BlurView intensity={40} tint="dark" style={styles.controlsBlur}>
          {/* Mute */}
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={toggleMute}
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
            onPress={toggleVideo}
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
              Are you sure you want to end this private session with {creator.name}?
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

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Incoming Call
  incomingContent: {
    flex: 1,
    alignItems: 'center',
  },
  incomingLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 40,
  },
  avatarPulse: {
    marginBottom: 24,
  },
  callerAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
  },
  callerStatus: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 80,
  },
  declineButton: {
    alignItems: 'center',
  },
  acceptButton: {
    alignItems: 'center',
  },
  actionLabel: {
    color: 'white',
    fontSize: 14,
    marginTop: 8,
  },
  // Connecting
  connectingContent: {
    flex: 1,
    alignItems: 'center',
  },
  connectingActions: {
    alignItems: 'center',
  },
  endCallButtonLarge: {
    alignItems: 'center',
  },
  // Connected
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
    borderColor: colors.primary,
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
    backgroundColor: colors.primary,
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
    zIndex: 100,
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
    backgroundColor: colors.primary,
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
