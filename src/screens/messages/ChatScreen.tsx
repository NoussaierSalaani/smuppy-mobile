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
} from 'react-native';
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
import { useAppStore } from '../../stores';
import {
  getMessages,
  sendMessage as sendMessageToDb,
  uploadVoiceMessage,
  markConversationAsRead,
  getOrCreateConversation,
  getCurrentUserId,
  blockUser,
  Message,
  Profile,
} from '../../services/database';
import * as FileSystem from 'expo-file-system/legacy';
import { formatTime } from '../../utils/dateFormatters';

const { width } = Dimensions.get('window');

interface MessageItemProps {
  item: Message;
  isFromMe: boolean;
  showAvatar: boolean;
  goToUserProfile: (userId: string) => void;
  formatTime: (dateString: string) => string;
  setSelectedImage: (uri: string | null) => void;
  styles: ReturnType<typeof createStyles>;
}

const MessageItem = memo(({ item, isFromMe, showAvatar, goToUserProfile, formatTime, setSelectedImage, styles }: MessageItemProps) => {
  return (
    <View style={[styles.messageRow, isFromMe ? styles.messageRowRight : styles.messageRowLeft]}>
      {!isFromMe && (
        <TouchableOpacity style={styles.avatarSpace} onPress={() => item.sender?.id && goToUserProfile(item.sender.id)}>
          {showAvatar && item.sender && <AvatarImage source={item.sender.avatar_url} size={28} />}
        </TouchableOpacity>
      )}
      <View style={[
        styles.messageBubble,
        isFromMe ? styles.messageBubbleRight : styles.messageBubbleLeft,
        (item.shared_post_id || (item.media_type === 'audio' && item.media_url)) && styles.messageBubbleNoPadding
      ]}>
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
            {isFromMe && <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />}
          </View>
        )}
      </View>
    </View>
  );
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.is_deleted === next.item.is_deleted &&
  prev.item.content === next.item.content &&
  prev.isFromMe === next.isFromMe &&
  prev.showAvatar === next.showAvatar &&
  prev.styles === next.styles
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
    });
    return () => { mounted = false; };
  }, []);

  // Track initialization error
  const [initError, setInitError] = useState<string | null>(null);

  // Load or create conversation
  useEffect(() => {
    let mounted = true;
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
    return () => { mounted = false; };
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
        merged.some((msg, i) => msg.id !== prev[i]?.id || msg.is_deleted !== prev[i]?.is_deleted || msg.content !== prev[i]?.content);
      if (changed) {
        messagesRef.current = merged;
        setMessages(merged);
        // Mark as read only once on first load, not every poll
        if (!hasMarkedReadRef.current) {
          hasMarkedReadRef.current = true;
          markConversationAsRead(conversationId);
          // Decrement the global unread messages badge
          if (routeUnreadCount && routeUnreadCount > 0) {
            useAppStore.getState().setUnreadMessages((prev) => Math.max(0, prev - routeUnreadCount));
          }
        }
      }
    }
    setLoading(false);
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
    navigation.navigate('UserProfile', { userId: profileUserId });
  }, [navigation]);

  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return;

    if (!conversationId) {
      showError('Error', 'Conversation not initialized. Please go back and try again.');
      return;
    }

    if (sending) return;

    const messageText = inputText.trim();
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
    };
    pendingOptimisticIdsRef.current.add(optimisticId);
    setMessages(prev => {
      const next = [...prev, optimisticMessage];
      messagesRef.current = next;
      return next;
    });

    const { data: sentMessage, error } = await sendMessageToDb(conversationId, messageText);

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
  }, [conversationId, inputText, sending, currentUserId]);

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
      'audio'
    );

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
  }, [conversationId, currentUserId]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
      />
    );
  }, [goToUserProfile, styles]);

  const displayName = resolveDisplayName(otherUserProfile);

  // Memoized empty state — avoids re-creating on every render
  const listEmptyComponent = useMemo(() => (
    <View style={styles.emptyChat}>
      <AvatarImage source={otherUserProfile?.avatar_url} size={80} />
      <Text style={styles.emptyChatName}>{resolveDisplayName(otherUserProfile)}</Text>
      <Text style={styles.emptyChatText}>Start a conversation with {otherUserProfile?.full_name?.split(' ')[0] || resolveDisplayName(otherUserProfile)}</Text>
    </View>
  ), [styles, otherUserProfile?.avatar_url, otherUserProfile?.full_name]);

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
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerName}>Error</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.gray} />
          <Text style={styles.errorTitle}>Unable to start conversation</Text>
          <Text style={styles.errorMessage}>{initError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setInitError(null);
              // Re-trigger the effect by clearing and setting userId
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
            }}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.userInfo} onPress={() => otherUserProfile?.id && goToUserProfile(otherUserProfile.id)}>
          <AvatarImage source={otherUserProfile?.avatar_url} size={40} />
          <View>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName}>{displayName}</Text>
              <AccountBadge
                size={16}
                style={{ marginLeft: 4 }}
                isVerified={otherUserProfile?.is_verified}
                accountType={otherUserProfile?.account_type}
              />
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} onPress={() => setChatMenuVisible(true)}>
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
          onFinish={(uri, duration) => {
            setIsRecording(false);
            setVoicePreview({ uri, duration });
            setVoicePreviewVisible(true);
          }}
          onCancel={() => setIsRecording(false)}
        />
      ) : (
        <View style={[styles.inputArea, { paddingBottom: insets.bottom + 10 }]}>
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
              onFocus={() => setShowEmojiPicker(false)}
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
              onPress={() => setIsRecording(true)}
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
        onClose={() => setShowEmojiPicker(false)}
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
          <TouchableOpacity style={[styles.closeImageBtn, { top: insets.top + 20 }]} onPress={() => setSelectedImage(null)}>
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
        onRequestClose={() => {
          setVoicePreviewVisible(false);
          setVoicePreview(null);
        }}
      >
        <View style={styles.voicePreviewOverlay}>
          <View style={[styles.voicePreviewCard, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.voicePreviewTitle}>Send voice message?</Text>
            {voicePreview && (
              <View style={styles.voicePreviewPlayer}>
                <VoiceMessage uri={voicePreview.uri} isFromMe />
              </View>
            )}
            <View style={styles.voicePreviewButtons}>
              <TouchableOpacity
                style={[styles.voicePreviewButton, styles.voicePreviewCancel]}
                onPress={async () => {
                  setVoicePreviewVisible(false);
                  if (voicePreview?.uri) {
                    try { await FileSystem.deleteAsync(voicePreview.uri, { idempotent: true }); } catch { /* cleanup best-effort */ }
                  }
                  setVoicePreview(null);
                }}
              >
                <Text style={styles.voicePreviewCancelText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.voicePreviewButton, styles.voicePreviewSend]}
                onPress={() => voicePreview && handleVoiceSend(voicePreview.uri, voicePreview.duration)}
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

      {/* Chat Menu Modal */}
      <Modal
        visible={chatMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChatMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setChatMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setChatMenuVisible(false);
                if (otherUserProfile?.id) {
                  navigation.navigate('UserProfile', { userId: otherUserProfile.id });
                }
              }}
            >
              <Ionicons name="person-outline" size={22} color={colors.dark} />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setChatMenuVisible(false);
                showDestructiveConfirm(
                  'Block User',
                  `Block ${otherUserProfile?.full_name || 'this user'}?`,
                  async () => {
                    if (otherUserProfile?.id) {
                      const { error } = await blockUser(otherUserProfile.id);
                      if (error) {
                        showError('Error', 'Failed to block user');
                      } else {
                        showSuccess('Blocked', `${otherUserProfile.full_name || 'User'} has been blocked`);
                        navigation.goBack();
                      }
                    }
                  },
                  'Block'
                );
              }}
            >
              <Ionicons name="ban-outline" size={22} color="#FF3B30" />
              <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Block User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => setChatMenuVisible(false)}
            >
              <Ionicons name="close-outline" size={22} color={colors.gray} />
              <Text style={[styles.menuItemText, { color: colors.gray }]}>Cancel</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: colors.grayBorder },
  backButton: { padding: 4 },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
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
});
