import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import EmojiPicker from 'rn-emoji-keyboard';
import { AccountBadge } from '../../components/Badge';
import VoiceRecorder from '../../components/VoiceRecorder';
import VoiceMessage from '../../components/VoiceMessage';
import SharedPostBubble from '../../components/SharedPostBubble';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
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

const { width } = Dimensions.get('window');

interface ChatScreenProps {
  route: {
    params: {
      conversationId?: string | null;
      otherUser?: Profile | null;
      userId?: string;
    };
  };
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    setOptions: (options: Record<string, unknown>) => void;
  };
}

export default function ChatScreen({ route, navigation }: ChatScreenProps) {
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();
  const { conversationId: initialConversationId, otherUser, userId } = route.params;
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
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

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
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  // Track initialization error
  const [initError, setInitError] = useState<string | null>(null);

  // Load or create conversation
  useEffect(() => {
    const initConversation = async () => {
      setInitError(null);
      if (initialConversationId) {
        setConversationId(initialConversationId);
      } else if (userId) {
        const { data, error } = await getOrCreateConversation(userId);
        if (error) {
          console.error('[ChatScreen] Failed to create conversation:', error);
          setInitError(error);
          setLoading(false);
        } else if (data) {
          setConversationId(data);
        } else {
          setInitError('Failed to initialize conversation');
          setLoading(false);
        }
      } else {
        setInitError('No conversation or user specified');
        setLoading(false);
      }
    };
    initConversation();
  }, [initialConversationId, userId]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await getMessages(conversationId, 0, 100);
    if (!error && data) {
      setMessages(data);
      markConversationAsRead(conversationId);
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
    const POLL_INTERVAL_MS = 3000;
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

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

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
    setMessages(prev => [...prev, optimisticMessage]);

    const { error } = await sendMessageToDb(conversationId, messageText);

    if (error) {
      // Remove optimistic message and restore input
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      showError('Error', 'Failed to send message. Please try again.');
      setInputText(messageText);
    }
    setSending(false);
  }, [conversationId, inputText, sending, currentUserId]);

  // Handle voice message send
  const handleVoiceSend = useCallback(async (uri: string, duration: number) => {
    if (!conversationId) return;

    setIsRecording(false);
    setSending(true);

    // Upload voice message
    const { data: voiceUrl, error: uploadError } = await uploadVoiceMessage(uri, conversationId);

    if (uploadError || !voiceUrl) {
      showError('Error', 'Failed to upload voice message');
      setSending(false);
      return;
    }

    // Send message with audio URL
    const { error } = await sendMessageToDb(
      conversationId,
      `Voice message (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
      voiceUrl,
      'audio'
    );

    if (error) {
      showError('Error', 'Failed to send voice message');
    }
    setSending(false);
  }, [conversationId]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isFromMe = item.sender_id === currentUserId;
    const showAvatar = !isFromMe && (index === 0 || messages[index - 1]?.sender_id === currentUserId);

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
          // Remove padding for special message types
          (item.shared_post_id || item.media_type === 'audio') && styles.messageBubbleNoPadding
        ]}>
          {item.is_deleted ? (
            <Text style={[styles.deletedMessage, isFromMe && { color: 'rgba(255,255,255,0.6)' }]}>Message deleted</Text>
          ) : (
            <>
              {/* Shared Post */}
              {item.shared_post_id && (
                <SharedPostBubble postId={item.shared_post_id} isFromMe={isFromMe} />
              )}

              {/* Voice Message */}
              {item.media_type === 'audio' && item.media_url && (
                <VoiceMessage uri={item.media_url} isFromMe={isFromMe} />
              )}

              {/* Regular Text Message */}
              {!item.shared_post_id && item.media_type !== 'audio' && item.content && (
                <Text style={[styles.messageText, isFromMe && styles.messageTextRight]}>{item.content}</Text>
              )}

              {/* Image Message */}
              {item.media_url && item.media_type === 'image' && (
                <TouchableOpacity onPress={() => setSelectedImage(item.media_url || null)}>
                  <OptimizedImage source={item.media_url} style={styles.messageImage} />
                </TouchableOpacity>
              )}
            </>
          )}
          {/* Footer - hide for special types that have their own styling */}
          {!item.shared_post_id && item.media_type !== 'audio' && (
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isFromMe && styles.messageTimeRight]}>{formatTime(item.created_at)}</Text>
              {isFromMe && <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />}
            </View>
          )}
        </View>
      </View>
    );
  }, [currentUserId, messages, goToUserProfile, formatTime]);

  const displayName = otherUserProfile?.full_name || otherUserProfile?.username || 'User';

  if (loading && !conversationId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Show error state if initialization failed
  if (initError && !conversationId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.headerName}>Error</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.gray} />
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
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
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
            {otherUserProfile?.username && (
              <Text style={styles.headerStatus}>@{otherUserProfile.username}</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} onPress={() => setChatMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color={COLORS.dark} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlashList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={() => (
            <View style={styles.emptyChat}>
              <AvatarImage source={otherUserProfile?.avatar_url} size={80} />
              <Text style={styles.emptyChatName}>{displayName}</Text>
              <Text style={styles.emptyChatText}>Start a conversation with {otherUserProfile?.full_name?.split(' ')[0] || displayName}</Text>
            </View>
          )}
        />
      )}

      {/* Voice Recording Mode */}
      {isRecording ? (
        <VoiceRecorder
          onSend={handleVoiceSend}
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
              color={showEmojiPicker ? COLORS.primary : COLORS.gray}
            />
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Message..."
              placeholderTextColor={COLORS.gray}
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
              <Ionicons name="mic" size={24} color={COLORS.primary} />
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
          knob: COLORS.primary,
          container: '#FFFFFF',
          header: COLORS.dark,
          skinTonesContainer: '#F5F5F5',
          category: {
            icon: COLORS.gray,
            iconActive: COLORS.primary,
            container: '#F5F5F5',
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
              <Ionicons name="person-outline" size={22} color={COLORS.dark} />
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
              <Ionicons name="close-outline" size={22} color={COLORS.gray} />
              <Text style={[styles.menuItemText, { color: COLORS.gray }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  errorTitle: { fontSize: 18, fontWeight: '600', color: COLORS.dark, marginTop: SPACING.md, textAlign: 'center' },
  errorMessage: { fontSize: 14, color: COLORS.gray, marginTop: SPACING.sm, textAlign: 'center' },
  retryButton: { marginTop: SPACING.lg, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  retryButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backButton: { padding: 4 },
  userInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', marginLeft: SPACING.sm },
  headerName: { fontSize: 16, fontWeight: '600', color: COLORS.dark },
  headerStatus: { fontSize: 12, color: COLORS.gray, marginLeft: SPACING.sm },
  headerIcon: { padding: 4 },
  messagesList: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  messageRow: { flexDirection: 'row', marginBottom: SPACING.sm },
  messageRowLeft: { justifyContent: 'flex-start' },
  messageRowRight: { justifyContent: 'flex-end' },
  avatarSpace: { width: 32, marginRight: 8 },
  messageBubble: { maxWidth: width * 0.75, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  messageBubbleLeft: { backgroundColor: COLORS.white, borderBottomLeftRadius: 4 },
  messageBubbleRight: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  messageBubbleNoPadding: { padding: 0, overflow: 'hidden' },
  messageText: { fontSize: 15, color: COLORS.dark, lineHeight: 20 },
  messageTextRight: { color: '#fff' },
  deletedMessage: { fontSize: 14, fontStyle: 'italic', color: COLORS.gray },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 11, color: COLORS.gray },
  messageTimeRight: { color: 'rgba(255,255,255,0.7)' },
  messageImage: { width: 200, height: 150, borderRadius: 12 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  inputContainer: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 120 },
  textInput: { fontSize: 16, color: COLORS.dark, minHeight: 40, maxHeight: 100, paddingTop: Platform.OS === 'ios' ? 10 : 8 },
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  voiceButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  emojiButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyChatName: { fontSize: 18, fontWeight: '600', color: COLORS.dark, marginTop: SPACING.md },
  emptyChatText: { fontSize: 14, color: COLORS.gray, marginTop: SPACING.sm, textAlign: 'center' },
  imageModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', right: 20, zIndex: 10 },
  fullImage: { width: width, height: width },
  // Chat Menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuContainer: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: SPACING.md, paddingBottom: 34 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { fontSize: 16, fontWeight: '500', color: COLORS.dark, marginLeft: SPACING.md },
});
