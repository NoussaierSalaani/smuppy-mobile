// src/screens/live/ViewerLiveStreamScreen.tsx
// Screen for users to watch a live stream as a viewer
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '../../components/OptimizedImage';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import SharePostModal from '../../components/SharePostModal';
import type { ShareContentData } from '../../hooks/useModalState';
import { useAgora } from '../../hooks/useAgora';
import { useLiveStream, LiveComment, LiveReaction } from '../../hooks/useLiveStream';
import { RemoteVideoView } from '../../components/AgoraVideoView';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { filterContent } from '../../utils/contentFilters';

const { width, height: _height } = Dimensions.get('window');

interface Comment {
  id: string;
  user: string;
  avatar: string;
  text: string;
  isCreator?: boolean;
}

interface RouteParams {
  channelName: string;
  creatorId?: string;
  creatorName?: string;
  creatorAvatar?: string;
  liveTitle?: string;
  viewerCount?: number;
}

// Reaction emojis
const REACTIONS = ['❤️', '🔥', '💪', '👏', '😍', '🎉'];

export default function ViewerLiveStreamScreen(): React.JSX.Element {
  const { showAlert, showSuccess, showError } = useSmuppyAlert();
  const navigation = useNavigation<{ goBack: () => void }>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = (route.params || {}) as RouteParams;
  const { colors, isDark } = useTheme();
  const { formatAmount: formatCurrencyAmount } = useCurrency();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const {
    channelName,
    creatorName = 'Pro Creator',
    creatorAvatar = null,
    liveTitle = 'Live Session',
  } = params;

  // Agora hook for watching (audience)
  const {
    isJoined,
    isLoading,
    error,
    remoteUsers,
    leaveChannel,
    destroy,
  } = useAgora({
    role: 'audience',
    channelName,
    autoJoin: true,
  });

  const [newComment, setNewComment] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContentData | null>(null);

  const floatingReactions = useRef<{ id: string; emoji: string; anim: Animated.Value }[]>([]);
  const [, forceUpdate] = useState({});
  const isMountedRef = useRef(true);
  const joinStreamPromiseRef = useRef<Promise<void> | null>(null);
  const reactionIdCounterRef = useRef(0);

  // Trigger floating reaction animation
  const triggerFloatingReaction = useCallback((emoji: string) => {
    if (!isMountedRef.current) return;
    
    reactionIdCounterRef.current += 1;
    const id = `${Date.now()}_${reactionIdCounterRef.current}`;
    
    const anim = new Animated.Value(0);
    floatingReactions.current.push({ id, emoji, anim });
    forceUpdate({});

    Animated.timing(anim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start(() => {
      if (isMountedRef.current) {
        floatingReactions.current = floatingReactions.current.filter(r => r.id !== id);
        forceUpdate({});
      }
    });
  }, []);

  // Real-time live stream hook
  const {
    viewerCount: wsViewerCount,
    comments: liveComments,
    sendComment: sendLiveComment,
    sendReaction: sendLiveReaction,
    joinStream,
    leaveStream,
  } = useLiveStream({
    channelName,
    isHost: false,
    onReaction: (reaction: LiveReaction) => {
      // Trigger floating reaction animation
      triggerFloatingReaction(reaction.emoji);
    },
  });

  // Transform LiveComment to local Comment format
  const comments: Comment[] = liveComments.map((c: LiveComment) => ({
    id: c.id,
    user: c.user.displayName || c.user.username,
    avatar: c.user.avatarUrl,
    text: c.content,
  }));

  // Join stream on mount and cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    joinStreamPromiseRef.current = joinStream();
    
    return () => {
      isMountedRef.current = false;
      floatingReactions.current.forEach(r => r.anim.stopAnimation());
      floatingReactions.current = [];
      
      if (joinStreamPromiseRef.current) {
        joinStreamPromiseRef.current
          .catch(() => {})
          .finally(() => {
            leaveStream().catch(() => {});
            destroy().catch(() => {});
          });
      } else {
        leaveStream().catch(() => {});
        destroy().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle stream ended
  useEffect(() => {
    // If we were joined but now have no remote users, stream might have ended
    if (isJoined && remoteUsers.length === 0) {
      // Give it a moment - host might just be reconnecting
      const timeout = setTimeout(() => {
        if (remoteUsers.length === 0) {
          showAlert({
            title: 'Stream Ended',
            message: `${creatorName}'s live stream has ended.`,
            type: 'warning',
            buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
          });
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isJoined, remoteUsers.length, creatorName, navigation, showAlert]);

  const handleSendComment = useCallback(() => {
    // Sanitize: strip HTML tags and control characters
    const sanitized = newComment.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (!sanitized) return;
    // Content moderation — block all severities in live chat
    const filterResult = filterContent(sanitized, { context: 'live_chat' });
    if (!filterResult.clean) {
      showError('Content Policy', filterResult.reason || 'Message blocked.');
      return;
    }
    sendLiveComment(sanitized);
    setNewComment('');
  }, [newComment, sendLiveComment, showError]);

  const handleReaction = useCallback((emoji: string) => {
    // Trigger local animation
    triggerFloatingReaction(emoji);
    // Send to other viewers via WebSocket
    sendLiveReaction(emoji);
    setShowReactions(false);
  }, [triggerFloatingReaction, sendLiveReaction]);

  const handleLeave = useCallback(async () => {
    setShowLeaveModal(false);
    try {
      await leaveStream();
      await leaveChannel();
      await destroy();
    } catch (err) {
      if (__DEV__) console.warn('[ViewerLiveStream] Cleanup error:', err);
    }
    navigation.goBack();
  }, [leaveStream, leaveChannel, destroy, navigation]);

  const handleShare = useCallback(() => {
    setShareContent({
      id: channelName,
      type: 'text',
      title: liveTitle,
      subtitle: `${creatorName} is live now!`,
      shareText: `Join me watching ${creatorName} live on Smuppy! ${wsViewerCount} viewers watching now.`,
    });
    setShareModalVisible(true);
  }, [channelName, liveTitle, creatorName, wsViewerCount]);

  const renderComment = useCallback(({ item }: { item: Comment }) => {
    return (
      <View style={styles.commentItem}>
        <AvatarImage source={item.avatar} size={28} />
        <View style={styles.commentContent}>
          <Text style={[styles.commentUser, item.isCreator && styles.creatorNameHighlight]}>
            {item.user} {item.isCreator && '(Creator)'}
          </Text>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
      </View>
    );
    // Styles are memoized and stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get the host's UID (first remote user is typically the host)
  const hostUid = remoteUsers[0];

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Joining live stream...</Text>
      </View>
    );
  }

  // Error state
  if (error && !isJoined) {
    if (__DEV__) console.warn('[ViewerLiveStreamScreen] Stream error:', error);
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <Ionicons name="alert-circle" size={48} color="#FF3B30" />
        <Text style={styles.errorText}>Unable to join stream. Please try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.retryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Video Stream Background */}
      {hostUid ? (
        <RemoteVideoView
          uid={hostUid}
          channelId={channelName}
          style={styles.streamBackground}
        />
      ) : (
        <View style={styles.streamBackground}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.streamPlaceholder}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.streamPlaceholderText}>Waiting for host...</Text>
          </View>
        </View>
      )}

      {/* Floating Reactions */}
      {floatingReactions.current.map(({ id, emoji, anim }) => (
        <Animated.Text
          key={id}
          style={[
            styles.floatingReaction,
            {
              opacity: anim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [1, 1, 0],
              }),
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -200],
                  }),
                },
                {
                  translateX: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, (Math.random() - 0.5) * 100],
                  }),
                },
                {
                  scale: anim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.5, 1.2, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {emoji}
        </Animated.Text>
      ))}

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowLeaveModal(true)}
        >
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        {/* Creator Info */}
        <TouchableOpacity style={styles.creatorInfo}>
          <AvatarImage source={creatorAvatar} size={36} />
          <View style={styles.creatorTextInfo}>
            <View style={styles.creatorNameRow}>
              <Text style={styles.creatorName}>{creatorName}</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.liveTitle} numberOfLines={1}>{liveTitle}</Text>
          </View>
        </TouchableOpacity>

        {/* Viewer Count */}
        <View style={styles.viewerCount}>
          <Ionicons name="eye" size={16} color="white" />
          <Text style={styles.viewerCountText}>{wsViewerCount > 0 ? wsViewerCount : '...'}</Text>
        </View>
      </View>

      {/* Bottom Section */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.bottomSection}
      >
        {/* Comments List */}
        <View style={styles.commentsContainer}>
          <FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.commentsList}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={10}
          />
        </View>

        {/* Actions Row */}
        <View style={[styles.actionsRow, { paddingBottom: insets.bottom + 10 }]}>
          {/* Comment Input */}
          <View style={styles.commentInputContainer}>
            <TextInput
              style={styles.commentInput}
              placeholder="Say something..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={newComment}
              onChangeText={setNewComment}
              onSubmitEditing={handleSendComment}
              returnKeyType="send"
              maxLength={500}
            />
            {newComment.trim() && (
              <TouchableOpacity onPress={handleSendComment} style={styles.sendButton}>
                <Ionicons name="send" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Reaction Button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowReactions(!showReactions)}
          >
            <Ionicons name="heart" size={24} color="white" />
          </TouchableOpacity>

          {/* Gift Button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowGiftModal(true)}
          >
            <Ionicons name="gift" size={24} color="white" />
          </TouchableOpacity>

          {/* Share Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Reactions Popup */}
        {showReactions && (
          <Animated.View style={styles.reactionsPopup}>
            {REACTIONS.map((emoji, index) => (
              <TouchableOpacity
                key={index}
                style={styles.reactionButton}
                onPress={() => handleReaction(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </KeyboardAvoidingView>

      {/* Leave Confirmation Modal */}
      <Modal visible={showLeaveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Leave Live?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to leave {creatorName}'s live stream?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowLeaveModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={handleLeave}
              >
                <LinearGradient
                  colors={GRADIENTS.primary}
                  style={styles.modalButtonGradient}
                >
                  <Text style={styles.modalButtonConfirmText}>Leave</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Gift Modal */}
      <Modal visible={showGiftModal} transparent animationType="slide">
        <View style={styles.giftModalOverlay}>
          <View style={styles.giftModalContent}>
            <View style={styles.giftModalHeader}>
              <Text style={styles.giftModalTitle}>Send a Gift</Text>
              <TouchableOpacity onPress={() => setShowGiftModal(false)}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.giftModalSubtitle}>
              Show your appreciation to {creatorName}
            </Text>

            <View style={styles.giftsGrid}>
              {[
                { emoji: '☕', name: 'Coffee', price: 2.99 },
                { emoji: '🌟', name: 'Star', price: 4.99 },
                { emoji: '🎁', name: 'Gift Box', price: 9.99 },
                { emoji: '💎', name: 'Diamond', price: 19.99 },
                { emoji: '🏆', name: 'Trophy', price: 49.99 },
                { emoji: '🚀', name: 'Rocket', price: 99.99 },
              ].map((gift, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.giftItem}
                  onPress={() => {
                    setShowGiftModal(false);
                    showSuccess('Gift Sent!', `You sent a ${gift.name} to ${creatorName}!`);
                  }}
                >
                  <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                  <Text style={styles.giftName}>{gift.name}</Text>
                  <Text style={styles.giftPrice}>{formatCurrencyAmount(Math.round(gift.price * 100))}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <SharePostModal
        visible={shareModalVisible}
        content={shareContent}
        onClose={() => setShareModalVisible(false)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
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
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  streamBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  streamPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamPlaceholderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    marginTop: 16,
  },
  floatingReaction: {
    position: 'absolute',
    right: 60,
    bottom: 150,
    fontSize: 40,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 25,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 10,
  },
  creatorTextInfo: {
    marginLeft: 10,
    flex: 1,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  creatorName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  creatorNameHighlight: {
    color: colors.primary,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
    marginRight: 4,
  },
  liveText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  liveTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  viewerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  viewerCountText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  commentsContainer: {
    height: 200,
    paddingHorizontal: 16,
  },
  commentsList: {
    paddingVertical: 10,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  commentContent: {
    marginLeft: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: width * 0.7,
  },
  commentUser: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  commentText: {
    color: 'white',
    fontSize: 14,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  commentInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25,
    paddingHorizontal: 16,
    height: 44,
  },
  commentInput: {
    flex: 1,
    color: 'white',
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  reactionsPopup: {
    position: 'absolute',
    bottom: 70,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 25,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reactionButton: {
    padding: 8,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 24,
    width: width * 0.85,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButtonCancel: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  modalButtonConfirm: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  giftModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  giftModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  giftModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  giftModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  giftModalSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 20,
  },
  giftsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  giftItem: {
    width: (width - 60) / 3,
    alignItems: 'center',
    padding: 16,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.12)' : 'rgba(14, 191, 138, 0.08)',
    borderRadius: 16,
    marginBottom: 12,
  },
  giftEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  giftName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dark,
  },
  giftPrice: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
});
