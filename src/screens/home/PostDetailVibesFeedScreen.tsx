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
  Animated,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { useContentStore } from '../../store/contentStore';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import { sharePost, copyPostLink } from '../../utils/share';
import { followUser, unfollowUser, isFollowing, likePost, unlikePost, hasLikedPost, savePost, unsavePost, hasSavedPost } from '../../services/database';

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
    views: 5420,
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
    views: 3210,
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

const PostDetailVibesFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  // Content store for reports and status
  const { submitReport: storeSubmitReport, hasUserReported, isUnderReview } = useContentStore();
  // User safety store for mute/block
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();

  // Params
  const params = route.params as { postId?: string; post?: typeof MOCK_VIBESFEED_POSTS[0] } || {};
  const { postId, post: initialPost } = params;
  const currentPost = initialPost || MOCK_VIBESFEED_POSTS[0];

  // States
  const [viewState, setViewState] = useState(VIEW_STATES.FULLSCREEN);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isFan, setIsFan] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [gridPosts, setGridPosts] = useState(MOCK_GRID_POSTS);

  // Loading states for anti spam-click
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [fanLoading, setFanLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  
  // Animation values
  const scrollY = useRef(new Animated.Value(0)).current;
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const videoRef = useRef(null);

  // User follows me?
  const theyFollowMe = currentPost.user?.followsMe || false;

  // Check follow status on mount
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (currentPost.user?.id) {
        const { following } = await isFollowing(currentPost.user.id);
        setIsFan(following);
      }
    };
    checkFollowStatus();
  }, [currentPost.user?.id]);

  // Check like/bookmark status on mount
  useEffect(() => {
    const checkPostStatus = async () => {
      const postId = currentPost.id;
      if (!postId || !isValidUUID(postId)) return;

      const { hasLiked } = await hasLikedPost(postId);
      setIsLiked(hasLiked);

      const { saved } = await hasSavedPost(postId);
      setIsBookmarked(saved);
    };
    checkPostStatus();
  }, [currentPost.id]);
  
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

  // Validate UUID format
  const isValidUUID = (id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return id && uuidRegex.test(id);
  };

  // Toggle like with anti spam-click - connected to database
  const toggleLike = async () => {
    if (likeLoading) return;

    const postId = currentPost.id;
    if (!postId || !isValidUUID(postId)) {
      // For mock data, use local state only
      setIsLiked(!isLiked);
      if (!isLiked) {
        triggerLikeAnimation();
      }
      return;
    }

    setLikeLoading(true);
    try {
      if (isLiked) {
        const { error } = await unlikePost(postId);
        if (!error) {
          setIsLiked(false);
        }
      } else {
        const { error } = await likePost(postId);
        if (!error) {
          setIsLiked(true);
          triggerLikeAnimation();
        }
      }
    } catch (error) {
      console.error('[PostDetailVibesFeed] Like error:', error);
    } finally {
      setLikeLoading(false);
    }
  };

  // Toggle bookmark with anti spam-click - connected to database
  const toggleBookmark = async () => {
    if (bookmarkLoading) return;

    const postId = currentPost.id;
    if (!postId || !isValidUUID(postId)) {
      // For mock data, use local state only
      setIsBookmarked(!isBookmarked);
      return;
    }

    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        const { error } = await unsavePost(postId);
        if (!error) {
          setIsBookmarked(false);
        }
      } else {
        const { error } = await savePost(postId);
        if (!error) {
          setIsBookmarked(true);
        }
      }
    } catch (error) {
      console.error('[PostDetailVibesFeed] Bookmark error:', error);
    } finally {
      setBookmarkLoading(false);
    }
  };

  // Become fan with anti spam-click - using real database
  const becomeFan = async () => {
    if (fanLoading || !currentPost.user?.id) return;
    setFanLoading(true);
    try {
      const { error } = await followUser(currentPost.user.id);
      if (!error) {
        setIsFan(true);
      } else {
        console.error('[PostDetail] Follow error:', error);
      }
    } catch (error) {
      console.error('[PostDetail] Follow error:', error);
    } finally {
      setFanLoading(false);
    }
  };

  // Share post with anti spam-click
  const handleShare = async () => {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      setShowMenu(false);
      await sharePost(
        currentPost.id,
        currentPost.description,
        currentPost.user.name
      );
    } catch (error) {
      // User cancelled or error - silent fail
    } finally {
      setShareLoading(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async () => {
    setShowMenu(false);
    const copied = await copyPostLink(currentPost.id);
    if (copied) {
      Alert.alert('Copied!', 'Post link copied to clipboard');
    }
  };

  // Report post with anti spam-click
  const handleReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      setShowMenu(false);

      // Check if already reported (anti-spam)
      if (hasUserReported(currentPost.id)) {
        Alert.alert(
          'Déjà signalé',
          'Vous avez déjà signalé ce contenu. Il est en cours d\'examen.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Check if content is already under review
      if (isUnderReview(currentPost.id)) {
        Alert.alert(
          'Sous examen',
          'Ce contenu est déjà en cours d\'examen par notre équipe.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show report modal
      setShowReportModal(true);
    } finally {
      setReportLoading(false);
    }
  };

  // Submit report to store
  const submitReport = (reason: string) => {
    setShowReportModal(false);

    // Submit to content store
    const result = storeSubmitReport(currentPost.id, reason);

    if (result.alreadyReported) {
      Alert.alert('Déjà signalé', result.message, [{ text: 'OK' }]);
    } else if (result.success) {
      Alert.alert('Signalé', result.message, [{ text: 'OK' }]);
    } else {
      Alert.alert('Erreur', 'Une erreur est survenue. Veuillez réessayer.', [{ text: 'OK' }]);
    }
  };

  // Mute user with anti spam-click
  const handleMute = async () => {
    if (muteLoading) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already muted
    if (isUserMuted(userId)) {
      setShowMenu(false);
      Alert.alert('Déjà masqué', 'Cet utilisateur est déjà masqué.', [{ text: 'OK' }]);
      return;
    }

    setShowMenu(false);
    Alert.alert(
      'Masquer cet utilisateur ?',
      'Vous ne verrez plus ses publications dans vos feeds.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Masquer',
          onPress: async () => {
            setMuteLoading(true);
            try {
              const { error } = await mute(userId);
              if (error) {
                Alert.alert('Erreur', 'Impossible de masquer cet utilisateur.', [{ text: 'OK' }]);
              } else {
                Alert.alert('Utilisateur masqué', 'Vous ne verrez plus ses publications.', [{ text: 'OK' }]);
              }
            } finally {
              setMuteLoading(false);
            }
          },
        },
      ]
    );
  };

  // Block user with anti spam-click
  const handleBlock = async () => {
    if (blockLoading) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already blocked
    if (isBlocked(userId)) {
      setShowMenu(false);
      Alert.alert('Déjà bloqué', 'Cet utilisateur est déjà bloqué.', [{ text: 'OK' }]);
      return;
    }

    setShowMenu(false);
    Alert.alert(
      'Bloquer cet utilisateur ?',
      'Vous ne verrez plus ses publications et il ne pourra plus interagir avec vous.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: async () => {
            setBlockLoading(true);
            try {
              const { error } = await block(userId);
              if (error) {
                Alert.alert('Erreur', 'Impossible de bloquer cet utilisateur.', [{ text: 'OK' }]);
              } else {
                Alert.alert('Utilisateur bloqué', 'Vous ne verrez plus ses publications.', [{ text: 'OK' }]);
              }
            } finally {
              setBlockLoading(false);
            }
          },
        },
      ]
    );
  };

  // Format numbers
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };
  
  // Navigate to post detail
  const handleGridPostPress = (post: any) => {
    navigation.navigate('PostDetailVibesFeed', { postId: post.id, post });
  };
  
  // Render grid post (Pinterest style)
  const renderGridPost = (post, index) => {
    const isLeftColumn = index % 2 === 0;
    
    return (
      <TouchableOpacity
        key={`grid-${index}-${post.id}`}
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
            <SmuppyHeartIcon size={14} color="#FFF" filled />
            <Text style={styles.gridLikes}>{formatNumber(post.likes)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
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
                  resizeMode={ResizeMode.COVER}
                  isLooping
                  isMuted={isAudioMuted}
                  shouldPlay={!isPaused}
                  posterSource={{ uri: currentPost.thumbnail }}
                  usePoster
                />
              ) : (
                <OptimizedImage source={currentPost.media || currentPost.thumbnail} style={styles.fullscreenMedia} />
              )}
              
              {/* Gradient overlay */}
              <View style={styles.gradientOverlay} />

              {/* Under Review Overlay */}
              {isUnderReview(currentPost.id) && (
                <View style={styles.underReviewOverlay}>
                  <View style={styles.underReviewBadge}>
                    <Ionicons name="alert-circle" size={24} color="#FFF" />
                    <Text style={styles.underReviewText}>Contenu sous examen</Text>
                  </View>
                </View>
              )}

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
                  <SmuppyHeartIcon size={100} color={COLORS.primaryGreen} filled />
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
                <TouchableOpacity
                  style={[styles.actionBtn, shareLoading && styles.actionBtnDisabled]}
                  onPress={handleShare}
                  disabled={shareLoading}
                >
                  {shareLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="share-social-outline" size={24} color="#FFF" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, likeLoading && styles.actionBtnDisabled]}
                  onPress={toggleLike}
                  disabled={likeLoading}
                >
                  {likeLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                  ) : (
                    <SmuppyHeartIcon
                      size={28}
                      color={isLiked ? COLORS.primaryGreen : '#FFF'}
                      filled={isLiked}
                    />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, bookmarkLoading && styles.actionBtnDisabled]}
                  onPress={toggleBookmark}
                  disabled={bookmarkLoading}
                >
                  {bookmarkLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                  ) : (
                    <Ionicons
                      name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={28}
                      color={isBookmarked ? COLORS.primaryGreen : '#FFF'}
                    />
                  )}
                </TouchableOpacity>

                {currentPost.type === 'video' && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setIsAudioMuted(!isAudioMuted)}
                  >
                    <Ionicons
                      name={isAudioMuted ? 'volume-mute' : 'volume-high'}
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
                      style={[styles.fanBtn, fanLoading && styles.fanBtnDisabled]}
                      onPress={becomeFan}
                      disabled={fanLoading}
                    >
                      {fanLoading ? (
                        <ActivityIndicator size="small" color={COLORS.primaryGreen} />
                      ) : (
                        <>
                          {!theyFollowMe && (
                            <Ionicons name="add" size={16} color={COLORS.primaryGreen} />
                          )}
                          <Text style={styles.fanBtnText}>
                            {theyFollowMe ? 'Track' : 'Fan'}
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
                    {currentPost.description}
                  </Text>
                </TouchableOpacity>
                
                {/* Stats bar */}
                <View style={styles.statsBar}>
                  <View style={styles.statItem}>
                    <SmuppyHeartIcon size={18} color={COLORS.primaryGreen} filled />
                    <Text style={styles.statCount}>{formatNumber(currentPost.likes)}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="eye-outline" size={18} color="#FFF" />
                    <Text style={styles.statCount}>{formatNumber(currentPost.views || 0)}</Text>
                  </View>
                </View>
                
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
                    <SmuppyHeartIcon size={16} color="#FFF" filled />
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
              onPress={handleCopyLink}
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

            <TouchableOpacity style={styles.menuItem} onPress={handleMute} disabled={muteLoading}>
              <Ionicons name="eye-off-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Mute user</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleBlock} disabled={blockLoading}>
              <Ionicons name="ban-outline" size={24} color="#FF6B6B" />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>Block user</Text>
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
    height: 200,
    backgroundColor: 'transparent',
  },

  // Under review overlay
  underReviewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  underReviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,107,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 10,
  },
  underReviewText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
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
    right: 12,
    bottom: 100,
    alignItems: 'center',
    gap: 18,
  },
  actionBtn: {
    padding: 6,
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
    right: 70,
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 18,
    marginBottom: 6,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
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
  
  // Modal handle
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
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

export default PostDetailVibesFeedScreen;