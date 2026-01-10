import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAudioRecorder, useAudioPlayer, AudioModule } from 'expo-audio';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

const { width } = Dimensions.get('window');

// Sample messages
const SAMPLE_MESSAGES = [
  {
    id: 1,
    type: 'text',
    content: 'Hey! How was your workout today?',
    time: '10:30 AM',
    isFromMe: false,
  },
  {
    id: 2,
    type: 'text',
    content: 'It was great! Did a full HIIT session 💪',
    time: '10:32 AM',
    isFromMe: true,
    status: 'read',
  },
  {
    id: 3,
    type: 'image',
    content: 'https://picsum.photos/400/300?random=20',
    caption: 'Check out this new gym!',
    time: '10:35 AM',
    isFromMe: false,
  },
  {
    id: 4,
    type: 'text',
    content: 'Wow that looks amazing! Where is it?',
    time: '10:36 AM',
    isFromMe: true,
    status: 'read',
  },
  {
    id: 5,
    type: 'voice',
    content: null,
    duration: '0:32',
    time: '10:38 AM',
    isFromMe: false,
  },
  {
    id: 6,
    type: 'text',
    content: "Oh nice! I'll definitely check it out this weekend",
    time: '10:40 AM',
    isFromMe: true,
    status: 'read',
  },
  {
    id: 7,
    type: 'link',
    content: 'https://smuppy.com/workout/hiit-30min',
    preview: {
      title: '30-Min HIIT Workout',
      description: 'High intensity interval training for all levels',
      image: 'https://picsum.photos/200/100?random=21',
    },
    time: '10:42 AM',
    isFromMe: false,
  },
  {
    id: 8,
    type: 'text',
    content: 'Are you coming to the gym today? 🏋️',
    time: '10:50 AM',
    isFromMe: false,
  },
];

export default function ChatScreen({ route, navigation }) {
  const { conversation } = route.params;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef(null);
  
  const [messages, setMessages] = useState(SAMPLE_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [playingVoiceId, setPlayingVoiceId] = useState(null);
  const [currentPlayingUri, setCurrentPlayingUri] = useState(null);
  
  const recordingTimer = useRef(null);
  const recordingAnim = useRef(new Animated.Value(1)).current;

  // Audio recorder hook
  const audioRecorder = useAudioRecorder({
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  });

  // Audio player hook
  const player = useAudioPlayer(currentPlayingUri);

  // Navigate to user profile
  const goToUserProfile = (userId) => {
    navigation.navigate('UserProfile', { userId });
  };

  // Request permissions on mount
  useEffect(() => {
    requestPermissions();
    return () => {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, []);

  // Recording animation
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      recordingAnim.stopAnimation();
      recordingAnim.setValue(1);
    }
  }, [isRecording]);

  // Handle player status changes
  useEffect(() => {
    if (player && playingVoiceId) {
      if (player.currentTime >= player.duration && player.duration > 0) {
        setPlayingVoiceId(null);
        setCurrentPlayingUri(null);
      }
    }
  }, [player?.currentTime, player?.duration]);

  // Request audio permissions
  const requestPermissions = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to send voice messages.');
      }
    } catch (error) {
      // Permission error handled silently
    }
  };

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start recording
  const startRecording = async () => {
    try {
      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      Alert.alert('Error', 'Could not start recording. Please check microphone permissions.');
    }
  };

  // Stop recording and send
  const stopRecording = async () => {
    try {
      clearInterval(recordingTimer.current);
      
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      
      setIsRecording(false);

      if (recordingDuration >= 1 && uri) {
        const newMessage = {
          id: Date.now(),
          type: 'voice',
          content: uri,
          duration: formatDuration(recordingDuration),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isFromMe: true,
          status: 'sent',
        };
        setMessages([...messages, newMessage]);
      }

      setRecordingDuration(0);

    } catch (error) {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  // Cancel recording
  const cancelRecording = async () => {
    try {
      clearInterval(recordingTimer.current);
      await audioRecorder.stop();
      setIsRecording(false);
      setRecordingDuration(0);
    } catch (error) {
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  // Play voice message
  const playVoiceMessage = async (messageId, uri) => {
    try {
      if (playingVoiceId === messageId) {
        player.pause();
        setPlayingVoiceId(null);
        setCurrentPlayingUri(null);
        return;
      }

      setCurrentPlayingUri(uri);
      setPlayingVoiceId(messageId);
      
      setTimeout(() => {
        player?.play();
      }, 100);

    } catch (error) {
      // Voice playback error handled silently
    }
  };

  // Send text message
  const sendMessage = () => {
    if (inputText.trim()) {
      const newMessage = {
        id: Date.now(),
        type: 'text',
        content: inputText.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isFromMe: true,
        status: 'sent',
      };
      setMessages([...messages, newMessage]);
      setInputText('');
    }
  };

  // Render message item
  const renderMessage = ({ item, index }) => {
    const isFromMe = item.isFromMe;
    const showAvatar = !isFromMe && (index === 0 || messages[index - 1]?.isFromMe);

    return (
      <View style={[
        styles.messageRow,
        isFromMe ? styles.messageRowRight : styles.messageRowLeft
      ]}>
        {/* Avatar */}
        {!isFromMe && (
          <TouchableOpacity 
            style={styles.avatarSpace}
            onPress={() => goToUserProfile(conversation.user.id)}
          >
            {showAvatar && (
              <Image source={{ uri: conversation.user.avatar }} style={styles.messageAvatar} />
            )}
          </TouchableOpacity>
        )}

        {/* Message Bubble */}
        <View style={[
          styles.messageBubble,
          isFromMe ? styles.messageBubbleRight : styles.messageBubbleLeft
        ]}>
          {/* Text Message */}
          {item.type === 'text' && (
            <Text style={[
              styles.messageText,
              isFromMe && styles.messageTextRight
            ]}>
              {item.content}
            </Text>
          )}

          {/* Image Message */}
          {item.type === 'image' && (
            <TouchableOpacity onPress={() => setSelectedImage(item.content)}>
              <Image source={{ uri: item.content }} style={styles.messageImage} />
              {item.caption && (
                <Text style={[styles.messageText, isFromMe && styles.messageTextRight, { marginTop: 8 }]}>
                  {item.caption}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Voice Message */}
          {item.type === 'voice' && (
            <TouchableOpacity 
              style={styles.voiceMessage}
              onPress={() => item.content && playVoiceMessage(item.id, item.content)}
            >
              <View style={[styles.voicePlayBtn, isFromMe && styles.voicePlayBtnRight]}>
                <Ionicons 
                  name={playingVoiceId === item.id ? 'pause' : 'play'} 
                  size={20} 
                  color={isFromMe ? '#fff' : COLORS.primary} 
                />
              </View>
              <View style={styles.voiceWaveform}>
                {[...Array(20)].map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveBar,
                      { 
                        height: Math.random() * 20 + 5,
                        backgroundColor: isFromMe ? 'rgba(255,255,255,0.6)' : COLORS.grayLight
                      }
                    ]} 
                  />
                ))}
              </View>
              <Text style={[styles.voiceDuration, isFromMe && { color: 'rgba(255,255,255,0.8)' }]}>
                {item.duration}
              </Text>
            </TouchableOpacity>
          )}

          {/* Link Message */}
          {item.type === 'link' && (
            <TouchableOpacity style={styles.linkContainer}>
              {item.preview?.image && (
                <Image source={{ uri: item.preview.image }} style={styles.linkImage} />
              )}
              <View style={styles.linkInfo}>
                <Text style={[styles.linkTitle, isFromMe && { color: '#fff' }]} numberOfLines={1}>
                  {item.preview?.title}
                </Text>
                <Text style={[styles.linkDescription, isFromMe && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={2}>
                  {item.preview?.description}
                </Text>
                <Text style={[styles.linkUrl, isFromMe && { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>
                  {item.content}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Time & Status */}
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isFromMe && styles.messageTimeRight]}>
              {item.time}
            </Text>
            {isFromMe && item.status && (
              <Ionicons 
                name={item.status === 'read' ? 'checkmark-done' : 'checkmark'} 
                size={14} 
                color={item.status === 'read' ? '#4CAF50' : 'rgba(255,255,255,0.6)'} 
                style={{ marginLeft: 4 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.userInfo}
          onPress={() => goToUserProfile(conversation.user.id)}
        >
          <Image source={{ uri: conversation.user.avatar }} style={styles.headerAvatar} />
          <View>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName}>{conversation.user.name}</Text>
              {conversation.user.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.headerStatus}>
              {conversation.user.isOnline ? 'Online' : 'Last seen recently'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerIcon}>
          <Ionicons name="ellipsis-vertical" size={22} color={COLORS.dark} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />

      {/* Input Area */}
      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 10 }]}>
        {isRecording ? (
          <View style={styles.recordingContainer}>
            <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecordBtn}>
              <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
            </TouchableOpacity>
            
            <View style={styles.recordingInfo}>
              <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordingAnim }] }]} />
              <Text style={styles.recordingTime}>{formatDuration(recordingDuration)}</Text>
              <Text style={styles.recordingText}>Recording...</Text>
            </View>

            <TouchableOpacity onPress={stopRecording}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.sendButton}>
                <Ionicons name="send" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder="Message..."
                placeholderTextColor={COLORS.gray}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={1000}
              />
            </View>

            {inputText.trim() ? (
              <TouchableOpacity onPress={sendMessage}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.sendButton}>
                  <Ionicons name="send" size={20} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.voiceButton}
                onPress={startRecording}
              >
                <Ionicons name="mic" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Image Preview Modal */}
      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.imageModal}>
          <TouchableOpacity 
            style={[styles.closeImageBtn, { top: insets.top + 20 }]}
            onPress={() => setSelectedImage(null)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedImage && (
            <Image 
              source={{ uri: selectedImage }} 
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 4,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  headerStatus: {
    fontSize: 12,
    color: COLORS.gray,
    marginLeft: SPACING.sm,
  },
  headerIcon: {
    padding: 4,
  },
  messagesList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarSpace: {
    width: 32,
    marginRight: 8,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  messageBubbleLeft: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 4,
  },
  messageBubbleRight: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: COLORS.dark,
    lineHeight: 20,
  },
  messageTextRight: {
    color: '#fff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    color: COLORS.gray,
  },
  messageTimeRight: {
    color: 'rgba(255,255,255,0.7)',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 12,
  },
  voiceMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
  },
  voicePlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voicePlayBtnRight: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
    height: 30,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 1,
  },
  voiceDuration: {
    fontSize: 12,
    color: COLORS.gray,
  },
  linkContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  linkImage: {
    width: '100%',
    height: 80,
  },
  linkInfo: {
    padding: 10,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
  },
  linkDescription: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  linkUrl: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 4,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 120,
  },
  textInput: {
    fontSize: 16,
    color: COLORS.dark,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  recordingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelRecordBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFE5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF6B6B',
    marginRight: 8,
  },
  recordingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  imageModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeImageBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: width,
    height: width,
  },
});