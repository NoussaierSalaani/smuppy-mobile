import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  StatusBar,
  Modal,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

const { width, height } = Dimensions.get('window');

// Mock data - posts du FanFeed (plusieurs créateurs)
const MOCK_FANFEED_POSTS = [
  {
    id: '1',
    type: 'video',
    media: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=800',
    description: 'Today, I experienced the most blissful ride outside. The air is fresh and it feels amazing when you just let go and enjoy the moment.',
    likes: 1234,
    comments: 273,
    user: {
      id: 'user1',
      name: 'Dianne Russell',
      avatar: 'https://i.pravatar.cc/150?img=5',
      followsMe: false,
    },
  },
  {
    id: '2',
    type: 'image',
    media: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800',
    description: 'Mountain vibes 🏔️ Nothing beats this view!',
    likes: 892,
    comments: 156,
    user: {
      id: 'user2',
      name: 'Alex Chen',
      avatar: 'https://i.pravatar.cc/150?img=12',
      followsMe: true,
    },
  },
  {
    id: '3',
    type: 'video',
    media: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
    description: 'Nature at its finest 🌿 Can\'t believe I captured this moment!',
    likes: 2341,
    comments: 89,
    user: {
      id: 'user3',
      name: 'Sarah Kim',
      avatar: 'https://i.pravatar.cc/150?img=9',
      followsMe: false,
    },
  },
  {
    id: '4',
    type: 'image',
    media: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
    description: 'New project coming soon! Stay tuned 🔥',
    likes: 567,
    comments: 42,
    user: {
      id: 'user4',
      name: 'Marcus Johnson',
      avatar: 'https://i.pravatar.cc/150?img=15',
      followsMe: true,
    },
  },
  {
    id: '5',
    type: 'video',
    media: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    description: 'Epic sunset from yesterday. Sometimes you just need to stop and appreciate the view.',
    likes: 3421,
    comments: 198,
    user: {
      id: 'user5',
      name: 'Emma Wilson',
      avatar: 'https://i.pravatar.cc/150?img=20',
      followsMe: false,
    },
  },
];

// Mock comments
const MOCK_COMMENTS = [
  {
    id: '1',
    user: { name: 'Tung Tran', avatar: 'https://i.pravatar.cc/150?img=11' },
    text: '🔥🔥🔥',
    likes: 1800,
    replies: 12,
    timeAgo: '2h',
  },
  {
    id: '2',
    user: { name: 'marvel_fanatic', avatar: 'https://i.pravatar.cc/150?img=12' },
    text: "You've got to comission this man.",
    likes: 1800,
    replies: 12,
    timeAgo: '3h',
  },
  {
    id: '3',
    user: { name: 'Badli', avatar: 'https://i.pravatar.cc/150?img=13' },
    text: 'Cool! 😎',
    likes: 1800,
    replies: 12,
    timeAgo: '4h',
  },
  {
    id: '4',
    user: { name: 'Dadaboyy', avatar: 'https://i.pravatar.cc/150?img=14' },
    text: "Seems like I'm still a beginner, cause what!! This is huge.",
    likes: 1800,
    replies: 12,
    timeAgo: '5h',
  },
];

const PostDetailFanFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  
  // Params
  const { postId, fanFeedPosts = MOCK_FANFEED_POSTS } = route.params || {};
  const initialIndex = fanFeedPosts.findIndex(p => p.id === postId) || 0;
  
  // States
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [likedPosts, setLikedPosts] = useState({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState({});
  const [fanStatus, setFanStatus] = useState({}); // { odId: true/false }
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);

  // Loading states for anti spam-click
  const [likeLoading, setLikeLoading] = useState({});
  const [bookmarkLoading, setBookmarkLoading] = useState({});
  const [fanLoading, setFanLoading] = useState({});
  const [shareLoading, setShareLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  
  // Index minimum (ne peut pas remonter plus haut que le post initial)
  const minIndex = initialIndex >= 0 ? initialIndex : 0;
  
  // Refs
  const videoRef = useRef(null);
  const flatListRef = useRef(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  
  // Current post
  const currentPost = fanFeedPosts[currentIndex] || MOCK_FANFEED_POSTS[0];
  
  // Check if already fan of current post user
  const isAlreadyFan = fanStatus[currentPost.user.id] === true;
  const theyFollowMe = currentPost.user.followsMe;
  
  // Double tap to like
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - Like
      if (!likedPosts[currentPost.id]) {
        setLikedPosts(prev => ({ ...prev, [currentPost.id]: true }));
        triggerLikeAnimation();
      }
    } else {
      // Single tap - toggle pause/play for video
      if (currentPost.type === 'video') {
        setIsPaused(!isPaused);
      }
    }
    lastTap.current = now;
  };
  
  // Like animation
  const triggerLikeAnimation = () => {
    setShowLikeAnimation(true);
    likeAnimationScale.setValue(0);
    
    Animated.sequence([
      Animated.spring(likeAnimationScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
      Animated.timing(likeAnimationScale, {
        toValue: 0,
        duration: 200,
        delay: 500,
        useNativeDriver: true,
      }),
    ]).start(() => setShowLikeAnimation(false));
  };
  
  // Handle scroll - bloque le scroll vers le haut au-delà du post initial
  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const newIndex = Math.round(offsetY / height);
    
    // Empêcher de remonter plus haut que le post initial
    if (newIndex < minIndex) {
      flatListRef.current?.scrollToIndex({
        index: minIndex,
        animated: true,
      });
    }
  };
  
  // Handle swipe to next/prev post
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      
      // Ne pas aller plus haut que minIndex
      if (newIndex >= minIndex) {
        setCurrentIndex(newIndex);
        setIsPaused(false);
        setExpandedDescription(false);
      }
    }
  }).current;
  
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;
  
  // Toggle like with anti spam-click
  const toggleLike = async (postId) => {
    if (likeLoading[postId]) return;
    setLikeLoading(prev => ({ ...prev, [postId]: true }));
    try {
      // Simulate network delay (will be replaced with real API)
      await new Promise(resolve => setTimeout(resolve, 300));
      setLikedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
      if (!likedPosts[postId]) {
        triggerLikeAnimation();
      }
    } finally {
      setLikeLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Toggle bookmark with anti spam-click
  const toggleBookmark = async (postId) => {
    if (bookmarkLoading[postId]) return;
    setBookmarkLoading(prev => ({ ...prev, [postId]: true }));
    try {
      // Simulate network delay (will be replaced with real API)
      await new Promise(resolve => setTimeout(resolve, 300));
      setBookmarkedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
    } finally {
      setBookmarkLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Become fan with anti spam-click
  const becomeFan = async (userId) => {
    if (fanLoading[userId]) return;
    setFanLoading(prev => ({ ...prev, [userId]: true }));
    try {
      // Simulate network delay (will be replaced with real API)
      await new Promise(resolve => setTimeout(resolve, 300));
      setFanStatus(prev => ({ ...prev, [userId]: true }));
    } finally {
      setFanLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  // Share post with anti spam-click
  const handleShare = async () => {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      setShowMenu(false);
      await Share.share({
        message: `Check out this post by ${currentPost.user.name} on Smuppy!`,
        // url: `smuppy://post/${currentPost.id}`, // Deep link for future
      });
    } catch (error) {
      // User cancelled or error - silent fail
    } finally {
      setShareLoading(false);
    }
  };

  // Report post with anti spam-click
  const handleReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      setShowMenu(false);
      // Show report modal
      setShowReportModal(true);
    } finally {
      setReportLoading(false);
    }
  };

  // Submit report
  const submitReport = (reason) => {
    setShowReportModal(false);
    Alert.alert(
      'Report Submitted',
      'Thank you for your report. We will review this content.',
      [{ text: 'OK' }]
    );
  };
  
  // Format numbers
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };
  
  // Render post item
  const renderPostItem = ({ item, index }) => {
    const isLiked = likedPosts[item.id];
    const isBookmarked = bookmarkedPosts[item.id];
    const isFanOfUser = fanStatus[item.user.id];
    const userFollowsMe = item.user.followsMe;
    
    return (
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={[styles.postContainer, { height: height }]}>
          {/* Media */}
          {item.type === 'video' ? (
            <Video
              ref={index === currentIndex ? videoRef : null}
              source={{ uri: item.media }}
              style={styles.media}
              resizeMode="cover"
              isLooping
              isMuted={isMuted}
              shouldPlay={index === currentIndex && !isPaused}
              posterSource={{ uri: item.thumbnail }}
              usePoster
            />
          ) : (
            <OptimizedImage source={item.media} style={styles.media} />
          )}
          
          {/* Gradient overlay bottom */}
          <View style={styles.gradientOverlay} />
          
          {/* Like animation */}
          {showLikeAnimation && index === currentIndex && (
            <Animated.View
              style={[
                styles.likeAnimation,
                {
                  transform: [{ scale: likeAnimationScale }],
                  opacity: likeAnimationScale,
                },
              ]}
            >
              <Ionicons name="heart" size={100} color={COLORS.primaryGreen} />
            </Animated.View>
          )}
          
          {/* Header */}
          <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setShowMenu(true)}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          
          {/* Right actions */}
          <View style={styles.rightActions}>
            <TouchableOpacity
              style={[styles.actionBtn, shareLoading && styles.actionBtnDisabled]}
              onPress={handleShare}
              disabled={shareLoading}
            >
              {shareLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="share-social-outline" size={28} color="#FFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, likeLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleLike(item.id)}
              disabled={likeLoading[item.id]}
            >
              {likeLoading[item.id] ? (
                <ActivityIndicator size="small" color={COLORS.primaryGreen} />
              ) : (
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={28}
                  color={isLiked ? COLORS.primaryGreen : '#FFF'}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, bookmarkLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleBookmark(item.id)}
              disabled={bookmarkLoading[item.id]}
            >
              {bookmarkLoading[item.id] ? (
                <ActivityIndicator size="small" color={COLORS.primaryGreen} />
              ) : (
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={28}
                  color={isBookmarked ? COLORS.primaryGreen : '#FFF'}
                />
              )}
            </TouchableOpacity>

            {item.type === 'video' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setIsMuted(!isMuted)}
              >
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={28}
                  color="#FFF"
                />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Bottom content */}
          <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 10 }]}>
            {/* User info */}
            <View style={styles.userRow}>
              <TouchableOpacity
                style={styles.userInfo}
                onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
              >
                <AvatarImage source={item.user.avatar} size={40} style={styles.avatar} />
                <Text style={styles.userName}>{item.user.name}</Text>
              </TouchableOpacity>
              
              {/* Bouton Fan - logique:
                  - Si déjà fan → pas de bouton (rien)
                  - Si pas fan + ils me suivent → "Track"
                  - Si pas fan + ils me suivent pas → "+ Fan"
              */}
              {!isFanOfUser && (
                <TouchableOpacity
                  style={[styles.fanBtn, fanLoading[item.user.id] && styles.fanBtnDisabled]}
                  onPress={() => becomeFan(item.user.id)}
                  disabled={fanLoading[item.user.id]}
                >
                  {fanLoading[item.user.id] ? (
                    <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                  ) : (
                    <>
                      {!userFollowsMe && (
                        <Ionicons name="add" size={16} color={COLORS.primaryGreen} />
                      )}
                      <Text style={styles.fanBtnText}>
                        {userFollowsMe ? 'Track' : 'Fan'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            
            {/* Description */}
            <TouchableOpacity
              onPress={() => setExpandedDescription(!expandedDescription)}
              activeOpacity={0.8}
            >
              <Text
                style={styles.description}
                numberOfLines={expandedDescription ? undefined : 2}
              >
                {item.description}
                {!expandedDescription && item.description.length > 80 && (
                  <Text style={styles.moreText}> ...more</Text>
                )}
              </Text>
            </TouchableOpacity>
            
            {/* Comment input */}
            <TouchableOpacity
              style={styles.commentInputContainer}
              onPress={() => setShowComments(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.commentPlaceholder}>Add a comment...</Text>
              <View style={styles.commentStats}>
                <Ionicons name="chatbubble-outline" size={18} color="#FFF" />
                <Text style={styles.commentCount}>{formatNumber(item.comments)}</Text>
                <Ionicons
                  name="heart"
                  size={18}
                  color={COLORS.primaryGreen}
                  style={{ marginLeft: 12 }}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  };
  
  // Render comment item
  const renderCommentItem = ({ item }) => (
    <View style={styles.commentItem}>
      <AvatarImage source={item.user.avatar} size={36} />
      <View style={styles.commentContent}>
        <Text style={styles.commentUserName}>{item.user.name}</Text>
        <Text style={styles.commentText}>{item.text}</Text>
        <View style={styles.commentActions}>
          <Text style={styles.commentTime}>{item.timeAgo}</Text>
          <TouchableOpacity>
            <Text style={styles.commentReply}>Reply</Text>
          </TouchableOpacity>
        </View>
        {item.replies > 0 && (
          <TouchableOpacity style={styles.viewReplies}>
            <Text style={styles.viewRepliesText}>
              View replies ({item.replies})
            </Text>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.commentLike}>
        <Ionicons name="heart-outline" size={18} color={COLORS.textMuted} />
        <Text style={styles.commentLikeCount}>{formatNumber(item.likes)}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Posts FlashList (vertical scroll) */}
      <FlashList
        ref={flatListRef}
        data={fanFeedPosts.length > 0 ? fanFeedPosts : MOCK_FANFEED_POSTS}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={height}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
        getItemLayout={(data, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
      />
      
      {/* Comments Modal */}
      <Modal
        visible={showComments}
        animationType="slide"
        transparent
        onRequestClose={() => setShowComments(false)}
      >
        <View style={styles.commentsModalOverlay}>
          <TouchableOpacity
            style={styles.commentsModalBackdrop}
            onPress={() => setShowComments(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.commentsModalContent}
          >
            {/* Handle */}
            <View style={styles.modalHandle} />
            
            {/* Header */}
            <View style={styles.commentsHeader}>
              <View style={styles.commentsHeaderLeft}>
                <Ionicons name="chatbubble-outline" size={20} color="#FFF" />
                <Text style={styles.commentsCount}>{currentPost.comments}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            {/* Comments list */}
            <FlashList
              data={MOCK_COMMENTS}
              renderItem={renderCommentItem}
              keyExtractor={(item) => item.id}
              estimatedItemSize={80}
              style={styles.commentsList}
              showsVerticalScrollIndicator={false}
            />
            
            {/* Comment input */}
            <View style={[styles.commentInputBar, { paddingBottom: insets.bottom + 10 }]}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                placeholderTextColor={COLORS.textMuted}
                value={commentText}
                onChangeText={setCommentText}
              />
              <TouchableOpacity style={styles.emojiBtn}>
                <Ionicons name="happy-outline" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  commentText.length > 0 && styles.sendBtnActive,
                ]}
              >
                <Ionicons
                  name="send"
                  size={20}
                  color={commentText.length > 0 ? COLORS.primaryGreen : COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      
      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContent}>
            <View style={styles.modalHandle} />

            <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                Alert.alert('Link Copied', 'Post link copied to clipboard!');
              }}
            >
              <Ionicons name="link-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigation.navigate('UserProfile', { userId: currentPost.user.id });
              }}
            >
              <Ionicons name="person-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <Ionicons name="flag-outline" size={24} color="#FF6B6B" />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowReportModal(false)}
        >
          <View style={styles.menuContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.reportTitle}>Report this post</Text>
            <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('spam')}
            >
              <Text style={styles.reportOptionText}>Spam or misleading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('inappropriate')}
            >
              <Text style={styles.reportOptionText}>Inappropriate content</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('harassment')}
            >
              <Text style={styles.reportOptionText}>Harassment or bullying</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('violence')}
            >
              <Text style={styles.reportOptionText}>Violence or dangerous</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('other')}
            >
              <Text style={styles.reportOptionText}>Other</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBg,
  },
  postContainer: {
    width: width,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  
  // Like animation
  likeAnimation: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -50,
    marginLeft: -50,
    zIndex: 100,
  },
  
  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Right actions
  rightActions: {
    position: 'absolute',
    right: 16,
    bottom: 200,
    alignItems: 'center',
    gap: 20,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  
  // Bottom content
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  
  // User row
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  fanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGreen,
    gap: 4,
    minWidth: 70,
    justifyContent: 'center',
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  
  // Description
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    marginBottom: 12,
  },
  moreText: {
    color: COLORS.textMuted,
  },
  
  // Comment input container
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentPlaceholder: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  commentStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentCount: {
    fontSize: 14,
    color: '#FFF',
    marginLeft: 6,
  },
  
  // Comments Modal
  commentsModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  commentsModalContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: height * 0.7,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  commentsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentsCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  
  // Comment item
  commentItem: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentContent: {
    flex: 1,
  },
  commentUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  commentTime: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  commentReply: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  viewReplies: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  viewRepliesText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  commentLike: {
    alignItems: 'center',
    marginLeft: 12,
  },
  commentLikeCount: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  
  // Comment input bar
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  commentInput: {
    flex: 1,
    backgroundColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#FFF',
  },
  emojiBtn: {
    padding: 4,
  },
  sendBtn: {
    padding: 4,
  },
  sendBtnActive: {
    opacity: 1,
  },
  
  // Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFF',
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },

  // Report modal
  reportTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  reportSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  reportOption: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reportOptionText: {
    fontSize: 16,
    color: '#FFF',
  },
});

export default PostDetailFanFeedScreen;