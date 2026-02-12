import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  ActivityIndicator,
  Keyboard,
  AppState,
  Animated,
  Alert,
  InteractionManager,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveDisplayName } from '../../types/profile';
import EmojiPicker from 'rn-emoji-keyboard';
import { AccountBadge } from '../../components/Badge';
import VoiceRecorder from '../../components/VoiceRecorder';
import VoiceMessage from '../../components/VoiceMessage';
import SharedPostBubble from '../../components/SharedPostBubble';
import { GRADIENTS, SPACING } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useAppStore } from '../../stores/appStore';
import {
  getMessages,
  sendMessage as sendMessageToDb,
  uploadVoiceMessage,
  getOrCreateConversation,
  getCurrentUserId,
  blockUser,
  addMessageReaction,
  removeMessageReaction,
  deleteMessage,
  forwardMessage,
  getConversations,
  Message,
  Profile,
  MessageReaction,
  Conversation,
} from '../../services/database';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { formatTime } from '../../utils/dateFormatters';
import { isValidUUID } from '../../utils/formatters';
import { filterContent } from '../../utils/contentFilters';

const { width } = Dimensions.get('window');

/** Sanitize text: strip HTML tags and control characters per CLAUDE.md */
const sanitizeText = (text: string): string => {
  return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
};

interface MessageItemProps {
  item: Message;
  isFromMe: boolean;
  showAvatar: boolean;
  goToUserProfile: (userId: string) => void;
  formatTime: (dateString: string) => string;
  setSelectedImage: (uri: string | null) => void;
  styles: ReturnType<typeof createStyles>;
  onReply?: (message: Message) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onLongPress?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  colors: ThemeColors;
  currentUserId: string | null;
}

// Available quick reactions
const QUICK_REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

// Reply Preview Component inside message bubble
const ReplyPreviewInBubble = memo(({ replyTo, isFromMe, colors, styles }: { replyTo: Message; isFromMe: boolean; colors: ThemeColors; styles: ReturnType<typeof createStyles> }) => (
  <View style={[styles.replyPreview, isFromMe ? styles.replyFromMe : styles.replyFromOther, { borderLeftColor: isFromMe ? 'rgba(255,255,255,0.5)' : colors.primary }]}>
    <Text style={[styles.replyName, { color: isFromMe ? 'rgba(255,255,255,0.9)' : colors.primary }]} numberOfLines={1}>
      {resolveDisplayName(replyTo.sender)}
    </Text>
    <Text style={[styles.replyText, { color: isFromMe ? 'rgba(255,255,255,0.7)' : colors.gray }]} numberOfLines={2}>
      {replyTo.content || (replyTo.media_type === 'audio' ? 'Voice message' : 'Media')}
    </Text>
  </View>
));

// Reaction bar component
const MessageReactions = memo(({ reactions, isFromMe, styles, colors, currentUserId, onReaction }: {
  reactions: MessageReaction[];
  isFromMe: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  currentUserId: string | null;
  onReaction?: (emoji: string) => void;
}) => {
  if (!reactions || reactions.length === 0) return null;

  // Group reactions by emoji
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { count: 0, users: [], hasMe: false };
    acc[r.emoji].count++;
    acc[r.emoji].users.push(r.user);
    if (r.user_id === currentUserId) acc[r.emoji].hasMe = true;
    return acc;
  }, {} as Record<string, { count: number; users: (Profile | undefined)[]; hasMe: boolean }>);

  return (
    <View style={[styles.reactionsContainer, isFromMe ? styles.reactionsRight : styles.reactionsLeft]}>
      {Object.entries(grouped).map(([emoji, data]) => (
        <TouchableOpacity
          key={emoji}
          style={[styles.reactionBubble, data.hasMe && styles.reactionBubbleActive]}
          onPress={() => onReaction?.(emoji)}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          {data.count > 1 && (
            <Text style={[styles.reactionCount, { color: data.hasMe ? colors.primary : colors.gray }]}>
              {data.count}
            </Text>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
});

const MessageItem = memo(({ item, isFromMe, showAvatar, goToUserProfile, formatTime, setSelectedImage, styles, onReply, onReaction, onLongPress, onDelete: _onDelete, colors, currentUserId }: MessageItemProps) => {
  // Swipeable ref
  const swipeableRef = useRef<Swipeable>(null);

  // Render the reply action that appears when swiping
  const renderRightActions = useCallback((progress: Animated.AnimatedInterpolation<number>) => {
    if (isFromMe) return null;
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });
    return (
      <Animated.View style={[styles.replyActionContainer, { transform: [{ translateX }] }]}>
        <View style={[styles.replyAction, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="return-up-back" size={24} color={colors.primary} />
        </View>
      </Animated.View>
    );
  }, [isFromMe, colors, styles.replyAction, styles.replyActionContainer]);

  const renderLeftActions = useCallback((progress: Animated.AnimatedInterpolation<number>) => {
    if (!isFromMe) return null;
    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-100, 0] });
    return (
      <Animated.View style={[styles.replyActionContainerLeft, { transform: [{ translateX }] }]}>
        <View style={[styles.replyAction, { backgroundColor: colors.primary + '20' }]}>
          <Ionicons name="return-up-forward" size={24} color={colors.primary} />
        </View>
      </Animated.View>
    );
  }, [isFromMe, colors, styles.replyAction, styles.replyActionContainerLeft]);

  const handleSwipeOpen = useCallback(() => {
    if (onReply) {
      onReply(item);
    }
    setTimeout(() => swipeableRef.current?.close(), 150);
  }, [onReply, item]);

  const handleLongPress = useCallback(() => {
    if (item.is_deleted) return;
    // Trigger haptic feedback
    if (Platform.OS === 'ios') {
      const Haptics = require('expo-haptics');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onLongPress?.(item);
  }, [item, onLongPress]);

  const handleReactionPress = useCallback((emoji: string) => {
    onReaction?.(item.id, emoji);
  }, [item.id, onReaction]);

  return (
    <View style={styles.messageRowContainer}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={isFromMe ? undefined : renderRightActions}
        renderLeftActions={isFromMe ? renderLeftActions : undefined}
        onSwipeableWillOpen={handleSwipeOpen}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
      containerStyle={styles.swipeableContainer}
    >
      <View style={[styles.messageRow, isFromMe ? styles.messageRowRight : styles.messageRowLeft]}>
      {!isFromMe && (
        <TouchableOpacity style={styles.avatarSpace} onPress={() => item.sender?.id && goToUserProfile(item.sender.id)}>
          {showAvatar && item.sender && <AvatarImage source={item.sender.avatar_url} size={28} />}
        </TouchableOpacity>
      )}
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleLongPress}
        delayLongPress={300}
        style={[
          styles.messageBubble,
          isFromMe ? styles.messageBubbleRight : styles.messageBubbleLeft,
          (item.shared_post_id || (item.media_type === 'audio' && item.media_url)) && styles.messageBubbleNoPadding,
          item.reply_to_message && styles.messageBubbleWithReply,
        ]}
      >
        {item.reply_to_message && (
          <ReplyPreviewInBubble replyTo={item.reply_to_message} isFromMe={isFromMe} colors={colors} styles={styles} />
        )}
        {item.is_deleted ? (
          <Text style={[styles.deletedMessage, isFromMe && { color: 'rgba(255,255,255,0.6)' }]}>Message deleted</Text>
        ) : (
          <>
            {item.shared_post_id && (
              <SharedPostBubble postId={item.shared_post_id} isFromMe={isFromMe} />
            )}
            {item.media_type === 'audio' && item.media_url && (
              <VoiceMessage uri={item.media_url} isFromMe={isFromMe} />
            )}
            {item.media_type === 'audio' && !item.media_url && item.content && (
              <Text style={[styles.messageText, isFromMe && styles.messageTextRight]}>{item.content}</Text>
            )}
            {!item.shared_post_id && item.media_type !== 'audio' && item.content && (
              <Text style={[styles.messageText, isFromMe && styles.messageTextRight]}>{item.content}</Text>
            )}
            {item.media_url && item.media_type === 'image' && (
              <TouchableOpacity onPress={() => setSelectedImage(item.media_url || null)}>
                <OptimizedImage source={item.media_url} style={styles.messageImage} />
              </TouchableOpacity>
            )}
          </>
        )}
        {!item.shared_post_id && (item.media_type !== 'audio' || !item.media_url) && (
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isFromMe && styles.messageTimeRight]}>{formatTime(item.created_at)}</Text>
            {isFromMe && (
              <View style={styles.readReceiptContainer}>
                {item.is_read || (item.read_by && item.read_by.length > 0) ? (
                  <Ionicons name="checkmark-done" size={14} color="#4FC3F7" style={{ marginLeft: 4 }} />
                ) : (
                  <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
                )}
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
      </View>
    </Swipeable>
    {item.reactions && item.reactions.length > 0 && (
      <MessageReactions
        reactions={item.reactions}
        isFromMe={isFromMe}
        styles={styles}
        colors={colors}
        currentUserId={currentUserId}
        onReaction={handleReactionPress}
      />
    )}
    </View>
  );
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.is_deleted === next.item.is_deleted &&
  prev.item.content === next.item.content &&
  prev.item.media_url === next.item.media_url &&
  prev.item.media_type === next.item.media_type &&
  prev.item.reply_to_message_id === next.item.reply_to_message_id &&
  JSON.stringify(prev.item.reactions) === JSON.stringify(next.item.reactions) &&
  prev.isFromMe === next.isFromMe &&
  prev.showAvatar === next.showAvatar &&
  prev.styles === next.styles &&
  prev.colors === next.colors &&
  prev.currentUserId === next.currentUserId
));

interface ChatScreenProps {
  route: {
    params: {
      conversationId?: string | null;
      otherUser?: Profile | null;
      userId?: string;
      unreadCount?: number;
    };
  };
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    setOptions: (options: Record<string, unknown>) => void;
  };
}

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();
  const { conversationId: initialConversationId, otherUser, userId, unreadCount: routeUnreadCount } = route.params;
  const insets = useSafeAreaInsets();

  // SECURITY: Validate UUID params on mount
  useEffect(() => {
    if (initialConversationId && !isValidUUID(initialConversationId)) {
      if (__DEV__) console.warn('[ChatScreen] Invalid conversationId:', initialConversationId);
      showError('Error', 'Invalid conversation');
      navigation.goBack();
      return;
    }
    if (userId && !isValidUUID(userId)) {
      if (__DEV__) console.warn('[ChatScreen] Invalid userId:', userId);
      showError('Error', 'Invalid user');
      navigation.goBack();
    }
  }, [initialConversationId, userId, showError, navigation]);
  const flatListRef = useRef<typeof FlashList.prototype | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [otherUserProfile] = useState<Profile | null>(otherUser || null);
  const [isRecording, setIsRecording] = useState(false);
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number } | null>(null);
  const [voicePreviewVisible, setVoicePreviewVisible] = useState(false);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);

  // Message actions menu state
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState(false);

  // Forward modal state
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [forwarding, setForwarding] = useState(false);

  const inputRef = useRef<TextInput>(null);

  // Refs for stable callbacks (avoid re-creating renderMessage on every poll)
  const messagesRef = useRef<Message[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(0);

  // Track pending optimistic message IDs so polling doesn't wipe them
  const pendingOptimisticIdsRef = useRef<Set<string>>(new Set());

  // Handle emoji selection
  const handleEmojiSelect = useCallback((emoji: { emoji: string }) => {
    setInputText(prev => prev + emoji.emoji);
  }, []);

  // Toggle emoji picker
  const toggleEmojiPicker = useCallback(() => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      setShowEmojiPicker(true);
    }
  }, [showEmojiPicker]);

  // Get current user ID
  useEffect(() => {
    let mounted = true;
    getCurrentUserId().then(id => {
      if (mounted) {
        setCurrentUserId(id);
        currentUserIdRef.current = id;
      }
    }).catch(() => {
      // Storage read failure — userId stays null, safe fallback
    });
    return () => { mounted = false; };
  }, []);

  // Track initialization error
  const [initError, setInitError] = useState<string | null>(null);

  // Load or create conversation — deferred until after navigation animation
  useEffect(() => {
    let mounted = true;
    const task = InteractionManager.runAfterInteractions(() => {
      const initConversation = async () => {
        if (mounted) setInitError(null);
        if (initialConversationId) {
          if (mounted) setConversationId(initialConversationId);
        } else if (userId) {
          const { data, error } = await getOrCreateConversation(userId);
          if (!mounted) return;
          if (error) {
            if (__DEV__) console.warn('[ChatScreen] Failed to create conversation:', error);
            setInitError(error);
            setLoading(false);
          } else if (data) {
            setConversationId(data);
          } else {
            setInitError('Failed to initialize conversation');
            setLoading(false);
          }
        } else {
          if (mounted) {
            setInitError('No conversation or user specified');
            setLoading(false);
          }
        }
      };
      initConversation();
    });
    return () => { mounted = false; task.cancel(); };
  }, [initialConversationId, userId]);

  // Load messages
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const hasMarkedReadRef = useRef(false);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await getMessages(conversationId, 0, 100);
    if (!mountedRef.current) return;
    if (!error && data) {
      // Preserve any optimistic messages that haven't been confirmed by the server yet
      const optimisticIds = pendingOptimisticIdsRef.current;
      const optimisticMessages = optimisticIds.size > 0
        ? messagesRef.current.filter(m => optimisticIds.has(m.id))
        : [];
      const merged = optimisticMessages.length > 0
        ? [...data, ...optimisticMessages]
        : data;

      // Smart polling: only update state if messages actually changed
      const prev = messagesRef.current;
      const changed = merged.length !== prev.length ||
        merged.some((msg, i) => msg.id !== prev[i]?.id || msg.is_deleted !== prev[i]?.is_deleted || msg.content !== prev[i]?.content || msg.media_url !== prev[i]?.media_url || msg.media_type !== prev[i]?.media_type);
      if (changed) {
        messagesRef.current = merged;
        setMessages(merged);
        // Mark as read is handled automatically by the backend when fetching messages.
        // We only need to update the local unread badge once on first load.
        if (!hasMarkedReadRef.current) {
          hasMarkedReadRef.current = true;
          // Decrement the global unread messages badge
          if (routeUnreadCount && routeUnreadCount > 0) {
            useAppStore.getState().setUnreadMessages((prev) => Math.max(0, prev - routeUnreadCount));
          }
        }
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) {
      loadMessages();
    }
  }, [conversationId, loadMessages]);

  // Poll for new messages every 3s when app is active
  useEffect(() => {
    if (!conversationId) return;
    const POLL_INTERVAL_MS = 10000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      intervalId = setInterval(() => {
        loadMessages();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadMessages();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [conversationId, loadMessages]);

  const goToUserProfile = useCallback((profileUserId: string) => {
    if (!isValidUUID(profileUserId)) {
      if (__DEV__) console.warn('[ChatScreen] Invalid profileUserId:', profileUserId);
      return;
    }
    navigation.navigate('UserProfile', { userId: profileUserId });
  }, [navigation]);

  const handleSendMessage = useCallback(async () => {
    const messageText = sanitizeText(inputText);
    if (!messageText) return;

    // Content moderation check (skip personal data for DMs)
    const filterResult = filterContent(messageText, { context: 'chat', skipPersonalDataCheck: true });
    if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
      showError('Content Policy', filterResult.reason || 'Your message contains inappropriate content.');
      return;
    }

    if (!conversationId) {
      showError('Error', 'Conversation not initialized. Please go back and try again.');
      return;
    }

    if (sending) return;
    setInputText('');
    setSending(true);

    // Optimistic: add message locally immediately
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId || '',
      content: messageText,
      created_at: new Date().toISOString(),
      is_deleted: false,
      media_url: undefined,
      media_type: undefined,
      shared_post_id: undefined,
      reply_to_message_id: replyToMessage?.id,
      reactions: [],
    };
    pendingOptimisticIdsRef.current.add(optimisticId);
    setMessages(prev => {
      const next = [...prev, optimisticMessage];
      messagesRef.current = next;
      return next;
    });

    const { data: sentMessage, error } = await sendMessageToDb(conversationId, messageText, undefined, undefined, replyToMessage?.id);
    
    // Clear reply after sending
    setReplyToMessage(null);

    if (error) {
      // Remove optimistic message and restore input
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.filter(m => m.id !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      showError('Error', 'Failed to send message. Please try again.');
      setInputText(messageText);
    } else if (sentMessage) {
      // Replace optimistic message with real server response
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.map(m => m.id === optimisticId ? sentMessage : m);
        messagesRef.current = next;
        return next;
      });
    } else {
      pendingOptimisticIdsRef.current.delete(optimisticId);
    }
    setSending(false);
  }, [conversationId, inputText, sending, currentUserId, showError, replyToMessage]);

  // Handle voice message send with optimistic update
  const handleVoiceSend = useCallback(async (uri: string, duration: number) => {
    if (!conversationId) return;

    setIsRecording(false);
    setVoicePreviewVisible(false);
    setVoicePreview(null);
    setSending(true);

    const durationText = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;

    // Optimistic: show voice message immediately with local URI
    const optimisticId = `optimistic-voice-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId || '',
      content: `Voice message (${durationText})`,
      media_url: uri,
      media_type: 'audio',
      created_at: new Date().toISOString(),
      is_deleted: false,
      shared_post_id: undefined,
      reply_to_message_id: replyToMessage?.id,
      reactions: [],
    };
    pendingOptimisticIdsRef.current.add(optimisticId);
    setMessages(prev => {
      const next = [...prev, optimisticMessage];
      messagesRef.current = next;
      return next;
    });

    // Upload voice message
    const { data: voiceUrl, error: uploadError } = await uploadVoiceMessage(uri, conversationId);

    if (uploadError || !voiceUrl) {
      // Remove optimistic message on failure
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.filter(m => m.id !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      showError('Error', 'Failed to upload voice message');
      setSending(false);
      return;
    }

    // Send message with audio URL
    const { data: sentMessage, error } = await sendMessageToDb(
      conversationId,
      `Voice message (${durationText})`,
      voiceUrl,
      'audio',
      replyToMessage?.id
    );

    // Clear reply after sending
    setReplyToMessage(null);

    if (error) {
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.filter(m => m.id !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      showError('Error', 'Failed to send voice message');
    } else if (sentMessage) {
      // Replace optimistic with real message, keeping local URI for sender playback
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.map(m => {
          if (m.id !== optimisticId) return m;
          // Keep local URI if server didn't return a media_url (CDN might not be ready)
          const bestMediaUrl = sentMessage.media_url || m.media_url;
          return { ...sentMessage, media_url: bestMediaUrl };
        });
        messagesRef.current = next;
        return next;
      });
    } else {
      pendingOptimisticIdsRef.current.delete(optimisticId);
    }
    setSending(false);
  }, [conversationId, currentUserId, showError, replyToMessage]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleOpenChatMenu = useCallback(() => setChatMenuVisible(true), []);
  const handleCloseChatMenu = useCallback(() => setChatMenuVisible(false), []);
  const handleGoToOtherProfile = useCallback(() => {
    if (otherUserProfile?.id) goToUserProfile(otherUserProfile.id);
  }, [otherUserProfile?.id, goToUserProfile]);
  const handleStartRecording = useCallback(() => setIsRecording(true), []);
  const handleStopRecording = useCallback(() => setIsRecording(false), []);
  const handleVoiceFinish = useCallback((uri: string, duration: number) => {
    setIsRecording(false);
    setVoicePreview({ uri, duration });
    setVoicePreviewVisible(true);
  }, []);
  const handleCloseEmojiPicker = useCallback(() => setShowEmojiPicker(false), []);
  const handleReply = useCallback((message: Message) => {
    setReplyToMessage(message);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);
  const handleCancelReply = useCallback(() => setReplyToMessage(null), []);

  // Handle message reaction
  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const hasReaction = message.reactions?.some(r => r.user_id === currentUserId && r.emoji === emoji);

    try {
      if (hasReaction) {
        const { error } = await removeMessageReaction(messageId, emoji);
        if (error) { showError('Error', 'Could not remove reaction. Please try again.'); return; }
      } else {
        const { error } = await addMessageReaction(messageId, emoji);
        if (error) { showError('Error', 'Could not add reaction. Please try again.'); return; }
      }

      // Refresh messages to get updated reactions
      loadMessages();
    } catch {
      showError('Error', 'Something went wrong. Please try again.');
    }
  }, [messages, currentUserId, loadMessages, showError]);

  // Handle message long press - show menu
  const handleMessageLongPress = useCallback((message: Message) => {
    if (message.is_deleted) return;
    setSelectedMessage(message);
    setShowMessageMenu(true);
    if (Platform.OS === 'ios') {
      const Haptics = require('expo-haptics');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  // Handle delete message
  const handleDeleteMessage = useCallback(async (message: Message) => {
    // Check if message is less than 15 minutes old
    const messageAge = Date.now() - new Date(message.created_at).getTime();
    const fifteenMinutes = 15 * 60 * 1000;

    if (messageAge > fifteenMinutes) {
      showError('Cannot Delete', 'Messages can only be deleted within 15 minutes of sending.');
      return;
    }

    Alert.alert(
      'Delete Message',
      'Delete this message for everyone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { success, error } = await deleteMessage(message.id);
            if (success) {
              // Refresh messages
              loadMessages();
            } else {
              showError('Error', error || 'Failed to delete message');
            }
          },
        },
      ]
    );
  }, [loadMessages, showError]);

  // Handle forward message
  const handleForwardPress = useCallback(() => {
    setShowMessageMenu(false);
    setShowForwardModal(true);
    // Load conversations
    getConversations().then(({ data }) => {
      if (data) setConversations(data);
    }).catch(() => {
      // Conversation load failed — forward modal shows empty list
    });
  }, []);

  const handleForwardToConversation = useCallback(async (conversationId: string) => {
    if (!selectedMessage) return;
    
    setForwarding(true);
    const { data: _data, error } = await forwardMessage(selectedMessage.id, conversationId);
    
    if (error) {
      showError('Error', error);
    } else {
      showSuccess('Forwarded', 'Message forwarded successfully');
      setShowForwardModal(false);
    }
    setForwarding(false);
  }, [selectedMessage, showError, showSuccess]);

  const handleCloseSelectedImage = useCallback(() => setSelectedImage(null), []);
  const handleCloseVoicePreview = useCallback(() => {
    setVoicePreviewVisible(false);
    setVoicePreview(null);
  }, []);
  const handleDiscardVoice = useCallback(async () => {
    setVoicePreviewVisible(false);
    if (voicePreview?.uri) {
      try { await FileSystem.deleteAsync(voicePreview.uri, { idempotent: true }); } catch { /* cleanup best-effort */ }
    }
    setVoicePreview(null);
  }, [voicePreview?.uri]);
  const handleSendVoicePreview = useCallback(() => {
    if (voicePreview) handleVoiceSend(voicePreview.uri, voicePreview.duration);
  }, [voicePreview, handleVoiceSend]);

  const handleSendImage = useCallback(async (imageUri: string) => {
    if (!conversationId) {
      showError('Error', 'Conversation not initialized');
      return;
    }

    if (sending) return;
    setSending(true);

    // Optimistic: show image message immediately with local URI
    const optimisticId = `optimistic-img-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId || '',
      content: '',
      created_at: new Date().toISOString(),
      is_deleted: false,
      media_url: imageUri,
      media_type: 'image',
      shared_post_id: undefined,
      reply_to_message_id: replyToMessage?.id,
      reactions: [],
    };
    pendingOptimisticIdsRef.current.add(optimisticId);
    setMessages(prev => {
      const next = [...prev, optimisticMessage];
      messagesRef.current = next;
      return next;
    });

    try {
      // Get presigned URL for image upload
      const { getPresignedUrl } = await import('../../services/mediaUpload');
      const fileName = `message-${Date.now()}.jpg`;
      const presignedResult = await getPresignedUrl(fileName, 'messages', 'image/jpeg');

      if (!presignedResult || !presignedResult.uploadUrl) {
        pendingOptimisticIdsRef.current.delete(optimisticId);
        setMessages(prev => {
          const next = prev.filter(m => m.id !== optimisticId);
          messagesRef.current = next;
          return next;
        });
        showError('Error', 'Failed to get upload URL');
        setSending(false);
        return;
      }

      // Upload image
      const { uploadWithFileSystem } = await import('../../services/mediaUpload');
      const uploadSuccess = await uploadWithFileSystem(imageUri, presignedResult.uploadUrl, 'image/jpeg');

      if (!uploadSuccess) {
        pendingOptimisticIdsRef.current.delete(optimisticId);
        setMessages(prev => {
          const next = prev.filter(m => m.id !== optimisticId);
          messagesRef.current = next;
          return next;
        });
        showError('Error', 'Failed to upload image');
        setSending(false);
        return;
      }

      // Send message with image
      const imageUrl = presignedResult.cdnUrl || presignedResult.key;
      const { data: sentMessage, error } = await sendMessageToDb(conversationId, '', imageUrl, 'image', replyToMessage?.id);

      // Clear reply after sending
      setReplyToMessage(null);

      if (error) {
        pendingOptimisticIdsRef.current.delete(optimisticId);
        setMessages(prev => {
          const next = prev.filter(m => m.id !== optimisticId);
          messagesRef.current = next;
          return next;
        });
        showError('Error', 'Failed to send image');
      } else if (sentMessage) {
        // Replace optimistic with real message
        pendingOptimisticIdsRef.current.delete(optimisticId);
        setMessages(prev => {
          const next = prev.map(m => m.id === optimisticId ? sentMessage : m);
          messagesRef.current = next;
          return next;
        });
      } else {
        pendingOptimisticIdsRef.current.delete(optimisticId);
        // Refresh messages to pick up the server version
        loadMessages();
      }
    } catch (_error) {
      console.error('[ChatScreen] Image send failed:', _error);
      pendingOptimisticIdsRef.current.delete(optimisticId);
      setMessages(prev => {
        const next = prev.filter(m => m.id !== optimisticId);
        messagesRef.current = next;
        return next;
      });
      showError('Error', 'Failed to send image');
    } finally {
      setSending(false);
    }
  }, [conversationId, replyToMessage, sending, currentUserId, showError, loadMessages]);

  // Handle image picking and sending
  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission Required', 'Photo library access is needed to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      await handleSendImage(asset.uri);
    }
  }, [showError, handleSendImage]);

  const handleViewProfileMenu = useCallback(() => {
    setChatMenuVisible(false);
    if (otherUserProfile?.id && isValidUUID(otherUserProfile.id)) {
      navigation.navigate('UserProfile', { userId: otherUserProfile.id });
    }
  }, [otherUserProfile?.id, navigation]);
  const handleBlockUserMenu = useCallback(() => {
    setChatMenuVisible(false);
    showDestructiveConfirm(
      'Block User',
      `Block ${resolveDisplayName(otherUserProfile, 'this user')}?`,
      async () => {
        if (otherUserProfile?.id) {
          const { error } = await blockUser(otherUserProfile.id);
          if (error) {
            showError('Error', 'Failed to block user');
          } else {
            showSuccess('Blocked', `${resolveDisplayName(otherUserProfile)} has been blocked`);
            navigation.goBack();
          }
        }
      },
      'Block'
    );
  }, [otherUserProfile?.id, otherUserProfile?.full_name, showDestructiveConfirm, showError, showSuccess, navigation]);
  const handleRetry = useCallback(() => {
    setLoading(true);
    setInitError(null);
    if (userId) {
      getOrCreateConversation(userId).then(({ data, error }) => {
        if (error) {
          setInitError(error);
          setLoading(false);
        } else if (data) {
          setConversationId(data);
        }
      });
    }
  }, [userId]);

  const headerPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);
  const inputAreaPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 10 }), [insets.bottom]);
  const closeImageBtnTopStyle = useMemo(() => ({ top: insets.top + 20 }), [insets.top]);
  const voicePreviewCardTopStyle = useMemo(() => ({ paddingTop: insets.top + 16 }), [insets.top]);

  // Stable renderMessage — uses refs so it doesn't re-create on every poll
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isFromMe = item.sender_id === currentUserIdRef.current;
    const msgs = messagesRef.current;
    const prevMessage = index > 0 ? msgs[index - 1] : null;
    const showAvatar = !isFromMe && (!prevMessage || prevMessage.sender_id !== item.sender_id);

    return (
      <MessageItem
        item={item}
        isFromMe={isFromMe}
        showAvatar={showAvatar}
        goToUserProfile={goToUserProfile}
        formatTime={formatTime}
        setSelectedImage={setSelectedImage}
        styles={styles}
        onReply={handleReply}
        onReaction={handleReaction}
        onLongPress={handleMessageLongPress}
        onDelete={handleDeleteMessage}
        colors={colors}
        currentUserId={currentUserId}
      />
    );
  }, [goToUserProfile, styles, handleReply, handleReaction, handleMessageLongPress, handleDeleteMessage, colors, currentUserId]);

  const displayName = resolveDisplayName(otherUserProfile);

  // Memoized empty state — avoids re-creating on every render
  const listEmptyComponent = useMemo(() => {
    const firstName = displayName.split(' ')[0];
    return (
      <View style={styles.emptyChat}>
        <AvatarImage source={otherUserProfile?.avatar_url} size={80} />
        <Text style={styles.emptyChatName}>{displayName}</Text>
        <Text style={styles.emptyChatText}>Start a conversation with {firstName}</Text>
      </View>
    );
  }, [styles, otherUserProfile, displayName]);

  const keyExtractor = useCallback((item: Message) => item.id, []);

  // Only scroll to end when new messages arrive, not on every re-render
  const handleContentSizeChange = useCallback(() => {
    const currentCount = messagesRef.current.length;
    if (currentCount > prevMessageCountRef.current) {
      flatListRef.current?.scrollToEnd({ animated: currentCount - prevMessageCountRef.current <= 1 });
    }
    prevMessageCountRef.current = currentCount;
  }, []);

  if (loading && !conversationId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Show error state if initialization failed
  if (initError && !conversationId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, headerPaddingStyle]}>
          <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerName}>Error</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.gray} />
          <Text style={styles.errorTitle}>Unable to start conversation</Text>
          <Text style={styles.errorMessage}>Something went wrong. Please try again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, headerPaddingStyle]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.userInfo} onPress={handleGoToOtherProfile}>
          <AvatarImage source={otherUserProfile?.avatar_url} size={40} />
          <View>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName}>{displayName}</Text>
              <AccountBadge
                size={16}
                style={styles.accountBadgeMargin}
                isVerified={otherUserProfile?.is_verified}
                accountType={otherUserProfile?.account_type}
              />
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} onPress={handleOpenChatMenu}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlashList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={handleContentSizeChange}
          ListEmptyComponent={listEmptyComponent}
        />
      )}

      {/* Voice Recording Mode */}
      {isRecording ? (
        <VoiceRecorder
          onFinish={handleVoiceFinish}
          onCancel={handleStopRecording}
        />
      ) : (
        <View style={[styles.inputArea, inputAreaPaddingStyle]}>
          {/* Reply Preview */}
          {replyToMessage && (
            <View style={styles.replyPreviewContainer}>
              <View style={[styles.replyPreviewLine, { backgroundColor: colors.primary }]} />
              <View style={styles.replyPreviewContent}>
                <Text style={[styles.replyPreviewName, { color: colors.primary }]} numberOfLines={1}>
                  {replyToMessage.sender_id === currentUserId ? 'You' : resolveDisplayName(replyToMessage.sender)}
                </Text>
                <Text style={[styles.replyPreviewText, { color: colors.gray }]} numberOfLines={1}>
                  {replyToMessage.content || (replyToMessage.media_type === 'audio' ? 'Voice message' : 'Media')}
                </Text>
              </View>
              <TouchableOpacity onPress={handleCancelReply} style={styles.replyPreviewCancel}>
                <Ionicons name="close" size={20} color={colors.gray} />
              </TouchableOpacity>
            </View>
          )}

          {/* Attach Image Button */}
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handlePickImage}
            disabled={sending}
          >
            <Ionicons name="image-outline" size={24} color={sending ? colors.gray : colors.primary} />
          </TouchableOpacity>

          {/* Emoji Button */}
          <TouchableOpacity
            style={styles.emojiButton}
            onPress={toggleEmojiPicker}
          >
            <Ionicons
              name={showEmojiPicker ? "keypad" : "happy-outline"}
              size={24}
              color={showEmojiPicker ? colors.primary : colors.gray}
            />
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor={colors.gray}
              value={inputText}
              onChangeText={setInputText}
              onFocus={handleCloseEmojiPicker}
              multiline
              maxLength={1000}
            />
          </View>
          {inputText.trim() ? (
            <TouchableOpacity onPress={handleSendMessage} disabled={sending}>
              <LinearGradient colors={sending ? ['#ccc', '#ccc'] : GRADIENTS.primary} style={styles.sendButton}>
                {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.voiceButton}
              onPress={handleStartRecording}
            >
              <Ionicons name="mic" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Emoji Picker */}
      <EmojiPicker
        onEmojiSelected={handleEmojiSelect}
        open={showEmojiPicker}
        onClose={handleCloseEmojiPicker}
        expandable={false}
        theme={{
          backdrop: 'rgba(0,0,0,0.2)',
          knob: colors.primary,
          container: isDark ? '#1E1E1E' : '#FFFFFF',
          header: colors.dark,
          skinTonesContainer: isDark ? '#2A2A2A' : '#F5F5F5',
          category: {
            icon: colors.gray,
            iconActive: colors.primary,
            container: isDark ? '#2A2A2A' : '#F5F5F5',
            containerActive: 'rgba(0,230,118,0.1)',
          },
        }}
        enableSearchBar
        enableRecentlyUsed
        categoryPosition="top"
      />

      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.imageModal}>
          <TouchableOpacity style={[styles.closeImageBtn, closeImageBtnTopStyle]} onPress={handleCloseSelectedImage}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedImage && <OptimizedImage source={selectedImage} style={styles.fullImage} contentFit="contain" />}
        </View>
      </Modal>

      {/* Voice preview & confirmation */}
      <Modal
        visible={voicePreviewVisible && !!voicePreview}
        transparent
        animationType="fade"
        onRequestClose={handleCloseVoicePreview}
      >
        <View style={styles.voicePreviewOverlay}>
          <View style={[styles.voicePreviewCard, voicePreviewCardTopStyle]}>
            <Text style={styles.voicePreviewTitle}>Send voice message?</Text>
            {voicePreview && (
              <View style={styles.voicePreviewPlayer}>
                <VoiceMessage uri={voicePreview.uri} isFromMe />
              </View>
            )}
            <View style={styles.voicePreviewButtons}>
              <TouchableOpacity
                style={[styles.voicePreviewButton, styles.voicePreviewCancel]}
                onPress={handleDiscardVoice}
              >
                <Text style={styles.voicePreviewCancelText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.voicePreviewButton, styles.voicePreviewSend]}
                onPress={handleSendVoicePreview}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.voicePreviewSendText}>Send</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Message Actions Modal (Reactions + Delete) */}
      <Modal
        visible={showMessageMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMessageMenu(false)}
        >
          <View style={styles.messageMenuContainer}>
            {/* Quick Reactions */}
            <View style={styles.reactionsRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const hasReaction = selectedMessage?.reactions?.some(
                  r => r.user_id === currentUserId && r.emoji === emoji
                );
                return (
                  <TouchableOpacity
                    key={emoji}
                    style={[styles.reactionButton, hasReaction && styles.reactionButtonActive]}
                    onPress={() => {
                      if (selectedMessage) {
                        handleReaction(selectedMessage.id, emoji);
                      }
                      setShowMessageMenu(false);
                    }}
                  >
                    <Text style={styles.reactionButtonEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View style={styles.messageActionsList}>
              <TouchableOpacity
                style={styles.messageActionItem}
                onPress={() => {
                  if (selectedMessage) {
                    handleReply(selectedMessage);
                  }
                  setShowMessageMenu(false);
                }}
              >
                <Ionicons name="return-up-back" size={22} color={colors.primary} />
                <Text style={styles.messageActionText}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.messageActionItem}
                onPress={handleForwardPress}
              >
                <Ionicons name="arrow-redo-outline" size={22} color={colors.primary} />
                <Text style={styles.messageActionText}>Forward</Text>
              </TouchableOpacity>

              {selectedMessage?.sender_id === currentUserId && (
                <TouchableOpacity
                  style={styles.messageActionItem}
                  onPress={() => {
                    if (selectedMessage) {
                      handleDeleteMessage(selectedMessage);
                    }
                    setShowMessageMenu(false);
                  }}
                >
                  <Ionicons name="trash-outline" size={22} color="#FF3B30" />
                  <Text style={[styles.messageActionText, styles.messageActionTextDanger]}>Delete</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.messageActionItem, styles.messageActionItemLast]}
                onPress={() => setShowMessageMenu(false)}
              >
                <Ionicons name="close-outline" size={22} color={colors.gray} />
                <Text style={[styles.messageActionText, styles.messageActionTextCancel]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward Modal */}
      <Modal
        visible={showForwardModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForwardModal(false)}
      >
        <TouchableOpacity
          style={styles.forwardModalOverlay}
          activeOpacity={1}
          onPress={() => setShowForwardModal(false)}
        >
          <View style={styles.forwardModalContainer}>
            <View style={styles.forwardModalHeader}>
              <Text style={[styles.forwardModalTitle, { color: colors.dark }]}>Forward to...</Text>
              <TouchableOpacity onPress={() => setShowForwardModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray} />
              </TouchableOpacity>
            </View>
            
            {conversations.length === 0 ? (
              <View style={styles.forwardModalEmpty}>
                <Text style={{ color: colors.gray }}>No conversations found</Text>
              </View>
            ) : (
              <FlashList
                data={conversations}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.forwardConversationItem}
                    onPress={() => handleForwardToConversation(item.id)}
                    disabled={forwarding}
                  >
                    <AvatarImage source={item.other_user?.avatar_url} size={48} />
                    <View style={styles.forwardConversationInfo}>
                      <Text style={[styles.forwardConversationName, { color: colors.dark }]} numberOfLines={1}>
                        {resolveDisplayName(item.other_user)}
                      </Text>
                      <Text style={[styles.forwardConversationPreview, { color: colors.gray }]} numberOfLines={1}>
                        {item.last_message_preview || 'No messages'}
                      </Text>
                    </View>
                    {forwarding && (
                      <ActivityIndicator size="small" color={colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.forwardListContent}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Chat Menu Modal */}
      <Modal
        visible={chatMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseChatMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseChatMenu}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleViewProfileMenu}
            >
              <Ionicons name="person-outline" size={22} color={colors.dark} />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleBlockUserMenu}
            >
              <Ionicons name="ban-outline" size={22} color="#FF3B30" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={handleCloseChatMenu}
            >
              <Ionicons name="close-outline" size={22} color={colors.gray} />
              <Text style={[styles.menuItemText, styles.menuItemTextCancel]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  errorTitle: { fontSize: 18, fontWeight: '600', color: colors.dark, marginTop: SPACING.md, textAlign: 'center' },
  errorMessage: { fontSize: 14, color: colors.gray, marginTop: SPACING.sm, textAlign: 'center' },
  retryButton: { marginTop: SPACING.lg, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  retryButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  headerSpacer: { width: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  backButton: { padding: 4 },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
  accountBadgeMargin: { marginLeft: 4 },
  headerName: { fontSize: 16, fontWeight: '600', color: colors.dark },
  headerStatus: { fontSize: 12, color: colors.gray, marginLeft: SPACING.sm },
  headerIcon: { padding: 4 },
  messagesList: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  messageRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  messageRowLeft: { justifyContent: 'flex-start' },
  messageRowRight: { justifyContent: 'flex-end' },
  avatarSpace: { width: 32, marginRight: 8 },
  messageBubble: { maxWidth: width * 0.75, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  messageBubbleLeft: { backgroundColor: colors.backgroundSecondary, borderBottomLeftRadius: 4 },
  messageBubbleRight: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  messageBubbleNoPadding: { padding: 0, overflow: 'hidden' },
  messageText: { fontSize: 15, color: colors.dark, lineHeight: 20 },
  messageTextRight: { color: '#fff' },
  deletedMessage: { fontSize: 14, fontStyle: 'italic', color: colors.gray },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 11, color: colors.gray },
  messageTimeRight: { color: 'rgba(255,255,255,0.7)' },
  messageImage: { width: 200, height: 150, borderRadius: 12 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.grayBorder },
  inputContainer: { flex: 1, backgroundColor: isDark ? 'rgba(50,50,50,1)' : '#F5F5F5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 120 },
  textInput: { fontSize: 16, color: colors.dark, minHeight: 40, maxHeight: 100, paddingTop: Platform.OS === 'ios' ? 10 : 8 },
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  voiceButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? 'rgba(50,50,50,1)' : '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  emojiButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyChatName: { fontSize: 18, fontWeight: '600', color: colors.dark, marginTop: SPACING.md },
  emptyChatText: { fontSize: 14, color: colors.gray, marginTop: SPACING.sm, textAlign: 'center' },
  imageModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', right: 20, zIndex: 10 },
  fullImage: { width: width, height: width },
  voicePreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: SPACING.lg },
  voicePreviewCard: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, alignItems: 'stretch' },
  voicePreviewTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: SPACING.md, textAlign: 'center' },
  voicePreviewPlayer: { marginBottom: SPACING.md },
  voicePreviewButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.sm },
  voicePreviewButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  voicePreviewCancel: { backgroundColor: '#F5F5F5' },
  voicePreviewSend: { backgroundColor: '#0EBF8A' },
  voicePreviewCancelText: { color: '#333', fontWeight: '600' },
  voicePreviewSendText: { color: '#fff', fontWeight: '700' },
  // Chat Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: colors.backgroundSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: SPACING.md, paddingBottom: 34 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { fontSize: 16, fontWeight: '500', color: colors.dark, marginLeft: SPACING.md },
  menuItemTextDanger: { color: '#FF3B30' },
  menuItemTextCancel: { color: colors.gray },
  // Swipe to Reply
  swipeableContainer: { overflow: 'hidden' },
  replyActionContainer: { justifyContent: 'center', alignItems: 'flex-start', marginLeft: 10, width: 60 },
  replyActionContainerLeft: { justifyContent: 'center', alignItems: 'flex-end', marginRight: 10, width: 60 },
  replyAction: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  // Reply Preview in Input
  replyPreviewContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderRadius: 12, marginBottom: 8, marginHorizontal: 4 },
  replyPreviewLine: { width: 3, height: 36, borderRadius: 2, marginRight: 10 },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  replyPreviewText: { fontSize: 13 },
  replyPreviewCancel: { padding: 4 },
  // Reply Preview inside Message Bubble
  messageBubbleWithReply: { paddingTop: 8 },
  replyPreview: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3 },
  replyFromMe: { backgroundColor: 'rgba(255,255,255,0.15)' },
  replyFromOther: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
  replyName: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  replyText: { fontSize: 12 },
  // Message Row Container (for reactions positioning)
  messageRowContainer: { marginBottom: 4 },
  // Reactions on messages
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, marginHorizontal: SPACING.md },
  reactionsLeft: { marginLeft: 40 },
  reactionsRight: { justifyContent: 'flex-end', marginRight: 8 },
  reactionBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#2A2A2A' : '#F0F0F0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 4, borderWidth: 1, borderColor: isDark ? '#3A3A3A' : '#E0E0E0' },
  reactionBubbleActive: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  // Message Actions Menu
  messageMenuContainer: { backgroundColor: colors.backgroundSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: SPACING.lg, paddingBottom: 34 },
  reactionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  reactionButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? '#2A2A2A' : '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  reactionButtonActive: { backgroundColor: colors.primary + '20' },
  reactionButtonEmoji: { fontSize: 24 },
  messageActionsList: { paddingTop: SPACING.md },
  messageActionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  messageActionItemLast: { borderBottomWidth: 0 },
  messageActionText: { fontSize: 16, fontWeight: '500', color: colors.dark, marginLeft: SPACING.md },
  messageActionTextDanger: { color: '#FF3B30' },
  messageActionTextCancel: { color: colors.gray },
  // Read Receipts
  readReceiptContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  // Attach Button
  attachButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  // Forward Modal
  forwardModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  forwardModalContainer: { backgroundColor: colors.backgroundSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 34 },
  forwardModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  forwardModalTitle: { fontSize: 18, fontWeight: '600' },
  forwardModalEmpty: { paddingVertical: SPACING.xl, alignItems: 'center' },
  forwardListContent: { paddingBottom: 20 },
  forwardConversationItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  forwardConversationInfo: { flex: 1, marginLeft: SPACING.md },
  forwardConversationName: { fontSize: 16, fontWeight: '500' },
  forwardConversationPreview: { fontSize: 13, marginTop: 2 },
});
