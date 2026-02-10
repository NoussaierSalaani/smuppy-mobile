import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Modal,
  Animated,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { resolveDisplayName } from '../../types/profile';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import DoubleTapLike from '../../components/DoubleTapLike';
import { useContentStore, useUserSafetyStore, useUserStore, useFeedStore } from '../../stores';
import { sharePost, copyPostLink } from '../../utils/share';
import { followUser, isFollowing, likePost, unlikePost, hasLikedPost, savePost, unsavePost, hasSavedPost, recordPostView, getPostById } from '../../services/database';
import { isValidUUID, formatNumber } from '../../utils/formatters';

const { width, height } = Dimensions.get('window');

// Post type for this screen
interface TaggedUser {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

interface FanFeedPost {
  id: string;
  type: 'video' | 'image' | 'carousel';
  media: string;
  allMedia?: string[]; // All media URLs for carousel posts
  thumbnail: string;
  description: string;
  likes: number;
  views?: number;
  comments?: number;
  location?: string | null;
  taggedUsers?: TaggedUser[];
  user: {
    id: string;
    name: string;
    avatar: string;
    followsMe: boolean;
  };
}

// Loading state record type
type LoadingRecord = Record<string, boolean>;

const PostDetailFanFeedScreen = () => {
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
  const params = (route.params as { postId?: string; fanFeedPosts?: FanFeedPost[] }) || {};
  const { postId, fanFeedPosts: passedPosts = [] } = params;

  // When navigated from notifications (only postId, no fanFeedPosts), fetch the post by ID
  const [fetchedPosts, setFetchedPosts] = useState<FanFeedPost[]>([]);
  const [fetchingPost, setFetchingPost] = useState(false);

  useEffect(() => {
    if (passedPosts.length > 0 || !postId || !isValidUUID(postId)) return;

    let mounted = true;
    setFetchingPost(true);
    getPostById(postId).then(({ data: post }) => {
      if (!mounted || !post) {
        if (mounted) setFetchingPost(false);
        return;
      }
      // Transform database Post to FanFeedPost format
      const mediaUrls = post.media_urls || (post.media_url ? [post.media_url] : []);
      const firstMedia = mediaUrls[0] || '';
      const mediaType = post.media_type === 'video' ? 'video'
        : mediaUrls.length > 1 ? 'carousel' : 'image';

      const fanPost: FanFeedPost = {
        id: post.id,
        type: mediaType as FanFeedPost['type'],
        media: firstMedia,
        allMedia: mediaUrls.length > 1 ? mediaUrls : undefined,
        thumbnail: firstMedia,
        description: post.content || post.caption || '',
        likes: post.likes_count || 0,
        views: post.views_count || 0,
        comments: post.comments_count || 0,
        location: post.location || null,
        taggedUsers: Array.isArray(post.tagged_users)
          ? post.tagged_users.filter((t): t is { id: string; username: string; fullName?: string | null; avatarUrl?: string | null } => typeof t === 'object' && t !== null && 'id' in t)
          : undefined,
        user: {
          id: post.author?.id || post.author_id,
          name: resolveDisplayName(post.author),
          avatar: post.author?.avatar_url || '',
          followsMe: post.author?.is_followed_by || false,
        },
      };
      setFetchedPosts([fanPost]);
      setFetchingPost(false);
    }).catch(() => {
      if (mounted) setFetchingPost(false);
    });
    return () => { mounted = false; };
  }, [postId, passedPosts.length]);

  // Use passed posts if available, otherwise use fetched post
  const fanFeedPosts = passedPosts.length > 0 ? passedPosts : fetchedPosts;

  // Find the correct post index - findIndex returns -1 if not found
  const foundIndex = fanFeedPosts.findIndex(p => p.id === postId);
  const initialIndex = foundIndex >= 0 ? foundIndex : 0;

  // States
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});
  const [fanStatus, setFanStatus] = useState<Record<string, boolean>>({}); // { odId: true/false }
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({}); // Track carousel slide index per post

  // Loading states for anti spam-click
  const [likeLoading, setLikeLoading] = useState<LoadingRecord>({});
  const [bookmarkLoading, setBookmarkLoading] = useState<LoadingRecord>({});
  const [fanLoading, setFanLoading] = useState<LoadingRecord>({});
  const [fanStatusChecking, setFanStatusChecking] = useState<Record<string, boolean>>({}); // Track which users we're checking
  const [shareLoading, setShareLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  
  // Minimum index (cannot scroll above the initial post)
  const minIndex = initialIndex >= 0 ? initialIndex : 0;
  
  // Refs
  const videoRef = useRef<Video>(null);
  const flatListRef = useRef<React.ElementRef<typeof FlashList<FanFeedPost>>>(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const viewedPosts = useRef<Set<string>>(new Set());
  
  // Current post - with bounds check to prevent crash on empty array
  const currentPost = fanFeedPosts.length > 0 && currentIndex < fanFeedPosts.length
    ? fanFeedPosts[currentIndex]
    : null;

  // Check if already fan of current post user (with null check)
  const _isAlreadyFan = currentPost ? fanStatus[currentPost.user.id] === true : false;
  const _theyFollowMe = currentPost?.user.followsMe ?? false;


  // Check follow status when post changes
  useEffect(() => {
    const checkFollowStatus = async () => {
      const userId = currentPost?.user?.id;
      if (userId && userId !== currentUserId && fanStatus[userId] === undefined && !fanStatusChecking[userId]) {
        // Mark as checking to prevent flicker
        setFanStatusChecking(prev => ({ ...prev, [userId]: true }));
        try {
          if (!isValidUUID(userId)) {
            setFanStatus(prev => ({ ...prev, [userId]: false }));
          } else {
            const { following } = await isFollowing(userId);
            setFanStatus(prev => ({ ...prev, [userId]: following || false }));
          }
        } finally {
          setFanStatusChecking(prev => ({ ...prev, [userId]: false }));
        }
      }
    };
    checkFollowStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.user?.id, fanStatus, fanStatusChecking]);

  // Check like/bookmark status when post changes
  useEffect(() => {
    const checkPostStatus = async () => {
      const postIdVal = currentPost?.id;
      if (!postIdVal || !isValidUUID(postIdVal)) return;

      // Only check if we haven't already checked this post
      if (likedPosts[postIdVal] === undefined) {
        const { hasLiked } = await hasLikedPost(postIdVal);
        if (hasLiked) {
          setLikedPosts(prev => ({ ...prev, [postIdVal]: true }));
        }
      }

      if (bookmarkedPosts[postIdVal] === undefined) {
        const { saved } = await hasSavedPost(postIdVal);
        if (saved) {
          setBookmarkedPosts(prev => ({ ...prev, [postIdVal]: true }));
        }
      }
    };
    checkPostStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.id]);

  // Record post view (deduped per session)
  useEffect(() => {
    if (!currentPost?.id || !isValidUUID(currentPost.id)) return;
    if (viewedPosts.current.has(currentPost.id)) return;

    viewedPosts.current.add(currentPost.id);
    setLocalViews(prev => ({ ...prev, [currentPost.id]: (currentPost.views || 0) + 1 }));
    recordPostView(currentPost.id);
  }, [currentPost?.id, currentPost?.views]);

  // Navigate to user profile (own profile → Profile tab, others → UserProfile)
  const navigateToProfile = useCallback((userId: string) => {
    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Cannot navigate - invalid userId:', userId);
      return;
    }
    if (userId === currentUserId) {
      navigation.navigate('ProfileTab' as never);
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  }, [currentUserId, navigation]);

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
  const toggleLike = useCallback(async (pId: string) => {
    if (likeLoading[pId]) return;

    if (!isValidUUID(pId)) {
      // For mock data, use local state only
      setLikedPosts(prev => ({ ...prev, [pId]: !prev[pId] }));
      if (!likedPosts[pId]) {
        triggerLikeAnimation();
      }
      return;
    }

    setLikeLoading(prev => ({ ...prev, [pId]: true }));
    try {
      const isCurrentlyLiked = likedPosts[pId];
      if (isCurrentlyLiked) {
        const { error } = await unlikePost(pId);
        if (!error) {
          setLikedPosts(prev => ({ ...prev, [pId]: false }));
          useFeedStore.getState().toggleLikeOptimistic(pId, false);
        }
      } else {
        const { error } = await likePost(pId);
        if (!error) {
          setLikedPosts(prev => ({ ...prev, [pId]: true }));
          useFeedStore.getState().toggleLikeOptimistic(pId, true);
          triggerLikeAnimation();
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Like error:', error);
    } finally {
      setLikeLoading(prev => ({ ...prev, [pId]: false }));
    }
  }, [likeLoading, likedPosts, triggerLikeAnimation]);

  // Toggle bookmark with anti spam-click - connected to database
  const toggleBookmark = useCallback(async (pId: string) => {
    if (bookmarkLoading[pId]) return;

    if (!isValidUUID(pId)) {
      // For mock data, use local state only
      setBookmarkedPosts(prev => ({ ...prev, [pId]: !prev[pId] }));
      return;
    }

    setBookmarkLoading(prev => ({ ...prev, [pId]: true }));
    try {
      const isCurrentlySaved = bookmarkedPosts[pId];
      if (isCurrentlySaved) {
        const { error } = await unsavePost(pId);
        if (!error) {
          setBookmarkedPosts(prev => ({ ...prev, [pId]: false }));
          showSuccess('Removed', 'Post removed from saved.');
        }
      } else {
        const { error } = await savePost(pId);
        if (!error) {
          setBookmarkedPosts(prev => ({ ...prev, [pId]: true }));
          showSuccess('Saved', 'Post added to your collection.');
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Bookmark error:', error);
    } finally {
      setBookmarkLoading(prev => ({ ...prev, [pId]: false }));
    }
  }, [bookmarkLoading, bookmarkedPosts, showSuccess]);

  // Become fan with anti spam-click - using real database
  const becomeFan = useCallback(async (userId: string) => {
    if (!isValidUUID(userId) || fanLoading[userId]) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Invalid userId:', userId);
      return;
    }
    setFanLoading(prev => ({ ...prev, [userId]: true }));
    try {
      const { error } = await followUser(userId);
      if (!error) {
        setFanStatus(prev => ({ ...prev, [userId]: true }));
      } else {
        if (__DEV__) console.warn('[PostDetailFanFeed] Follow error:', error);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Follow error:', error);
    } finally {
      setFanLoading(prev => ({ ...prev, [userId]: false }));
    }
  }, [fanLoading]);

  // Handle scroll - prevents scrolling above the initial post
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const newIndex = Math.round(offsetY / height);

    // Prevent scrolling above the initial post
    if (newIndex < minIndex) {
      flatListRef.current?.scrollToIndex({
        index: minIndex,
        animated: true,
      });
    }
  }, [minIndex]);

  // Handle swipe to next/prev post
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;

      // Do not go above minIndex
      if (newIndex !== null && newIndex !== undefined && newIndex >= minIndex) {
        setCurrentIndex(newIndex);
        setIsPaused(false);
        setExpandedDescription(false);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemType = useCallback((item: FanFeedPost) => {
    if (item.allMedia && item.allMedia.length > 1) return 'carousel';
    return item.type === 'video' ? 'video' : 'image';
  }, []);

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
  const handleCloseReportModal = useCallback(() => setShowReportModal(false), []);

  const handleViewProfile = useCallback(() => {
    if (!currentPost) return;
    setShowMenu(false);
    navigateToProfile(currentPost.user.id);
  }, [currentPost, navigateToProfile]);

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
      'Mute this user?',
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
      'Block this user?',
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
  

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Dynamic styles depending on insets
  const headerPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);
  const bottomContentPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 10 }), [insets.bottom]);

  // Stable keyExtractor for FlashList
  const keyExtractor = useCallback((item: FanFeedPost) => item.id, []);

  // Render post item
  const renderPostItem = useCallback(({ item, index }: { item: FanFeedPost; index: number }) => {
    const isLiked = likedPosts[item.id];
    const isBookmarked = bookmarkedPosts[item.id];
    const isOwnPost = item.user.id === currentUserId;
    const isFanOfUser = fanStatus[item.user.id];
    const isCheckingFanStatus = fanStatusChecking[item.user.id] || fanStatus[item.user.id] === undefined;
    const userFollowsMe = item.user.followsMe;
    const postUnderReview = isUnderReview(item.id);

    return (
      <DoubleTapLike
        onDoubleTap={() => { if (!likedPosts[item.id]) toggleLike(item.id); }}
        onSingleTap={() => { if (item.type === 'video') setIsPaused(prev => !prev); }}
        showAnimation={false}
      >
        <View style={[styles.postContainer, styles.postContainerHeight]}>
          {/* Under Review Overlay */}
          {postUnderReview && (
            <View style={styles.underReviewOverlay}>
              <View style={styles.underReviewBadge}>
                <Ionicons name="alert-circle" size={24} color="#FFF" />
                <Text style={styles.underReviewText}>Content under review</Text>
              </View>
            </View>
          )}

          {/* Media */}
          {item.type === 'video' ? (
            <Video
              ref={index === currentIndex ? videoRef : null}
              source={{ uri: item.media }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={isAudioMuted}
              shouldPlay={index === currentIndex && !isPaused}
              posterSource={{ uri: item.thumbnail }}
              usePoster
            />
          ) : item.allMedia && item.allMedia.length > 1 ? (
            // Carousel with multiple images
            <View style={styles.carouselContainer}>
              <ScrollView
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const slideIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                  setCarouselIndexes(prev => ({ ...prev, [item.id]: slideIndex }));
                }}
              >
                {item.allMedia.map((mediaUrl, mediaIndex) => (
                  <OptimizedImage
                    key={`${item.id}-media-${mediaIndex}`}
                    source={mediaUrl}
                    style={styles.carouselImage}
                  />
                ))}
              </ScrollView>
              {/* Carousel pagination dots */}
              <View style={styles.carouselPagination}>
                {item.allMedia.map((_, dotIndex) => (
                  <View
                    key={`dot-${dotIndex}`}
                    style={[
                      styles.carouselDot,
                      (carouselIndexes[item.id] || 0) === dotIndex && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
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
              <SmuppyHeartIcon size={100} color={colors.heartRed} filled />
            </Animated.View>
          )}

          {/* Header */}
          <View style={[styles.header, headerPaddingStyle]}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleGoBack}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleShowMenu}
              accessibilityLabel="Open menu"
              accessibilityRole="button"
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
              accessibilityLabel="Share post"
              accessibilityRole="button"
            >
              {shareLoading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="share-social-outline" size={24} color="#FFF" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, likeLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleLike(item.id)}
              disabled={likeLoading[item.id]}
              accessibilityLabel={isLiked ? 'Unlike this post' : 'Like this post'}
              accessibilityRole="button"
              accessibilityState={{ selected: isLiked }}
            >
              {likeLoading[item.id] ? (
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
              style={[styles.actionBtn, bookmarkLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleBookmark(item.id)}
              disabled={bookmarkLoading[item.id]}
              accessibilityLabel={isBookmarked ? 'Remove from saved' : 'Save this post'}
              accessibilityRole="button"
              accessibilityState={{ selected: isBookmarked }}
            >
              {bookmarkLoading[item.id] ? (
                <ActivityIndicator size="small" color={colors.primaryGreen} />
              ) : (
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={28}
                  color={isBookmarked ? colors.primaryGreen : '#FFF'}
                />
              )}
            </TouchableOpacity>

            {item.type === 'video' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleToggleAudioMute}
                accessibilityLabel={isAudioMuted ? 'Unmute audio' : 'Mute audio'}
                accessibilityRole="button"
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
                onPress={() => navigateToProfile(item.user.id)}
              >
                <AvatarImage source={item.user.avatar} size={40} style={styles.avatar} />
                <Text style={styles.userName}>{item.user.name}</Text>
              </TouchableOpacity>

              {/* Fan button logic:
                  - Checking fan status → no button (prevents flicker)
                  - Already a fan → no button
                  - Not a fan + they follow me → "Track"
                  - Not a fan + they don't follow me → "+ Fan"
              */}
              {!isOwnPost && !isCheckingFanStatus && !isFanOfUser && (
                <TouchableOpacity
                  style={[styles.fanBtn, fanLoading[item.user.id] && styles.fanBtnDisabled]}
                  onPress={() => becomeFan(item.user.id)}
                  disabled={fanLoading[item.user.id]}
                >
                  {fanLoading[item.user.id] ? (
                    <ActivityIndicator size="small" color={colors.primaryGreen} />
                  ) : (
                    <>
                      {!userFollowsMe && (
                        <Ionicons name="add" size={16} color={colors.primaryGreen} />
                      )}
                      <Text style={styles.fanBtnText}>
                        {userFollowsMe ? 'Track' : 'Fan'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Location */}
            {item.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color={colors.primary} />
                <Text style={styles.locationText}>{item.location}</Text>
              </View>
            ) : null}

            {/* Tagged Users */}
            {item.taggedUsers && item.taggedUsers.length > 0 ? (
              <View style={styles.taggedRow}>
                <Ionicons name="people" size={14} color={colors.primary} />
                <Text style={styles.taggedText}>
                  {item.taggedUsers.map(t => t.fullName || t.username || 'User').join(', ')}
                </Text>
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
                {item.description}
                {!expandedDescription && item.description.length > 80 && (
                  <Text style={styles.moreText}> ...more</Text>
                )}
              </Text>
            </TouchableOpacity>

            {/* Stats bar */}
            <View style={styles.statsBar}>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => navigation.navigate('PostLikers', { postId: item.id })}
                activeOpacity={0.7}
              >
                <SmuppyHeartIcon size={18} color={colors.heartRed} filled />
                <Text style={styles.statCount}>{formatNumber(item.likes)}</Text>
              </TouchableOpacity>
              <View style={styles.statItem}>
                <Ionicons name="eye-outline" size={18} color="#FFF" />
                <Text style={styles.statCount}>{formatNumber(localViews[item.id] ?? item.views ?? 0)}</Text>
              </View>
            </View>
          </View>
        </View>
      </DoubleTapLike>
    );
  }, [likedPosts, bookmarkedPosts, currentUserId, fanStatus, fanStatusChecking, isUnderReview,
      currentIndex, isAudioMuted, isPaused, carouselIndexes, showLikeAnimation, localViews,
      likeAnimationScale, shareLoading, handleShare, likeLoading, toggleLike, bookmarkLoading,
      toggleBookmark, fanLoading, becomeFan, navigateToProfile, expandedDescription,
      styles, colors, navigation, bottomContentPaddingStyle, handleGoBack, handleShowMenu,
      handleToggleAudioMute, handleToggleDescription, headerPaddingStyle]);

  // Early return for empty posts array (show loading if still fetching)
  if (fanFeedPosts.length === 0) {
    return (
      <View style={[styles.container, styles.emptyStateContainer]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[styles.header, headerPaddingStyle]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={handleGoBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        {fetchingPost ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <Ionicons name="images-outline" size={64} color={colors.gray} />
            <Text style={styles.emptyStateText}>No posts available</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Posts FlashList (vertical scroll) */}
      <FlashList<FanFeedPost>
        ref={flatListRef}
        data={fanFeedPosts}
        renderItem={renderPostItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        initialScrollIndex={initialIndex >= 0 ? initialIndex : 0}
      />
      
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
          <View style={styles.menuContent}>
            <View style={styles.modalHandle} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShare}
              accessibilityLabel="Share post"
              accessibilityRole="button"
            >
              <Ionicons name="share-social-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCopyLink}
              accessibilityLabel="Copy post link"
              accessibilityRole="button"
            >
              <Ionicons name="link-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleViewProfile}
              accessibilityLabel="View user profile"
              accessibilityRole="button"
            >
              <Ionicons name="person-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>

            {currentPost && currentPost.user.id !== currentUserId && (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleMute}
                  disabled={muteLoading}
                  accessibilityLabel="Mute this user"
                  accessibilityRole="button"
                  accessibilityHint="Hide content from this user"
                >
                  <Ionicons name="eye-off-outline" size={24} color="#FFF" />
                  <Text style={styles.menuItemText}>Mute user</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleBlock}
                  disabled={blockLoading}
                  accessibilityLabel="Block this user"
                  accessibilityRole="button"
                  accessibilityHint="Block all interactions with this user"
                >
                  <Ionicons name="ban-outline" size={24} color={colors.heartRed} />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block user</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReport}
              accessibilityLabel="Report this post"
              accessibilityRole="button"
              accessibilityHint="Report inappropriate content"
            >
              <Ionicons name="flag-outline" size={24} color={colors.heartRed} />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={handleCloseMenu}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
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
        onRequestClose={handleCloseReportModal}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseReportModal}
        >
          <View style={styles.menuContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.reportTitle}>Report this post</Text>
            <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleReportSpam}
            >
              <Text style={styles.reportOptionText}>Spam or misleading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleReportInappropriate}
            >
              <Text style={styles.reportOptionText}>Inappropriate content</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleReportHarassment}
            >
              <Text style={styles.reportOptionText}>Harassment or bullying</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleReportViolence}
            >
              <Text style={styles.reportOptionText}>Violence or dangerous</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={handleReportOther}
            >
              <Text style={styles.reportOptionText}>Other</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={handleCloseReportModal}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
  emptyStateContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.gray,
    marginTop: 16,
    fontSize: 16,
  },
  postContainer: {
    width: width,
    position: 'relative',
  },
  postContainerHeight: {
    height: height,
  },
  media: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  // Carousel styles
  carouselContainer: {
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
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  carouselDotActive: {
    backgroundColor: '#FFFFFF',
    width: 8,
    height: 8,
    borderRadius: 4,
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

  // User row
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
    borderColor: colors.primaryGreen,
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
    color: colors.primaryGreen,
  },
  
  // Location
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

  // Tagged users
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  taggedText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    flex: 1,
  },

  // Description
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 18,
    marginBottom: 6,
  },
  moreText: {
    color: colors.gray,
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
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

  // Modal handle
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
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
    backgroundColor: colors.backgroundSecondary,
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
  menuItemTextDanger: {
    color: colors.heartRed,
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.border,
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
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 20,
  },
  reportOption: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reportOptionText: {
    fontSize: 16,
    color: '#FFF',
  },
});

export default PostDetailFanFeedScreen;
