// src/screens/live/ViewerLiveStreamScreen.tsx
// Screen for personal users to watch a pro_creator's live stream as a viewer
import React, { useState, useEffect, useRef } from 'react';
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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '../../components/OptimizedImage';
import { COLORS, GRADIENTS } from '../../config/theme';

const { width, height } = Dimensions.get('window');

interface Comment {
  id: string;
  user: string;
  avatar: string;
  text: string;
  isCreator?: boolean;
}

interface RouteParams {
  creatorId?: string;
  creatorName?: string;
  creatorAvatar?: string;
  liveTitle?: string;
  viewerCount?: number;
}

// Mock comments for demo
const MOCK_COMMENTS: Comment[] = [
  { id: '1', user: 'FitFan_Mike', avatar: 'https://i.pravatar.cc/100?img=1', text: 'Great energy today!' },
  { id: '2', user: 'YogaLover', avatar: 'https://i.pravatar.cc/100?img=2', text: 'Can you show that stretch again?' },
  { id: '3', user: 'GymRat_23', avatar: 'https://i.pravatar.cc/100?img=3', text: 'This is amazing!' },
];

// Reaction emojis
const REACTIONS = ['❤️', '🔥', '💪', '👏', '😍', '🎉'];

export default function ViewerLiveStreamScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const params = (route.params || {}) as RouteParams;

  const {
    creatorName = 'Pro Creator',
    creatorAvatar = 'https://i.pravatar.cc/100?img=10',
    liveTitle = 'Live Session',
    viewerCount: initialViewerCount = 124,
  } = params;

  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [newComment, setNewComment] = useState('');
  const [viewerCount, setViewerCount] = useState(initialViewerCount);
  const [showReactions, setShowReactions] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);

  const reactionAnim = useRef(new Animated.Value(0)).current;
  const floatingReactions = useRef<{ id: string; emoji: string; anim: Animated.Value }[]>([]);
  const [, forceUpdate] = useState({});

  // Simulate viewer count changes
  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount(prev => prev + Math.floor(Math.random() * 3) - 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Simulate incoming comments
  useEffect(() => {
    const interval = setInterval(() => {
      const randomComments = [
        'Love this!',
        'Keep going!',
        'So inspiring!',
        'Best live ever!',
        'Thanks for this!',
      ];
      const newMockComment: Comment = {
        id: Date.now().toString(),
        user: `User_${Math.floor(Math.random() * 1000)}`,
        avatar: `https://i.pravatar.cc/100?img=${Math.floor(Math.random() * 70)}`,
        text: randomComments[Math.floor(Math.random() * randomComments.length)],
      };
      setComments(prev => [...prev.slice(-20), newMockComment]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSendComment = () => {
    if (!newComment.trim()) return;
    const comment: Comment = {
      id: Date.now().toString(),
      user: 'You',
      avatar: 'https://i.pravatar.cc/100?img=8',
      text: newComment.trim(),
    };
    setComments(prev => [...prev, comment]);
    setNewComment('');
  };

  const handleReaction = (emoji: string) => {
    // Create floating reaction animation
    const id = Date.now().toString();
    const anim = new Animated.Value(0);
    floatingReactions.current.push({ id, emoji, anim });
    forceUpdate({});

    Animated.timing(anim, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: true,
    }).start(() => {
      floatingReactions.current = floatingReactions.current.filter(r => r.id !== id);
      forceUpdate({});
    });

    setShowReactions(false);
  };

  const handleLeave = () => {
    setShowLeaveModal(false);
    navigation.goBack();
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.commentItem}>
      <AvatarImage source={item.avatar} size={28} />
      <View style={styles.commentContent}>
        <Text style={[styles.commentUser, item.isCreator && styles.creatorName]}>
          {item.user} {item.isCreator && '(Creator)'}
        </Text>
        <Text style={styles.commentText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Video Stream Background (placeholder) */}
      <View style={styles.streamBackground}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e', '#0f3460']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.streamPlaceholder}>
          <Ionicons name="videocam" size={60} color="rgba(255,255,255,0.3)" />
          <Text style={styles.streamPlaceholderText}>Live Stream</Text>
        </View>
      </View>

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
          <Text style={styles.viewerCountText}>{viewerCount}</Text>
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
            inverted={false}
            contentContainerStyle={styles.commentsList}
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
            />
            {newComment.trim() && (
              <TouchableOpacity onPress={handleSendComment} style={styles.sendButton}>
                <Ionicons name="send" size={20} color={COLORS.primary} />
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
          <TouchableOpacity style={styles.actionButton}>
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
                <Ionicons name="close" size={24} color={COLORS.dark} />
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
                    Alert.alert('Gift Sent!', `You sent a ${gift.name} to ${creatorName}!`);
                  }}
                >
                  <Text style={styles.giftEmoji}>{gift.emoji}</Text>
                  <Text style={styles.giftName}>{gift.name}</Text>
                  <Text style={styles.giftPrice}>${gift.price}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    color: 'rgba(255,255,255,0.3)',
    fontSize: 16,
    marginTop: 10,
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
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: width * 0.85,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: 'rgba(10, 37, 47, 0.7)',
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
    backgroundColor: 'rgba(10, 37, 47, 0.08)',
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
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
    backgroundColor: 'white',
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
    color: COLORS.dark,
  },
  giftModalSubtitle: {
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.6)',
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
    backgroundColor: 'rgba(14, 191, 138, 0.08)',
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
    color: COLORS.dark,
  },
  giftPrice: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 4,
  },
});
