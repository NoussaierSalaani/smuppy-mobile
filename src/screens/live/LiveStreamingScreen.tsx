// src/screens/live/LiveStreamingScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
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
import { COLORS, GRADIENTS } from '../../config/theme';

const { width, height } = Dimensions.get('window');

interface Comment {
  id: string;
  user: string;
  avatar: string;
  message: string;
  isNew?: boolean;
}

// Mock comments for demo
const MOCK_COMMENTS: Comment[] = [
  { id: '1', user: 'Cooper, Kristin', avatar: 'https://i.pravatar.cc/100?img=1', message: "You've got to commission this man." },
  { id: '2', user: 'Miles, Esther', avatar: 'https://i.pravatar.cc/100?img=2', message: "Seems like I'm still a beginner, cause what!! This is huge." },
  { id: '3', user: 'Henry, Arthur', avatar: 'https://i.pravatar.cc/100?img=3', message: "You've got to commission this man." },
];

export default function LiveStreamingScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const { title = 'Live Session', audience = 'public' } = route.params || {};

  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [newComment, setNewComment] = useState('');
  const [viewerCount, setViewerCount] = useState(187);
  const [duration, setDuration] = useState(0);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const fadeAnims = useRef<{ [key: string]: Animated.Value }>({}).current;

  // Timer for duration
  useEffect(() => {
    const timer = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulate new viewers joining
  useEffect(() => {
    const interval = setInterval(() => {
      setViewerCount((prev) => prev + Math.floor(Math.random() * 3));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    setShowEndConfirm(true);
  };

  const endStream = () => {
    navigation.replace('LiveEnded', { duration, viewerCount });
  };

  const sendComment = () => {
    if (newComment.trim()) {
      const comment: Comment = {
        id: Date.now().toString(),
        user: 'You',
        avatar: 'https://i.pravatar.cc/100?img=33',
        message: newComment,
        isNew: true,
      };
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    }
  };

  const renderComment = ({ item, index }: { item: Comment; index: number }) => {
    // Initialize animation for new comments
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
        <Image source={{ uri: item.avatar }} style={styles.commentAvatar} />
        <View style={styles.commentContent}>
          <Text style={styles.commentUser}>{item.user}</Text>
          <Text style={styles.commentMessage}>{item.message}</Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Simulated camera/video background */}
      <View style={styles.videoBackground} />

      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.creatorInfo}>
          <Image
            source={{ uri: 'https://i.pravatar.cc/100?img=33' }}
            style={styles.creatorAvatar}
          />
          <View>
            <Text style={styles.creatorName}>Apte Fitness</Text>
            <Text style={styles.viewerCount}>{viewerCount} Fans</Text>
          </View>
        </View>

        <View style={styles.topRight}>
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
            <Text style={styles.durationText}>{formatDuration(duration)}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Comments */}
      <View style={styles.commentsContainer}>
        <FlatList
          data={comments}
          renderItem={renderComment}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.commentsList}
          inverted={false}
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
              Your stream will end and {viewerCount} viewers will be disconnected.
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a3a4a',
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
    borderColor: COLORS.primary,
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 12,
  },
  commentInput: {
    color: 'white',
    fontSize: 15,
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
    backgroundColor: COLORS.primary,
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
