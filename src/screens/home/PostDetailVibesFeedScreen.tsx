import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useContentStore } from '../../stores/contentStore';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { sharePost, copyPostLink } from '../../utils/share';
import { followUser, isFollowing, likePost, unlikePost, hasLikedPost, savePost, unsavePost, hasSavedPost, recordPostView } from '../../services/database';
import { isValidUUID, formatNumber } from '../../utils/formatters';

const { width, height } = Dimensions.get('window');
const CONDENSED_HEIGHT = 220;
const GRID_GAP = 12;
const GRID_PADDING = 16;

// View states
const VIEW_STATES = {
  FULLSCREEN: 'fullscreen',
  CONDENSED: 'condensed',
  GRID_ONLY: 'grid_only',
};

interface VibesFeedPost { id: string; type: string; media: string; thumbnail: string; description: string; likes: number; views: number; category: string; location?: string | null; allMedia?: string[]; user: { id: string; name: string; avatar: string; followsMe: boolean } }

interface GridPost { id: string; thumbnail: string; title: string; likes: number; height: number; type: string; category: string; user: { id: string; name: string; avatar: string }; duration?: string }

const PostDetailVibesFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();

  // Content store for reports and status
  const { submitReport: storeSubmitReport, hasUserReported, isUnderReview } = useContentStore();
  // User safety store for mute/block
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();
  const currentUserId = useUserStore((state) => state.user?.id);

  // Params
  const params = route.params as {
    postId?: string;
    post?: VibesFeedPost;
    startCondensed?: boolean;
  } || {};
  const { postId: _postId, post: initialPost, startCondensed } = params;
  const currentPost = initialPost;

  // All hooks must be called before any early return
  // States - start in CONDENSED if coming from grid post click
  const [viewState, setViewState] = useState(startCondensed ? VIEW_STATES.CONDENSED : VIEW_STATES.FULLSCREEN);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isFan, setIsFan] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [gridPosts, setGridPosts] = useState<GridPost[]>([]);

  // Loading states for anti spam-click
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [fanLoading, setFanLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [blockLoading, setBlockLoading] = useState(false);

  // Animation values

  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  const videoRef = useRef(null);

  // Card press animation refs
  const cardScales = useRef<{ [key: string]: Animated.Value }>({}).current;
  const viewedPosts = useRef<Set<string>>(new Set());
  const getCardScale = useCallback((id: string) => {
    if (!cardScales[id]) {
      cardScales[id] = new Animated.Value(1);
    }
    return cardScales[id];
  }, [cardScales]);

  // User follows me?
  const _theyFollowMe = currentPost?.user?.followsMe || false;

  // Check follow status on mount
  useEffect(() => {
    if (!currentPost) return;
    const checkFollowStatus = async () => {
      if (currentPost.user?.id && currentPost.user.id !== currentUserId) {
        const { following } = await isFollowing(currentPost.user.id);
        setIsFan(following);
      }
    };
    checkFollowStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.user?.id]);

  // Check like/bookmark status on mount
  useEffect(() => {
    if (!currentPost) return;
    const checkPostStatus = async () => {
      const postId = currentPost.id;
      if (!postId || !isValidUUID(postId)) return;

      const { hasLiked } = await hasLikedPost(postId);
      setIsLiked(hasLiked);

      const { saved } = await hasSavedPost(postId);
      setIsBookmarked(saved);
    };
    checkPostStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.id]);

  // Record post view (deduped per session)
  useEffect(() => {
    if (!currentPost?.id || !isValidUUID(currentPost.id)) return;
    if (viewedPosts.current.has(currentPost.id)) return;

    viewedPosts.current.add(currentPost.id);
    recordPostView(currentPost.id);
  }, [currentPost?.id]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Dynamic styles depending on insets
  const headerPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);
  const bottomContentPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 20 }), [insets.bottom]);
  const condensedPaddingStyle = useMemo(() => ({ paddingTop: insets.top }), [insets.top]);
  const gridOnlyPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);

  // Like animation
  const triggerLikeAnimation = useCallback(() => {
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
  }, [likeAnimationScale]);

  // Toggle like with anti spam-click - connected to database
  const toggleLike = useCallback(async () => {
    if (likeLoading || !currentPost) return;

    const postId = currentPost.id;

    // Optimistic update - change UI immediately
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    if (newLikedState) {
      triggerLikeAnimation();
    }

    // If not a valid UUID (mock data), just keep the optimistic update
    if (!postId || !isValidUUID(postId)) {
      return;
    }

    // Try to sync with database
    setLikeLoading(true);
    try {
      if (!newLikedState) {
        const { error } = await unlikePost(postId);
        if (error) {
          setIsLiked(true);
        } else {
          useFeedStore.getState().toggleLikeOptimistic(postId, false);
        }
      } else {
        const { error } = await likePost(postId);
        if (error) {
          setIsLiked(false);
        } else {
          useFeedStore.getState().toggleLikeOptimistic(postId, true);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailVibesFeed] Like error:', error);
      setIsLiked(!newLikedState);
    } finally {
      setLikeLoading(false);
    }
  }, [likeLoading, currentPost, isLiked, triggerLikeAnimation]);

  // Toggle bookmark with anti spam-click - connected to database
  const toggleBookmark = useCallback(async () => {
    if (bookmarkLoading || !currentPost) return;

    const postId = currentPost.id;

    // Optimistic update - change UI immediately
    const newBookmarkState = !isBookmarked;
    setIsBookmarked(newBookmarkState);

    // If not a valid UUID (mock data), just keep the optimistic update
    if (!postId || !isValidUUID(postId)) {
      return;
    }

    // Try to sync with database
    setBookmarkLoading(true);
    try {
      if (!newBookmarkState) {
        const { error } = await unsavePost(postId);
        if (error) {
          // Revert on error
          setIsBookmarked(true);
        } else {
          showSuccess('Removed', 'Post removed from saved.');
        }
      } else {
        const { error } = await savePost(postId);
        if (error) {
          // Revert on error
          setIsBookmarked(false);
        } else {
          showSuccess('Saved', 'Post added to your collection.');
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailVibesFeed] Bookmark error:', error);
      // Revert on error
      setIsBookmarked(!newBookmarkState);
    } finally {
      setBookmarkLoading(false);
    }
  }, [bookmarkLoading, currentPost, isBookmarked, showSuccess]);

  // Become fan with anti spam-click - using real database
  const becomeFan = useCallback(async () => {
    if (fanLoading || !currentPost?.user?.id) return;
    setFanLoading(true);
    try {
      const { error } = await followUser(currentPost.user.id);
      if (!error) {
        setIsFan(true);
      } else {
        if (__DEV__) console.warn('[PostDetail] Follow error:', error);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetail] Follow error:', error);
    } finally {
      setFanLoading(false);
    }
  }, [fanLoading, currentPost?.user?.id]);

  // Double tap to like
  const handleDoubleTap = useCallback(() => {
    if (!currentPost) return;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        toggleLike(); // Call API to persist the like
      }
    } else {
      if (currentPost.type === 'video') {
        setIsPaused(prev => !prev);
      }
    }
    lastTap.current = now;
  }, [currentPost, isLiked, toggleLike]);

  // Handle swipe down
  const handleSwipeDown = useCallback(() => {
    if (viewState === VIEW_STATES.FULLSCREEN) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.GRID_ONLY);
      // Shuffle grid posts for variety
      setGridPosts(prev => [...prev].sort(() => Math.random() - 0.5));
    }
  }, [viewState]);

  // Handle swipe up
  const handleSwipeUp = useCallback(() => {
    if (viewState === VIEW_STATES.GRID_ONLY) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.FULLSCREEN);
    }
  }, [viewState]);

  // Handle scroll
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    if (offsetY > 50 && viewState === VIEW_STATES.FULLSCREEN) {
      handleSwipeDown();
    } else if (offsetY < -50 && viewState !== VIEW_STATES.FULLSCREEN) {
      handleSwipeUp();
    }
  }, [viewState, handleSwipeDown, handleSwipeUp]);

  // Share post with anti spam-click
  const handleShare = useCallback(async () => {
    if (shareLoading || !currentPost) return;
    setShareLoading(true);
    try {
      setShowMenu(false);
      await sharePost(
        currentPost.id,
        currentPost.description,
        currentPost.user.name
      );
    } catch (_error) {
      // User cancelled or error - silent fail
    } finally {
      setShareLoading(false);
    }
  }, [shareLoading, currentPost]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    if (!currentPost) return;
    setShowMenu(false);
    const copied = await copyPostLink(currentPost.id);
    if (copied) {
      showSuccess('Copied!', 'Post link copied to clipboard');
    }
  }, [currentPost, showSuccess]);

  // Report post with anti spam-click
  const handleReport = useCallback(async () => {
    if (reportLoading || !currentPost) return;
    setReportLoading(true);
    try {
      setShowMenu(false);

      // Check if already reported (anti-spam)
      if (hasUserReported(currentPost.id)) {
        showError('Already Reported', 'You have already reported this content. It is under review.');
        return;
      }

      // Check if content is already under review
      if (isUnderReview(currentPost.id)) {
        showError('Under Review', 'This content is already being reviewed by our team.');
        return;
      }

      // Show report modal
      setShowReportModal(true);
    } finally {
      setReportLoading(false);
    }
  }, [reportLoading, currentPost, hasUserReported, isUnderReview, showError]);

  // Submit report to store
  const submitReport = useCallback((reason: string) => {
    if (!currentPost) return;
    setShowReportModal(false);

    // Submit to content store
    const result = storeSubmitReport(currentPost.id, reason);

    if (result.alreadyReported) {
      showError('Already Reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', 'Something went wrong. Please try again.');
    }
  }, [currentPost, storeSubmitReport, showError, showSuccess]);

  // --- Extracted inline handlers ---
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleShowMenu = useCallback(() => setShowMenu(true), []);
  const handleCloseMenu = useCallback(() => setShowMenu(false), []);
  const handleToggleAudioMute = useCallback(() => setIsAudioMuted(prev => !prev), []);
  const handleToggleDescription = useCallback(() => setExpandedDescription(prev => !prev), []);
  const handleExpandFullscreen = useCallback(() => setViewState(VIEW_STATES.FULLSCREEN), []);
  const handleBackToCondensed = useCallback(() => setViewState(VIEW_STATES.CONDENSED), []);
  const handleCloseReportModal = useCallback(() => setShowReportModal(false), []);

  const handleUserPress = useCallback(() => {
    if (!currentPost) return;
    if (currentPost.user.id === currentUserId) {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId: currentPost.user.id });
    }
  }, [currentPost, currentUserId, navigation]);

  const handleViewLikers = useCallback(() => {
    if (currentPost?.id) {
      navigation.navigate('PostLikers', { postId: currentPost.id });
    }
  }, [currentPost?.id, navigation]);

  const handleViewProfile = useCallback(() => {
    setShowMenu(false);
    if (!currentPost) return;
    if (currentPost.user.id === currentUserId) {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId: currentPost.user.id });
    }
  }, [currentPost, currentUserId, navigation]);

  const handleCarouselScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const slideIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setCarouselIndex(slideIndex);
  }, []);

  const handleReportSpam = useCallback(() => submitReport('spam'), [submitReport]);
  const handleReportInappropriate = useCallback(() => submitReport('inappropriate'), [submitReport]);
  const handleReportHarassment = useCallback(() => submitReport('harassment'), [submitReport]);
  const handleReportViolence = useCallback(() => submitReport('violence'), [submitReport]);
  const handleReportOther = useCallback(() => submitReport('other'), [submitReport]);

  // Mute user with anti spam-click
  const handleMute = useCallback(async () => {
    if (muteLoading || !currentPost) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already muted
    if (isUserMuted(userId)) {
      setShowMenu(false);
      showError('Already Muted', 'This user is already muted.');
      return;
    }

    setShowMenu(false);
    showDestructiveConfirm(
      'Mute User',
      'You will no longer see their posts in your feeds.',
      async () => {
        setMuteLoading(true);
        try {
          const { error } = await mute(userId);
          if (error) {
            showError('Error', 'Could not mute this user.');
          } else {
            showSuccess('User Muted', 'You will no longer see their posts.');
          }
        } finally {
          setMuteLoading(false);
        }
      }
    );
  }, [muteLoading, currentPost, isUserMuted, showError, showDestructiveConfirm, mute, showSuccess]);

  // Block user with anti spam-click
  const handleBlock = useCallback(async () => {
    if (blockLoading || !currentPost) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already blocked
    if (isBlocked(userId)) {
      setShowMenu(false);
      showError('Already Blocked', 'This user is already blocked.');
      return;
    }

    setShowMenu(false);
    showDestructiveConfirm(
      'Block User',
      'You will no longer see their posts and they will not be able to interact with you.',
      async () => {
        setBlockLoading(true);
        try {
          const { error } = await block(userId);
          if (error) {
            showError('Error', 'Could not block this user.');
          } else {
            showSuccess('User Blocked', 'You will no longer see their posts.');
          }
        } finally {
          setBlockLoading(false);
        }
      }
    );
  }, [blockLoading, currentPost, isBlocked, showError, showDestructiveConfirm, block, showSuccess]);

  // Navigate to post detail with animation
  const _handleGridPostPress = useCallback((post: GridPost) => {
    const scale = getCardScale(post.id);

    // Press animation
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      navigation.navigate('PostDetailVibesFeed', { postId: post.id, post });
    });
  }, [getCardScale, navigation]);

  // Render modern grid post card
  const renderGridPost = useCallback((post: { id: string; type?: string; thumbnail: string; title?: string; likes?: number; category?: string; height?: number; duration?: string; user?: { id?: string; name?: string; avatar?: string } }, index: number) => {
    const scale = getCardScale(post.id);

    // Convert mock post to format expected by this screen
    const convertedPost = {
      id: post.id,
      type: post.type || 'image',
      media: post.thumbnail,
      thumbnail: post.thumbnail,
      description: post.title || '',
      likes: post.likes || 0,
      views: 0,
      category: post.category || 'Fitness',
      user: {
        id: post.user?.id || 'unknown',
        name: post.user?.name || 'User',
        avatar: post.user?.avatar || null,
        followsMe: false,
      },
    };

    return (
      <Animated.View
        key={`grid-${index}-${post.id}`}
        style={[
          styles.gridCardWrapper,
          { height: post.height, transform: [{ scale }] }
        ]}
      >
        <TouchableOpacity
          style={styles.gridCard}
          activeOpacity={0.9}
          onPressIn={() => {
            Animated.timing(scale, {
              toValue: 0.96,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.timing(scale, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }}
          onPress={() => {
            // Navigate with converted post data - start in condensed mode
            navigation.navigate('PostDetailVibesFeed', {
              postId: convertedPost.id,
              post: convertedPost,
              startCondensed: true
            });
          }}
        >
          <OptimizedImage source={post.thumbnail} style={styles.gridThumbnail} />

          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gridGradient}
          />

          {/* Video duration badge */}
          {post.type === 'video' && post.duration && (
            <View style={styles.durationBadge}>
              <Ionicons name="play" size={10} color="#FFF" />
              <Text style={styles.durationText}>{post.duration}</Text>
            </View>
          )}

          {/* Category tag */}
          {post.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{post.category}</Text>
            </View>
          )}

          {/* Bottom info - simple without blur for better performance */}
          <View style={styles.gridInfo}>
            <View style={styles.gridUserRow}>
              <AvatarImage source={post.user?.avatar} size={22} style={styles.gridAvatar} />
              <Text style={styles.gridUserName} numberOfLines={1}>{post.user?.name}</Text>
            </View>
            <View style={styles.gridStatsRow}>
              <SmuppyHeartIcon size={14} color={colors.heartRed} filled />
              <Text style={styles.gridLikes}>{formatNumber(post.likes ?? 0)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [getCardScale, styles, colors, navigation]);

  // Split grid posts into columns for masonry layout
  const leftColumn = gridPosts.filter((_, i) => i % 2 === 0);
  const rightColumn = gridPosts.filter((_, i) => i % 2 === 1);

  // Guard: if no post data was passed, bail out
  if (!currentPost) return null;

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
            <View style={[styles.fullscreenContainer, styles.fullscreenHeight]}>
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
              ) : currentPost.allMedia && currentPost.allMedia.length > 1 ? (
                <View style={styles.scrollView}>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={handleCarouselScroll}
                  >
                    {currentPost.allMedia.map((mediaUrl, mediaIndex) => (
                      <OptimizedImage
                        key={`${currentPost.id}-media-${mediaIndex}`}
                        source={mediaUrl}
                        style={styles.carouselImage}
                      />
                    ))}
                  </ScrollView>
                  <View style={styles.carouselPagination}>
                    {currentPost.allMedia.map((_, dotIndex) => (
                      <View
                        key={`dot-${dotIndex}`}
                        style={[
                          styles.carouselDot,
                          carouselIndex === dotIndex && styles.carouselDotActive,
                        ]}
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <OptimizedImage source={currentPost.media || currentPost.thumbnail} style={styles.fullscreenMedia} />
              )}

              {/* Gradient overlay */}
              <LinearGradient
                colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradientOverlay}
              />

              {/* Under Review Overlay */}
              {isUnderReview(currentPost.id) && (
                <View style={styles.underReviewOverlay}>
                  <View style={styles.underReviewBadge}>
                    <Ionicons name="alert-circle" size={24} color="#FFF" />
                    <Text style={styles.underReviewText}>Content under review</Text>
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
                  <SmuppyHeartIcon size={100} color={colors.heartRed} filled />
                </Animated.View>
              )}

              {/* Header */}
              <View style={[styles.header, headerPaddingStyle]}>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={handleGoBack}
                >
                  <BlurView intensity={30} tint="dark" style={styles.headerBtnBlur}>
                    <Ionicons name="close" size={24} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={handleShowMenu}
                >
                  <BlurView intensity={30} tint="dark" style={styles.headerBtnBlur}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* Right actions - icons only, no circles */}
              <View style={styles.rightActions}>
                <TouchableOpacity
                  style={[styles.actionBtnSimple, shareLoading && styles.actionBtnDisabled]}
                  onPress={handleShare}
                  disabled={shareLoading}
                >
                  {shareLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="paper-plane-outline" size={28} color="#FFF" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnSimple, likeLoading && styles.actionBtnDisabled]}
                  onPress={toggleLike}
                  disabled={likeLoading}
                >
                  {likeLoading ? (
                    <ActivityIndicator size="small" color={colors.heartRed} />
                  ) : (
                    <SmuppyHeartIcon
                      size={28}
                      color={isLiked ? colors.heartRed : '#FFF'}
                      filled={isLiked}
                    />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnSimple, bookmarkLoading && styles.actionBtnDisabled]}
                  onPress={toggleBookmark}
                  disabled={bookmarkLoading}
                >
                  {bookmarkLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryGreen} />
                  ) : (
                    <Ionicons
                      name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={28}
                      color={isBookmarked ? colors.primaryGreen : '#FFF'}
                    />
                  )}
                </TouchableOpacity>

                {currentPost.type === 'video' && (
                  <TouchableOpacity
                    style={styles.actionBtnSimple}
                    onPress={handleToggleAudioMute}
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
              <View style={[styles.bottomContent, bottomContentPaddingStyle]}>
                {/* User info */}
                <View style={styles.userRow}>
                  <TouchableOpacity
                    style={styles.userInfo}
                    onPress={handleUserPress}
                  >
                    <AvatarImage source={currentPost.user.avatar} size={44} style={styles.avatar} />
                    <View>
                      <Text style={styles.userName}>{currentPost.user.name}</Text>
                      <Text style={styles.userCategory}>{currentPost.category}</Text>
                    </View>
                  </TouchableOpacity>

                  {currentPost.user.id !== currentUserId && !isFan && (
                    <TouchableOpacity
                      style={[styles.fanBtn, fanLoading && styles.fanBtnDisabled]}
                      onPress={becomeFan}
                      disabled={fanLoading}
                    >
                      {fanLoading ? (
                        <ActivityIndicator size="small" color={colors.primaryGreen} />
                      ) : (
                        <>
                          <Ionicons name="add" size={18} color={colors.primaryGreen} />
                          <Text style={styles.fanBtnText}>Fan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Location */}
                {currentPost.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={colors.primary} />
                    <Text style={styles.locationText}>{currentPost.location}</Text>
                  </View>
                ) : null}

                {/* Description */}
                <TouchableOpacity
                  onPress={handleToggleDescription}
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
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={handleViewLikers}
                    activeOpacity={0.7}
                  >
                    <SmuppyHeartIcon size={16} color={colors.heartRed} filled />
                    <Text style={styles.statCount}>{formatNumber(currentPost.likes)}</Text>
                  </TouchableOpacity>
                  <View style={styles.statDot} />
                  <View style={styles.statItem}>
                    <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.statCount}>{formatNumber(currentPost.views || 0)} views</Text>
                  </View>
                </View>

                {/* Swipe indicator */}
                <View style={styles.swipeIndicator}>
                  <View style={styles.swipeBar} />
                  <Text style={styles.swipeText}>Swipe up for more</Text>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        )}

        {/* CONDENSED VIEW */}
        {viewState === VIEW_STATES.CONDENSED && (
          <View style={condensedPaddingStyle}>
            {/* Condensed post at top */}
            <TouchableOpacity
              style={styles.condensedPost}
              activeOpacity={0.95}
              onPress={handleExpandFullscreen}
            >
              <OptimizedImage source={currentPost.thumbnail} style={styles.condensedMedia} />
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.6)']}
                style={styles.condensedGradient}
              />

              <View style={styles.condensedHeader}>
                <TouchableOpacity
                  style={styles.condensedBackBtn}
                  onPress={handleGoBack}
                >
                  <BlurView intensity={30} tint="dark" style={styles.condensedBtnBlur}>
                    <Ionicons name="close" size={22} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
                <TouchableOpacity style={styles.condensedExpandBtn}>
                  <BlurView intensity={30} tint="dark" style={styles.condensedBtnBlur}>
                    <Ionicons name="expand" size={18} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
              </View>

              <View style={styles.condensedInfo}>
                <View style={styles.condensedUser}>
                  <AvatarImage source={currentPost.user.avatar} size={36} style={styles.condensedAvatar} />
                  <View>
                    <Text style={styles.condensedUserName}>{currentPost.user.name}</Text>
                    <Text style={styles.condensedCategory}>{currentPost.category}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.condensedStats}
                  onPress={handleViewLikers}
                  activeOpacity={0.7}
                >
                  <SmuppyHeartIcon size={16} color={colors.heartRed} filled />
                  <Text style={styles.condensedLikes}>{formatNumber(currentPost.likes)}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More to explore</Text>
              <TouchableOpacity style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primaryGreen} />
              </TouchableOpacity>
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

        {/* GRID ONLY VIEW */}
        {viewState === VIEW_STATES.GRID_ONLY && (
          <View style={gridOnlyPaddingStyle}>
            {/* Header */}
            <View style={styles.gridOnlyHeader}>
              <TouchableOpacity
                style={styles.gridBackBtn}
                onPress={handleBackToCondensed}
              >
                <Ionicons name="chevron-up" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.gridOnlyTitle}>Explore</Text>
              <View style={styles.spacer40} />
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
        onRequestClose={handleCloseMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseMenu}
        >
          <BlurView intensity={20} tint="dark" style={styles.menuBlur}>
            <View style={styles.menuContent}>
              <View style={styles.modalHandle} />

              <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
                <View style={styles.menuIconBg}>
                  <Ionicons name="share-social-outline" size={22} color="#FFF" />
                </View>
                <Text style={styles.menuItemText}>Share</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleCopyLink}
              >
                <View style={styles.menuIconBg}>
                  <Ionicons name="link-outline" size={22} color="#FFF" />
                </View>
                <Text style={styles.menuItemText}>Copy Link</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleViewProfile}
              >
                <View style={styles.menuIconBg}>
                  <Ionicons name="person-outline" size={22} color="#FFF" />
                </View>
                <Text style={styles.menuItemText}>View Profile</Text>
              </TouchableOpacity>

              {currentPost.user.id !== currentUserId && (
                <>
                  <View style={styles.menuDivider} />

                  <TouchableOpacity style={styles.menuItem} onPress={handleMute} disabled={muteLoading}>
                    <View style={[styles.menuIconBg, styles.menuIconBgMute]}>
                      <Ionicons name="eye-off-outline" size={22} color="#FFF" />
                    </View>
                    <Text style={styles.menuItemText}>Mute user</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={handleBlock} disabled={blockLoading}>
                    <View style={[styles.menuIconBg, styles.menuIconBgDanger]}>
                      <Ionicons name="ban-outline" size={22} color={colors.heartRed} />
                    </View>
                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block user</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                    <View style={[styles.menuIconBg, styles.menuIconBgDanger]}>
                      <Ionicons name="flag-outline" size={22} color={colors.heartRed} />
                    </View>
                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.menuCancel}
                onPress={handleCloseMenu}
              >
                <Text style={styles.menuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </TouchableOpacity>
      </Modal>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={handleCloseReportModal}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseReportModal}
        >
          <BlurView intensity={20} tint="dark" style={styles.menuBlur}>
            <View style={styles.menuContent}>
              <View style={styles.modalHandle} />
              <Text style={styles.reportTitle}>Report this post</Text>
              <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleReportSpam}
              >
                <Text style={styles.reportOptionText}>Spam or misleading</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleReportInappropriate}
              >
                <Text style={styles.reportOptionText}>Inappropriate content</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleReportHarassment}
              >
                <Text style={styles.reportOptionText}>Harassment or bullying</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleReportViolence}
              >
                <Text style={styles.reportOptionText}>Violence or dangerous</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportOption}
                onPress={handleReportOther}
              >
                <Text style={styles.reportOptionText}>Other</Text>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuCancel}
                onPress={handleCloseReportModal}
              >
                <Text style={styles.menuCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },

  // Fullscreen
  fullscreenContainer: {
    width: width,
    position: 'relative',
  },
  fullscreenHeight: {
    height: height,
  },
  fullscreenMedia: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  carouselImage: {
    width: width,
    height: '100%',
  },
  carouselPagination: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  carouselDotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
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
    overflow: 'hidden',
    borderRadius: 22,
  },
  headerBtnBlur: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Right actions
  rightActions: {
    position: 'absolute',
    right: 12,
    bottom: 140,
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  actionBtnBlur: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  actionBtnSimple: {
    padding: 8,
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
    paddingHorizontal: 16,
    paddingBottom: 20,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  userCategory: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  fanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.primaryGreen,
    gap: 4,
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryGreen,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  locationText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    marginBottom: 12,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  statCount: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },

  // Swipe indicator
  swipeIndicator: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 8,
  },
  swipeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },

  // Condensed post
  condensedPost: {
    height: CONDENSED_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  condensedMedia: {
    width: '100%',
    height: '100%',
  },
  condensedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  condensedHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  condensedBackBtn: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  condensedExpandBtn: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  condensedBtnBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  condensedInfo: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  condensedUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  condensedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  condensedUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  condensedCategory: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  condensedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  condensedLikes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryGreen,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  masonryColumn: {
    flex: 1,
    gap: GRID_GAP,
  },
  gridCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  gridCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  gridGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  durationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(14,191,138,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  gridInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingTop: 20,
  },
  gridUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gridAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  gridUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gridStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLikes: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOnlyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  spacer40: {
    width: 40,
  },

  // Modal handle
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },

  // Menu Modal
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  menuBlur: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  menuContent: {
    paddingBottom: 34,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  menuIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconBgMute: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  menuIconBgDanger: {
    backgroundColor: 'rgba(255,107,107,0.2)',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFF',
  },
  menuItemTextDanger: {
    color: colors.heartRed,
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 8,
    marginHorizontal: 20,
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },

  // Report modal
  reportTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  reportSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
  reportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  reportOptionText: {
    fontSize: 16,
    color: '#FFF',
  },
});

export default PostDetailVibesFeedScreen;
