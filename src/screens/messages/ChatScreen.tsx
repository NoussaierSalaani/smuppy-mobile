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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { VerifiedBadge } from '../../components/Badge';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import {
  getMessages,
  sendMessage as sendMessageToDb,
  markConversationAsRead,
  subscribeToMessages,
  getOrCreateConversation,
  getCurrentUserId,
  Message,
  Profile,
} from '../../services/database';

const { width } = Dimensions.get('window');

export default function ChatScreen({ route, navigation }) {
  const { conversationId: initialConversationId, otherUser, userId } = route.params;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [otherUserProfile] = useState<Profile | null>(otherUser || null);

  // Get current user ID
  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId);
  }, []);

  // Load or create conversation
  useEffect(() => {
    const initConversation = async () => {
      if (initialConversationId) {
        setConversationId(initialConversationId);
      } else if (userId) {
        const { data, error } = await getOrCreateConversation(userId);
        if (!error && data) {
          setConversationId(data);
        }
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

  // Subscribe to new messages
  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = subscribeToMessages(conversationId, (newMessage) => {
      setMessages(prev => [...prev, newMessage]);
      if (newMessage.sender_id !== currentUserId) {
        markConversationAsRead(conversationId);
      }
    });
    return unsubscribe;
  }, [conversationId, currentUserId]);

  const goToUserProfile = (profileUserId: string) => {
    navigation.navigate('UserProfile', { userId: profileUserId });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !conversationId || sending) return;
    const messageText = inputText.trim();
    setInputText('');
    setSending(true);
    const { error } = await sendMessageToDb(conversationId, messageText);
    if (error) {
      Alert.alert('Error', 'Failed to send message');
      setInputText(messageText);
    }
    setSending(false);
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isFromMe = item.sender_id === currentUserId;
    const showAvatar = !isFromMe && (index === 0 || messages[index - 1]?.sender_id === currentUserId);

    return (
      <View style={[styles.messageRow, isFromMe ? styles.messageRowRight : styles.messageRowLeft]}>
        {!isFromMe && (
          <TouchableOpacity style={styles.avatarSpace} onPress={() => item.sender?.id && goToUserProfile(item.sender.id)}>
            {showAvatar && item.sender && <AvatarImage source={item.sender.avatar_url} size={28} />}
          </TouchableOpacity>
        )}
        <View style={[styles.messageBubble, isFromMe ? styles.messageBubbleRight : styles.messageBubbleLeft]}>
          {item.is_deleted ? (
            <Text style={[styles.deletedMessage, isFromMe && { color: 'rgba(255,255,255,0.6)' }]}>Message deleted</Text>
          ) : (
            <>
              {item.content && <Text style={[styles.messageText, isFromMe && styles.messageTextRight]}>{item.content}</Text>}
              {item.media_url && item.media_type === 'image' && (
                <TouchableOpacity onPress={() => setSelectedImage(item.media_url || null)}>
                  <OptimizedImage source={item.media_url} style={styles.messageImage} />
                </TouchableOpacity>
              )}
            </>
          )}
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isFromMe && styles.messageTimeRight]}>{formatTime(item.created_at)}</Text>
            {isFromMe && <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />}
          </View>
        </View>
      </View>
    );
  };

  const displayName = otherUserProfile?.full_name || otherUserProfile?.username || 'User';
  const isVerified = otherUserProfile?.is_verified || false;

  if (loading && !conversationId) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
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
              {isVerified && <VerifiedBadge size={16} style={{ marginLeft: 4 }} />}
            </View>
            <Text style={styles.headerStatus}>Online</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon}>
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

      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.inputContainer}>
          <TextInput style={styles.textInput} placeholder="Message..." placeholderTextColor={COLORS.gray} value={inputText} onChangeText={setInputText} multiline maxLength={1000} />
        </View>
        {inputText.trim() ? (
          <TouchableOpacity onPress={handleSendMessage} disabled={sending}>
            <LinearGradient colors={sending ? ['#ccc', '#ccc'] : GRADIENTS.primary} style={styles.sendButton}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.voiceButton}>
            <Ionicons name="mic" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.imageModal}>
          <TouchableOpacity style={[styles.closeImageBtn, { top: insets.top + 20 }]} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedImage && <OptimizedImage source={selectedImage} style={styles.fullImage} contentFit="contain" />}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  messageText: { fontSize: 15, color: COLORS.dark, lineHeight: 20 },
  messageTextRight: { color: '#fff' },
  deletedMessage: { fontSize: 14, fontStyle: 'italic', color: COLORS.gray },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 11, color: COLORS.gray },
  messageTimeRight: { color: 'rgba(255,255,255,0.7)' },
  messageImage: { width: 200, height: 150, borderRadius: 12 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  inputContainer: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, maxHeight: 120 },
  textInput: { fontSize: 16, color: COLORS.dark, maxHeight: 100 },
  sendButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  voiceButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyChatName: { fontSize: 18, fontWeight: '600', color: COLORS.dark, marginTop: SPACING.md },
  emptyChatText: { fontSize: 14, color: COLORS.gray, marginTop: SPACING.sm, textAlign: 'center' },
  imageModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImageBtn: { position: 'absolute', right: 20, zIndex: 10 },
  fullImage: { width: width, height: width },
});
