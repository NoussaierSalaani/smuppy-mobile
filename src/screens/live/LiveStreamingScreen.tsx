// src/screens/live/LiveStreamingScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Dimensions,
  StatusBar,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS } from '../../config/theme';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useAgora } from '../../hooks/useAgora';
import { useLiveStream, LiveComment } from '../../hooks';
import { LocalVideoView } from '../../components/AgoraVideoView';
import { generateLiveChannelName } from '../../services/agora';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';

const { width: _width, height: _height } = Dimensions.get('window');

interface UIComment {
  id: string;
  user: string;
  avatar: string;
  message: string;
  isNew?: boolean;
}

export default function LiveStreamingScreen(): React.JSX.Element {
  const { showError } = useSmuppyAlert();
  const navigation = useNavigation<{ goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<{ key: string; name: string; params: { title?: string; audience?: string; hostId?: string; hostName?: string; hostAvatar?: string | null } }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Get current user as fallback for host info
  const currentUser = useUserStore((state) => state.user);

  const {
    title: _title = 'Live Session',
    audience: _audience = 'public',
    hostId = currentUser?.id || 'unknown',
    hostName = currentUser?.displayName || currentUser?.username || 'Creator',
    hostAvatar = currentUser?.avatar || null,
  } = route.params || {};

  // Generate channel name
  const channelName = generateLiveChannelName(hostId);

  // Agora hook for broadcasting
  const {
    isInitialized: _isInitialized,
    isJoined,
    isLoading,
    error: _error,
    remoteUsers: _remoteUsers,
    isMuted,
    isVideoOff,
    initialize: _initialize,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleVideo,
    switchCamera,
    destroy,
  } = useAgora({
    role: 'broadcaster',
    channelName,
  });

  const [newComment, setNewComment] = useState('');
  const [duration, setDuration] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [isStarting, setIsStarting] = useState(true);

  const fadeAnims = useRef<{ [key: string]: Animated.Value }>({}).current;

  // Real-time live stream hook
  const {
    viewerCount,
    comments: liveComments,
    sendComment: sendLiveComment,
    joinStream,
    leaveStream,
  } = useLiveStream({
    channelName,
    isHost: true,
  });

  // Transform LiveComment to UIComment format
  const comments: UIComment[] = liveComments.map((c: LiveComment) => ({
    id: c.id,
    user: c.user.displayName || c.user.username,
    avatar: c.user.avatarUrl,
    message: c.content,
    isNew: c.isNew,
  }));

  // Initialize and join on mount
  useEffect(() => {
    startStream();
    return () => {
      destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startStream = async () => {
    setIsStarting(true);
    const success = await joinChannel(channelName, null);
    if (!success) {
      showError('Error', 'Failed to start stream. Please try again.');
      navigation.goBack();
      return;
    }
    // Join WebSocket channel for real-time comments/reactions
    await joinStream();
    setIsStarting(false);
  };

  // Timer for duration
  useEffect(() => {
    if (!isJoined) return;

    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isJoined]);

  // Note: viewerCount now comes from useLiveStream hook (WebSocket)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    setShowEndConfirm(true);
  };

  const endStream = async () => {
    // End stream on backend (records stats)
    const result = await awsAPI.endLiveStream().catch((err) => {
      if (__DEV__) console.warn('[LiveStreaming] Failed to end stream:', err);
      return null;
    });
    await leaveStream().catch(() => {});
    await leaveChannel().catch(() => {});
    await destroy().catch(() => {});
    navigation.replace('LiveEnded', {
      duration: result?.data?.durationSeconds || duration,
      viewerCount: result?.data?.maxViewers || viewerCount,
      totalComments: result?.data?.totalComments || 0,
      totalReactions: result?.data?.totalReactions || 0,
      channelName,
    });
  };

  const sendComment = () => {
    if (newComment.trim()) {
      sendLiveComment(newComment);
      setNewComment('');
    }
  };

  const renderComment = ({ item }: { item: UIComment }) => {
    if (!fadeAnims[item.id]) {
      fadeAnims[item.id] = new Animated.Value(item.isNew ? 0 : 1);
      if (item.isNew) {
        Animated.timing(fadeAnims[item.id], {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }
    }

    return (
      <Animated.View
        style={[
          styles.commentItem,
          { opacity: fadeAnims[item.id] },
        ]}
      >
        <AvatarImage source={item.avatar} size={32} />
        <View style={styles.commentContent}>
          <Text style={styles.commentUser}>{item.user}</Text>
          <Text style={styles.commentMessage}>{item.message}</Text>
        </View>
      </Animated.View>
    );
  };

  // Show loading state
  if (isStarting || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loadingText}>Starting live stream...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Video Background - Local Camera */}
      <LocalVideoView style={styles.videoBackground} isVideoOff={isVideoOff} />

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.creatorInfo}>
          {hostAvatar ? (
            <Image
              source={{ uri: hostAvatar }}
              style={styles.creatorAvatar}
            />
          ) : (
            <View style={[styles.creatorAvatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#374151' }]}>
              <Ionicons name="person" size={18} color="#9CA3AF" />
            </View>
          )}
          <View>
            <Text style={styles.creatorName}>{hostName}</Text>
            <Text style={styles.viewerCount}>{viewerCount} {viewerCount === 1 ? 'Viewer' : 'Viewers'}</Text>
          </View>
        </View>

        <View style={styles.topRight}>
          <View style={styles.liveBadge}>
            <View style={styles.liveIndicator} />
            <Text style={styles.liveText}>LIVE</Text>
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stream Controls */}
      <View style={[styles.streamControls, { top: insets.top + 70 }]}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Ionicons
            name={isMuted ? 'mic-off' : 'mic'}
            size={20}
            color="white"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, isVideoOff && styles.controlButtonActive]}
          onPress={toggleVideo}
        >
          <Ionicons
            name={isVideoOff ? 'videocam-off' : 'videocam'}
            size={20}
            color="white"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={switchCamera}
        >
          <Ionicons name="camera-reverse" size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Comments */}
      <View style={styles.commentsContainer}>
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.commentsList}
        />
      </View>

      {/* Bottom Controls */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.bottomControls, { paddingBottom: insets.bottom + 10 }]}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={newComment}
            onChangeText={setNewComment}
            onSubmitEditing={sendComment}
          />
          <TouchableOpacity onPress={sendComment} style={styles.sendButton}>
            <Ionicons name="send" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton}>
            <LinearGradient
              colors={GRADIENTS.primary}
              style={styles.actionButtonGradient}
            >
              <Ionicons name="happy-outline" size={22} color="white" />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <View style={styles.actionButtonDark}>
              <Ionicons name="share-outline" size={22} color="white" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <View style={styles.actionButtonDark}>
              <Ionicons name="gift-outline" size={22} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* End Stream Confirmation */}
      {showEndConfirm && (
        <View style={styles.confirmOverlay}>
          <BlurView intensity={80} tint="dark" style={styles.confirmModal}>
            <Text style={styles.confirmTitle}>End Live Stream?</Text>
            <Text style={styles.confirmSubtitle}>
              Your stream will end and {viewerCount} viewer{viewerCount !== 1 ? 's' : ''} will be disconnected.
            </Text>

            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={styles.cancelStreamButton}
                onPress={() => setShowEndConfirm(false)}
              >
                <Text style={styles.cancelStreamText}>Continue Streaming</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.endStreamButton}
                onPress={endStream}
              >
                <Text style={styles.endStreamText}>End Stream</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
    marginTop: 16,
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 25,
    paddingRight: 12,
    paddingVertical: 4,
    paddingLeft: 4,
    gap: 8,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  creatorName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  viewerCount: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
  },
  liveText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamControls: {
    position: 'absolute',
    right: 16,
    gap: 12,
    zIndex: 10,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
  },
  commentsContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    height: 250,
    paddingHorizontal: 16,
  },
  commentsList: {
    justifyContent: 'flex-end',
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    padding: 10,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  commentContent: {
    flex: 1,
  },
  commentUser: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  commentMessage: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    lineHeight: 18,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
  },
  commentInput: {
    flex: 1,
    color: 'white',
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  actionButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
  cancelStreamButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelStreamText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  endStreamButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  endStreamText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
