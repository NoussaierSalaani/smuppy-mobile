import React, { useState, useRef, useCallback } from 'react';
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
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CONDENSED_HEIGHT = 200;

// View states
const VIEW_STATES = {
  FULLSCREEN: 'fullscreen',
  CONDENSED: 'condensed',
  GRID_ONLY: 'grid_only',
};

// Mock data - posts du VibesFeed (basés sur centres d'intérêt)
const MOCK_VIBESFEED_POSTS = [
  {
    id: '1',
    type: 'video',
    media: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=800',
    description: 'Today, I experienced the most blissful ride outside. The air is fresh and it feels amazing!',
    likes: 1234,
    comments: 273,
    category: 'Adventure',
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
    description: 'Mountain vibes 🏔️',
    likes: 892,
    comments: 156,
    category: 'Nature',
    user: {
      id: 'user2',
      name: 'Alex Chen',
      avatar: 'https://i.pravatar.cc/150?img=12',
      followsMe: true,
    },
  },
];

// Mock grid posts (Pinterest style)
const MOCK_GRID_POSTS = [
  {
    id: 'g1',
    thumbnail: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400',
    title: 'Gaming Setup',
    likes: 234,
    height: 180,
    type: 'image',
    user: { id: 'u1', name: 'GamerPro', avatar: 'https://i.pravatar.cc/150?img=1' },
  },
  {
    id: 'g2',
    thumbnail: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?w=400',
    title: 'Epic Moment',
    likes: 567,
    height: 220,
    type: 'video',
    duration: '0:34',
    user: { id: 'u2', name: 'StreamKing', avatar: 'https://i.pravatar.cc/150?img=2' },
  },
  {
    id: 'g3',
    thumbnail: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400',
    title: 'New Tech Review',
    likes: 891,
    height: 160,
    type: 'image',
    user: { id: 'u3', name: 'TechGuru', avatar: 'https://i.pravatar.cc/150?img=3' },
  },
  {
    id: 'g4',
    thumbnail: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0a?w=400',
    title: 'Highlights',
    likes: 432,
    height: 200,
    type: 'video',
    duration: '1:20',
    user: { id: 'u4', name: 'ProPlayer', avatar: 'https://i.pravatar.cc/150?img=4' },
  },
  {
    id: 'g5',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
    title: 'Sunset Views',
    likes: 1203,
    height: 240,
    type: 'image',
    user: { id: 'u5', name: 'NatureLover', avatar: 'https://i.pravatar.cc/150?img=5' },
  },
  {
    id: 'g6',
    thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400',
    title: 'Forest Trail',
    likes: 765,
    height: 180,
    type: 'image',
    user: { id: 'u6', name: 'Hiker', avatar: 'https://i.pravatar.cc/150?img=6' },
  },
  {
    id: 'g7',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    title: 'Portrait Shot',
    likes: 543,
    height: 200,
    type: 'image',
    user: { id: 'u7', name: 'PhotoArtist', avatar: 'https://i.pravatar.cc/150?img=7' },
  },
  {
    id: 'g8',
    thumbnail: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=400',
    title: 'Cute Cat',
    likes: 2341,
    height: 170,
    type: 'video',
    duration: '0:15',
    user: { id: 'u8', name: 'PetLover', avatar: 'https://i.pravatar.cc/150?img=8' },
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
];

const PostDetailVibesFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  
  // Params
  const { postId, post: initialPost } = route.params || {};
  const currentPost = initialPost || MOCK_VIBESFEED_POSTS[0];
  
  // States
  const [viewState, setViewState] = useState(VIEW_STATES.FULLSCREEN);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isFan, setIsFan] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [gridPosts, setGridPosts] = useState(MOCK_GRID_POSTS);
  
  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const videoRef = useRef(null);
  
  // User follows me?
  const theyFollowMe = currentPost.user?.followsMe || false;
  
  // Double tap to like
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        setIsLiked(true);
        triggerLikeAnimation();
      }
    } else {
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
  
  // Handle swipe down
  const handleSwipeDown = () => {
    if (viewState === VIEW_STATES.FULLSCREEN) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.GRID_ONLY);
      // Shuffle grid posts for variety
      setGridPosts([...MOCK_GRID_POSTS].sort(() => Math.random() - 0.5));
    }
  };
  
  // Handle swipe up
  const handleSwipeUp = () => {
    if (viewState === VIEW_STATES.GRID_ONLY) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.FULLSCREEN);
    }
  };
  
  // Handle scroll
  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    
    if (offsetY > 50 && viewState === VIEW_STATES.FULLSCREEN) {
      handleSwipeDown();
    } else if (offsetY < -50 && viewState !== VIEW_STATES.FULLSCREEN) {
      handleSwipeUp();
    }
  };
  
  // Format numbers
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };
  
  // Navigate to post detail
  const handleGridPostPress = (post) => {
    navigation.push('PostDetailVibesFeed', { postId: post.id, post });
  };
  
  // Render grid post (Pinterest style)
  const renderGridPost = (post, index) => {
    const isLeftColumn = index % 2 === 0;
    
    return (
      <TouchableOpacity
        key={post.id}
        style={[styles.gridCard, { height: post.height }]}
        activeOpacity={0.9}
        onPress={() => handleGridPostPress(post)}
      >
        <OptimizedImage source={post.thumbnail} style={styles.gridThumbnail} />
        
        {post.type === 'video' && post.duration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{post.duration}</Text>
          </View>
        )}
        
        <View style={styles.gridOverlay}>
          <Text style={styles.gridTitle} numberOfLines={2}>{post.title}</Text>
          <View style={styles.gridStats}>
            <Ionicons name="heart" size={14} color="#FFF" />
            <Text style={styles.gridLikes}>{formatNumber(post.likes)}</Text>
          </View>
        </View>
      </TouchableOpacity>
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
            <Text style={styles.viewRepliesText}>View replies ({item.replies})</Text>
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
  
  // Split grid posts into columns for masonry layout
  const leftColumn = gridPosts.filter((_, i) => i % 2 === 0);
  const rightColumn = gridPosts.filter((_, i) => i % 2 === 1);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ScrollView
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* FULLSCREEN VIEW */}
        {viewState === VIEW_STATES.FULLSCREEN && (
          <TouchableWithoutFeedback onPress={handleDoubleTap}>
            <View style={[styles.fullscreenContainer, { height: height }]}>
              {/* Media */}
              {currentPost.type === 'video' ? (
                <Video
                  ref={videoRef}
                  source={{ uri: currentPost.media }}
                  style={styles.fullscreenMedia}
                  resizeMode="cover"
                  isLooping
                  isMuted={isMuted}
                  shouldPlay={!isPaused}
                  posterSource={{ uri: currentPost.thumbnail }}
                  usePoster
                />
              ) : (
                <OptimizedImage source={currentPost.media || currentPost.thumbnail} style={styles.fullscreenMedia} />
              )}
              
              {/* Gradient overlay */}
              <View style={styles.gradientOverlay} />
              
              {/* Like animation */}
              {showLikeAnimation && (
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
                  <Ionicons name="close" size={28} color="#FFF" />
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
                <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="share-social-outline" size={28} color="#FFF" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setIsLiked(!isLiked)}
                >
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={28}
                    color={isLiked ? COLORS.primaryGreen : '#FFF'}
                  />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => setIsBookmarked(!isBookmarked)}
                >
                  <Ionicons
                    name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                    size={28}
                    color={isBookmarked ? COLORS.primaryGreen : '#FFF'}
                  />
                </TouchableOpacity>
                
                {currentPost.type === 'video' && (
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
              <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 20 }]}>
                {/* User info */}
                <View style={styles.userRow}>
                  <TouchableOpacity
                    style={styles.userInfo}
                    onPress={() => navigation.navigate('UserProfile', { userId: currentPost.user.id })}
                  >
                    <AvatarImage source={currentPost.user.avatar} size={40} style={styles.avatar} />
                    <Text style={styles.userName}>{currentPost.user.name}</Text>
                  </TouchableOpacity>
                  
                  {!isFan && (
                    <TouchableOpacity
                      style={styles.fanBtn}
                      onPress={() => setIsFan(true)}
                    >
                      {!theyFollowMe && (
                        <Ionicons name="add" size={16} color={COLORS.primaryGreen} />
                      )}
                      <Text style={styles.fanBtnText}>
                        {theyFollowMe ? 'Track' : 'Fan'}
                      </Text>
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
                    {currentPost.description}
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
                    <Text style={styles.commentCount}>{formatNumber(currentPost.comments)}</Text>
                    <Ionicons
                      name="heart"
                      size={18}
                      color={COLORS.primaryGreen}
                      style={{ marginLeft: 12 }}
                    />
                  </View>
                </TouchableOpacity>
                
                {/* Swipe indicator */}
                <View style={styles.swipeIndicator}>
                  <Ionicons name="chevron-up" size={24} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.swipeText}>Swipe up for more</Text>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        )}
        
        {/* CONDENSED VIEW */}
        {viewState === VIEW_STATES.CONDENSED && (
          <View style={{ paddingTop: insets.top }}>
            {/* Condensed post at top */}
            <TouchableOpacity
              style={styles.condensedPost}
              activeOpacity={0.9}
              onPress={() => setViewState(VIEW_STATES.FULLSCREEN)}
            >
              <OptimizedImage source={currentPost.thumbnail} style={styles.condensedMedia} />
              <View style={styles.condensedOverlay}>
                <View style={styles.condensedHeader}>
                  <TouchableOpacity
                    style={styles.condensedBackBtn}
                    onPress={() => navigation.goBack()}
                  >
                    <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.condensedInfo}>
                  <View style={styles.condensedUser}>
                    <AvatarImage source={currentPost.user.avatar} size={32} />
                    <Text style={styles.condensedUserName}>{currentPost.user.name}</Text>
                  </View>
                  <View style={styles.condensedStats}>
                    <Ionicons name="heart" size={16} color="#FFF" />
                    <Text style={styles.condensedLikes}>{formatNumber(currentPost.likes)}</Text>
                  </View>
                </View>
              </View>
              
              {/* Expand icon */}
              <View style={styles.expandIcon}>
                <Ionicons name="expand" size={20} color="#FFF" />
              </View>
            </TouchableOpacity>
            
            {/* Grid posts (Pinterest style) */}
            <View style={styles.gridContainer}>
              <Text style={styles.gridTitle2}>More to explore</Text>
              <View style={styles.masonryContainer}>
                <View style={styles.masonryColumn}>
                  {leftColumn.map((post, index) => renderGridPost(post, index * 2))}
                </View>
                <View style={styles.masonryColumn}>
                  {rightColumn.map((post, index) => renderGridPost(post, index * 2 + 1))}
                </View>
              </View>
            </View>
          </View>
        )}
        
        {/* GRID ONLY VIEW */}
        {viewState === VIEW_STATES.GRID_ONLY && (
          <View style={{ paddingTop: insets.top + 10 }}>
            {/* Header */}
            <View style={styles.gridOnlyHeader}>
              <TouchableOpacity
                style={styles.gridBackBtn}
                onPress={() => setViewState(VIEW_STATES.CONDENSED)}
              >
                <Ionicons name="chevron-up" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.gridOnlyTitle}>Explore</Text>
              <View style={{ width: 40 }} />
            </View>
            
            {/* Grid posts (Pinterest style) */}
            <View style={styles.gridContainer}>
              <View style={styles.masonryContainer}>
                <View style={styles.masonryColumn}>
                  {leftColumn.map((post, index) => renderGridPost(post, index * 2))}
                </View>
                <View style={styles.masonryColumn}>
                  {rightColumn.map((post, index) => renderGridPost(post, index * 2 + 1))}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      
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
            <View style={styles.modalHandle} />
            
            <View style={styles.commentsHeader}>
              <View style={styles.commentsHeaderLeft}>
                <Ionicons name="chatbubble-outline" size={20} color="#FFF" />
                <Text style={styles.commentsCount}>{currentPost.comments}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowComments(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <FlashList
              data={MOCK_COMMENTS}
              renderItem={renderCommentItem}
              keyExtractor={(item) => item.id}
              estimatedItemSize={80}
              style={styles.commentsList}
              showsVerticalScrollIndicator={false}
            />
            
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
              <TouchableOpacity style={styles.sendBtn}>
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
            
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="share-social-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="link-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="person-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem}>
              <Ionicons name="flag-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Report</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBg,
  },
  scrollView: {
    flex: 1,
  },
  
  // Fullscreen
  fullscreenContainer: {
    width: width,
    position: 'relative',
  },
  fullscreenMedia: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 350,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    bottom: 250,
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
  
  // Bottom content
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
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
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    marginBottom: 12,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
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
  
  // Swipe indicator
  swipeIndicator: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  swipeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  
  // Condensed post
  condensedPost: {
    height: CONDENSED_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  condensedMedia: {
    width: '100%',
    height: '100%',
  },
  condensedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
    padding: 12,
  },
  condensedHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  condensedBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  condensedInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  condensedUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  condensedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  condensedUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  condensedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  condensedLikes: {
    fontSize: 14,
    color: '#FFF',
  },
  expandIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Grid
  gridContainer: {
    paddingHorizontal: 16,
  },
  gridTitle2: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 16,
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  masonryColumn: {
    flex: 1,
    gap: 12,
  },
  gridCard: {
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  gridStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLikes: {
    fontSize: 12,
    color: '#FFF',
  },
  
  // Grid only header
  gridOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gridBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOnlyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
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
});

export default PostDetailVibesFeedScreen;