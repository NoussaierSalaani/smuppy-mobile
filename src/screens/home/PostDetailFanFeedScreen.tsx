import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  StatusBar,
  Animated,
  ActivityIndicator,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { normalizeCdnUrl } from '../../utils/cdnUrl';

import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import SharePostModal from '../../components/SharePostModal';
import PostMenuModal from '../../components/PostMenuModal';
import { usePostDetailActions } from '../../hooks/usePostDetailActions';
import { followUser, isFollowing, likePost, hasLikedPost, savePost, unsavePost, hasSavedPost } from '../../services/database';
import { isValidUUID, formatNumber } from '../../utils/formatters';
import { resolveDisplayName } from '../../types/profile';

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

  const currentUserId = useUserStore((state) => state.user?.id);

  // Params
  const params = (route.params as { postId?: string; fanFeedPosts?: FanFeedPost[] }) || {};
  const { postId, fanFeedPosts = [] } = params;
  // Find the correct post index - findIndex returns -1 if not found
  const foundIndex = fanFeedPosts.findIndex(p => p.id === postId);
  const initialIndex = foundIndex >= 0 ? foundIndex : 0;

  // States
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({}); // Track carousel slide index per post

  // Minimum index (cannot scroll above the initial post)
  const minIndex = initialIndex >= 0 ? initialIndex : 0;

  // Current post - with bounds check to prevent crash on empty array
  const currentPost = fanFeedPosts.length > 0 && currentIndex < fanFeedPosts.length
    ? fanFeedPosts[currentIndex]
    : null;

  // --- Shared actions hook (menu, report, mute, block, delete, share, copy-link, view-profile, like animation) ---
  const actions = usePostDetailActions({
    currentPost,
    logTag: 'PostDetailFanFeed',
  });

  // --- Per-post state (FanFeed scrolls through multiple posts, needs Records) ---
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});
  const [fanStatus, setFanStatus] = useState<Record<string, boolean>>({}); // { odId: true/false }
  const [localLikes, setLocalLikes] = useState<Record<string, number>>({});

  // Loading states for anti spam-click
  const likeLoadingRef = useRef(new Set<string>());
  const [likeLoadingState, setLikeLoadingState] = useState<LoadingRecord>({}); // visual indicator only
  const [bookmarkLoading, setBookmarkLoading] = useState<LoadingRecord>({});
  const [fanLoading, setFanLoading] = useState<LoadingRecord>({});
  const [fanStatusChecking, setFanStatusChecking] = useState<Record<string, boolean>>({}); // Track which users we're checking

  // Refs
  const videoRef = useRef<Video>(null);
  const flatListRef = useRef<React.ElementRef<typeof FlashList<FanFeedPost>>>(null);
  const lastTap = useRef(0);

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
            setFanStatus(prev => ({ ...prev, [userId]: !!following }));
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

  // Navigate to user profile (own profile -> Profile tab, others -> UserProfile)
  const navigateToProfile = useCallback((userId: string) => {
    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Cannot navigate - invalid userId:', userId);
      return;
    }
    if (userId === currentUserId) {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  }, [currentUserId, navigation]);

  // Toggle like with anti spam-click (ref-based guard) - connected to database
  const toggleLike = useCallback(async (pId: string) => {
    if (likeLoadingRef.current.has(pId)) return;

    if (!isValidUUID(pId)) {
      // For mock data, use local state only
      setLikedPosts(prev => ({ ...prev, [pId]: !prev[pId] }));
      if (!likedPosts[pId]) {
        actions.triggerLikeAnimation();
      }
      return;
    }

    likeLoadingRef.current.add(pId);
    setLikeLoadingState(prev => ({ ...prev, [pId]: true }));
    const isCurrentlyLiked = likedPosts[pId];
    const currentItem = fanFeedPosts.find((p: FanFeedPost) => p.id === pId);
    const currentLikes = localLikes[pId] ?? currentItem?.likes ?? 0;

    // Optimistic update
    const newLiked = !isCurrentlyLiked;
    setLikedPosts(prev => ({ ...prev, [pId]: newLiked }));
    setLocalLikes(prev => ({ ...prev, [pId]: newLiked ? currentLikes + 1 : Math.max(currentLikes - 1, 0) }));
    if (newLiked) actions.triggerLikeAnimation();

    try {
      const { error } = await likePost(pId);
      if (error) {
        // Revert on error
        setLikedPosts(prev => ({ ...prev, [pId]: isCurrentlyLiked }));
        setLocalLikes(prev => ({ ...prev, [pId]: currentLikes }));
      } else {
        useFeedStore.getState().toggleLikeOptimistic(pId, newLiked);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Like error:', error);
      setLikedPosts(prev => ({ ...prev, [pId]: isCurrentlyLiked }));
      setLocalLikes(prev => ({ ...prev, [pId]: currentLikes }));
    } finally {
      likeLoadingRef.current.delete(pId);
      setLikeLoadingState(prev => ({ ...prev, [pId]: false }));
    }
  }, [likedPosts, localLikes, fanFeedPosts, actions]);

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
        }
      } else {
        const { error } = await savePost(pId);
        if (!error) {
          setBookmarkedPosts(prev => ({ ...prev, [pId]: true }));
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailFanFeed] Bookmark error:', error);
    } finally {
      setBookmarkLoading(prev => ({ ...prev, [pId]: false }));
    }
  }, [bookmarkLoading, bookmarkedPosts]);

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

  // Double tap to like (per-post version)
  const handleDoubleTap = useCallback(() => {
    if (!currentPost) return;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - Like (only if not already liked)
      if (!likedPosts[currentPost.id]) {
        toggleLike(currentPost.id); // Call API to persist the like
      }
    } else {
      // Single tap - toggle pause/play for video
      if (currentPost.type === 'video') {
        actions.setIsPaused(prev => !prev);
      }
    }
    lastTap.current = now;
  }, [currentPost, likedPosts, toggleLike, actions]);

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

  // Track minIndex in a ref so the stable onViewableItemsChanged callback
  // always reads the latest value without recreating the function reference
  const minIndexRef = useRef(minIndex);
  minIndexRef.current = minIndex;

  // Handle swipe to next/prev post (stable ref -- FlashList requires unchanging reference)
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;

      // Do not go above minIndex
      if (newIndex != null && newIndex >= minIndexRef.current) {
        setCurrentIndex(newIndex);
        // Reset pause & description on scroll
        // Using the setter form to avoid dependency on actions
        setExpandedDescriptionLocal(false);
      }
    }
  }).current;

  // Local expanded description state for FanFeed (since onViewableItemsChanged is stable ref)
  const [expandedDescriptionLocal, setExpandedDescriptionLocal] = useState(false);
  const handleToggleDescriptionLocal = useCallback(() => setExpandedDescriptionLocal(prev => !prev), []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getItemType = useCallback((item: FanFeedPost) => {
    if (item.allMedia && item.allMedia.length > 1) return 'carousel';
    return item.type === 'video' ? 'video' : 'image';
  }, []);

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
    const postUnderReview = actions.isUnderReview(item.id);

    return (
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
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
              source={{ uri: normalizeCdnUrl(item.media) || '' }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={actions.isAudioMuted}
              shouldPlay={index === currentIndex && !actions.isPaused}
              posterSource={{ uri: normalizeCdnUrl(item.thumbnail) || '' }}
              usePoster
            />
          ) : item.allMedia && item.allMedia.length > 1 ? (
            // Carousel with FlatList (lazy rendering, better perf than ScrollView)
            <View style={styles.carouselContainer}>
              <FlatList
                horizontal
                pagingEnabled
                data={item.allMedia}
                keyExtractor={(mediaUrl, mediaIndex) => `${item.id}-media-${mediaIndex}`}
                renderItem={({ item: mediaUrl }) => (
                  <OptimizedImage source={mediaUrl} style={styles.carouselImage} />
                )}
                showsHorizontalScrollIndicator={false}
                getItemLayout={(_, layoutIndex) => ({ length: width, offset: width * layoutIndex, index: layoutIndex })}
                onMomentumScrollEnd={(e) => {
                  const slideIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                  setCarouselIndexes(prev => ({ ...prev, [item.id]: slideIndex }));
                }}
              />
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
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradientOverlay}
          />

          {/* Like animation */}
          {actions.showLikeAnimation && index === currentIndex && (
            <Animated.View
              style={[
                styles.likeAnimation,
                {
                  transform: [{ scale: actions.likeAnimationScale }],
                  opacity: actions.likeAnimationScale,
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
              onPress={actions.handleGoBack}
              accessibilityLabel="Back"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={actions.handleShowMenu}
              accessibilityLabel="Menu"
              accessibilityRole="button"
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Right actions */}
          <View style={styles.rightActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={actions.handleShare}
              accessibilityLabel="Send"
              accessibilityRole="button"
            >
              <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, likeLoadingState[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleLike(item.id)}
              disabled={likeLoadingState[item.id]}
              accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
              accessibilityRole="button"
              accessibilityState={{ selected: isLiked }}
            >
              {likeLoadingState[item.id] ? (
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
              accessibilityLabel={isBookmarked ? 'Unsave' : 'Save'}
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
                onPress={actions.handleToggleAudioMute}
                accessibilityLabel={actions.isAudioMuted ? 'Unmute' : 'Mute'}
                accessibilityRole="button"
              >
                <Ionicons
                  name={actions.isAudioMuted ? 'volume-mute' : 'volume-high'}
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
                  - Checking fan status -> no button (prevents flicker)
                  - Already a fan -> no button
                  - Not a fan + they follow me -> "Track"
                  - Not a fan + they don't follow me -> "+ Fan"
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
                  {item.taggedUsers.filter(u => u != null).map(taggedUser => resolveDisplayName(taggedUser)).join(', ')}
                </Text>
              </View>
            ) : null}

            {/* Description */}
            <TouchableOpacity
              onPress={handleToggleDescriptionLocal}
              activeOpacity={0.8}
            >
              <Text
                style={styles.description}
                numberOfLines={expandedDescriptionLocal ? undefined : 2}
              >
                {item.description}
                {!expandedDescriptionLocal && item.description.length > 80 && (
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
                <Text style={styles.statCount}>{formatNumber(localLikes[item.id] ?? item.likes)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }, [likedPosts, bookmarkedPosts, localLikes, currentUserId, fanStatus, fanStatusChecking, actions,
      handleDoubleTap, currentIndex, carouselIndexes,
      likeLoadingState, toggleLike, bookmarkLoading,
      toggleBookmark, fanLoading, becomeFan, navigateToProfile, expandedDescriptionLocal,
      styles, colors, navigation, bottomContentPaddingStyle,
      handleToggleDescriptionLocal, headerPaddingStyle]);

  // Early return for empty posts array
  if (fanFeedPosts.length === 0) {
    return (
      <View style={[styles.container, styles.emptyStateContainer]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={[styles.header, headerPaddingStyle]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={actions.handleGoBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Ionicons name="images-outline" size={64} color={colors.gray} />
        <Text style={styles.emptyStateText}>No posts available</Text>
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
        {...{ estimatedItemSize: height } as Record<string, number>}
      />

      {/* Post Menu + Report Modal */}
      <PostMenuModal
        visible={actions.showMenu}
        onClose={actions.handleCloseMenu}
        post={currentPost ? { id: currentPost.id, authorId: currentPost.user.id } : null}
        isOwnPost={!!currentPost && currentPost.user.id === currentUserId}
        onDelete={actions.handleDeletePost}
        onShare={actions.handleShare}
        onCopyLink={actions.handleCopyLink}
        onViewProfile={actions.handleViewProfile}
        onMute={actions.handleMute}
        onBlock={actions.handleBlock}
        onReport={actions.handleReport}
        hasReported={currentPost ? actions.hasUserReported(currentPost.id) : false}
        isUnderReview={currentPost ? actions.isUnderReview(currentPost.id) : false}
      />

      <SharePostModal
        visible={actions.shareModal.isVisible}
        content={actions.shareModal.data}
        onClose={actions.shareModal.close}
      />
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

});

export default PostDetailFanFeedScreen;
