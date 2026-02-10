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
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useQueryClient } from '@tanstack/react-query';
import {
  followUser,
  isFollowing,
  likePost,
  unlikePost,
  hasLikedPost,
  savePost,
  unsavePost,
  hasSavedPost,
  getPostById,
  deletePost,
  recordPostView,
} from '../../services/database';
import { queryKeys } from '../../lib/queryClient';
import { sharePost, copyPostLink } from '../../utils/share';
import { isValidUUID, formatNumber } from '../../utils/formatters';
import { useContentStore } from '../../stores/contentStore';

const { width, height } = Dimensions.get('window');

interface TaggedUserInfo {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

interface PostItem {
  id: string;
  type: string;
  media: string;
  thumbnail: string;
  description: string;
  likes: number;
  views: number;
  location?: string | null;
  taggedUsers?: TaggedUserInfo[];
  allMedia?: string[];
  user: {
    id: string;
    name: string;
    avatar: string;
  };
}

const MOCK_PROFILE_POSTS: PostItem[] = [];

// Validate UUID format

// Helper to convert API post to PostItem format
interface RawPost {
  id: string;
  media_urls?: string[];
  media_type?: string;
  content?: string;
  likes_count?: number;
  views_count?: number;
  location?: string | null;
  tagged_users?: Array<string | { id: string; username?: string; fullName?: string | null; full_name?: string | null; avatarUrl?: string | null; avatar_url?: string | null }>;
  author?: { id?: string; full_name?: string; username?: string; avatar_url?: string | null };
  author_id?: string;
}

const convertToPostItem = (post: RawPost): PostItem => {
  const allMedia = post.media_urls?.filter(Boolean) || [];
  // Normalize tagged users - can be string IDs or objects
  const rawTagged = post.tagged_users || [];
  const taggedUsers: TaggedUserInfo[] = rawTagged
    .filter(Boolean)
    .map((t) => typeof t === 'string'
      ? { id: t, username: '' }
      : { id: t.id, username: t.username || '', fullName: t.fullName || t.full_name, avatarUrl: t.avatarUrl || t.avatar_url }
    );

  return {
    id: post.id,
    type: post.media_type === 'video' ? 'video' : allMedia.length > 1 ? 'carousel' : 'image',
    media: allMedia[0] || '',
    thumbnail: allMedia[0] || '',
    description: post.content || '',
    likes: post.likes_count || 0,
    views: post.views_count || 0,
    location: post.location || null,
    taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
    allMedia: allMedia.length > 1 ? allMedia : undefined,
    user: {
      id: post.author?.id || post.author_id || '',
      name: post.author?.full_name || post.author?.username || '',
      avatar: post.author?.avatar_url || '',
    },
  };
};



const PostDetailProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const currentUserId = useUserStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const removeFromFeed = useFeedStore((state) => state.removeFromFeed);

  // Params
  const params = route.params as { postId?: string; profilePosts?: typeof MOCK_PROFILE_POSTS } || {};
  const { postId, profilePosts: passedPosts = MOCK_PROFILE_POSTS } = params;

  // States
  const [posts, setPosts] = useState<PostItem[]>(passedPosts);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const initialIndex = posts.findIndex(p => p.id === postId) || 0;
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isFan, setIsFan] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [fanLoading, setFanLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [localLikes, setLocalLikes] = useState<Record<string, number>>({});
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});
  const viewedPosts = useRef<Set<string>>(new Set());

  // Content store for reports
  const { submitReport: storeSubmitReport, hasUserReported, isUnderReview } = useContentStore();
  const { showSuccess, showError, showWarning, showDestructiveConfirm } = useSmuppyAlert();

  // Refs
  const videoRef = useRef(null);
  const flatListRef = useRef(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const getItemType = useCallback((item: PostItem) => {
    if (item.allMedia && item.allMedia.length > 1) return 'carousel';
    return item.type === 'video' ? 'video' : 'image';
  }, []);

  // Current post
  const currentPost = posts[currentIndex];

  // Check if this is the current user's own post
  const isOwnPost = currentPost?.user?.id === currentUserId;

  // Load post from API if not provided in params
  useEffect(() => {
    const loadPost = async () => {
      if (posts.length > 0 || !postId) return;

      setIsLoadingPost(true);
      try {
        const { data, error } = await getPostById(postId);
        if (data && !error) {
          setPosts([convertToPostItem(data)]);
          setCurrentIndex(0);
        }
      } catch (err) {
        if (__DEV__) console.warn('[PostDetailProfile] Failed to load post:', err);
      } finally {
        setIsLoadingPost(false);
      }
    };
    loadPost();
  }, [postId, posts.length]);

  // Record view when post becomes visible
  useEffect(() => {
    if (!currentPost?.id || !isValidUUID(currentPost.id)) return;
    if (viewedPosts.current.has(currentPost.id)) return;

    viewedPosts.current.add(currentPost.id);
    // Optimistic local view increment
    setLocalViews(prev => ({
      ...prev,
      [currentPost.id]: (prev[currentPost.id] ?? currentPost.views) + 1,
    }));
    recordPostView(currentPost.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.id]);

  // Check follow status on mount or post change
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!currentPost?.user?.id || isOwnPost) return;
      const { following } = await isFollowing(currentPost.user.id);
      setIsFan(following);
    };
    checkFollowStatus();
  }, [currentPost?.user?.id, isOwnPost]);

  // Check like/bookmark status on mount or post change
  useEffect(() => {
    const checkPostStatus = async () => {
      if (!currentPost) return;
      const id = currentPost.id;
      if (!id || !isValidUUID(id)) return;

      const { hasLiked } = await hasLikedPost(id);
      setIsLiked(hasLiked);

      const { saved } = await hasSavedPost(id);
      setIsBookmarked(saved);
    };
    checkPostStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost?.id]);

  // Become fan with real database call
  const becomeFan = useCallback(async () => {
    if (fanLoading || !currentPost?.user?.id || isOwnPost) return;
    setFanLoading(true);
    try {
      const { error } = await followUser(currentPost.user.id);
      if (!error) {
        setIsFan(true);
      } else {
        if (__DEV__) console.warn('[PostDetailProfile] Follow error:', error);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Follow error:', error);
    } finally {
      setFanLoading(false);
    }
  }, [fanLoading, currentPost?.user?.id, isOwnPost]);

  // Toggle like with optimistic count update
  const toggleLike = useCallback(async () => {
    if (likeLoading || !currentPost) return;

    const id = currentPost.id;
    if (!id || !isValidUUID(id)) {
      setIsLiked(!isLiked);
      if (!isLiked) triggerLikeAnimation();
      return;
    }

    setLikeLoading(true);
    const currentLikes = localLikes[id] ?? currentPost.likes;

    try {
      if (isLiked) {
        setIsLiked(false);
        setLocalLikes(prev => ({ ...prev, [id]: Math.max(currentLikes - 1, 0) }));
        const { error } = await unlikePost(id);
        if (error) {
          setIsLiked(true);
          setLocalLikes(prev => ({ ...prev, [id]: currentLikes }));
        } else {
          useFeedStore.getState().toggleLikeOptimistic(id, false);
        }
      } else {
        setIsLiked(true);
        setLocalLikes(prev => ({ ...prev, [id]: currentLikes + 1 }));
        triggerLikeAnimation();
        const { error } = await likePost(id);
        if (error) {
          setIsLiked(false);
          setLocalLikes(prev => ({ ...prev, [id]: currentLikes }));
        } else {
          useFeedStore.getState().toggleLikeOptimistic(id, true);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Like error:', error);
    } finally {
      setLikeLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likeLoading, currentPost, isLiked, localLikes]);

  // Toggle bookmark
  const toggleBookmark = useCallback(async () => {
    if (bookmarkLoading || !currentPost) return;

    const id = currentPost.id;
    if (!id || !isValidUUID(id)) {
      setIsBookmarked(!isBookmarked);
      return;
    }

    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        const { error } = await unsavePost(id);
        if (!error) {
          setIsBookmarked(false);
          showSuccess('Removed', 'Post removed from saved.');
        }
      } else {
        const { error } = await savePost(id);
        if (!error) {
          setIsBookmarked(true);
          showSuccess('Saved', 'Post added to your collection.');
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Bookmark error:', error);
    } finally {
      setBookmarkLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkLoading, currentPost, isBookmarked]);

  // Delete post (own posts only)
  const handleDeletePost = useCallback(() => {
    if (!currentPost || !isOwnPost) return;
    setShowMenu(false);

    showDestructiveConfirm(
      'Delete Post?',
      'This action cannot be undone. Your post will be permanently deleted.',
      async () => {
        setDeleteLoading(true);
        try {
          const { error } = await deletePost(currentPost.id);
          if (error) {
            showError('Error', 'Failed to delete post. Please try again.');
          } else {
            // Remove from feed store (FanFeed/VibesFeed cross-screen sync)
            removeFromFeed(currentPost.id);
            // Invalidate profile posts + main feed caches
            queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
            if (currentUserId) {
              queryClient.invalidateQueries({ queryKey: ['posts', 'user', currentUserId] });
            }
            showSuccess('Deleted', 'Your post has been deleted.');
            navigation.goBack();
          }
        } catch {
          showError('Error', 'Something went wrong. Please try again.');
        } finally {
          setDeleteLoading(false);
        }
      },
      'Delete'
    );
  }, [currentPost, isOwnPost, showDestructiveConfirm, showError, showSuccess, navigation, removeFromFeed, queryClient, currentUserId]);

  // Share post
  const handleShare = useCallback(async () => {
    if (shareLoading || !currentPost) return;
    setShareLoading(true);
    try {
      setShowMenu(false);
      await sharePost(
        currentPost.id,
        currentPost.description,
        currentPost.user?.name || ''
      );
    } catch {
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

  // Report post
  const handleReport = useCallback(() => {
    if (!currentPost) return;
    setShowMenu(false);
    if (hasUserReported(currentPost.id)) {
      showWarning('Already reported', 'You have already reported this content. It is under review.');
      return;
    }
    if (isUnderReview(currentPost.id)) {
      showWarning('Under review', 'This content is already being reviewed by our team.');
      return;
    }
    setShowReportModal(true);
  }, [currentPost, hasUserReported, isUnderReview, showWarning]);

  // Submit report
  const submitReport = useCallback((reason: string) => {
    if (!currentPost) return;
    setShowReportModal(false);
    const result = storeSubmitReport(currentPost.id, reason);
    if (result.alreadyReported) {
      showWarning('Already reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', 'An error occurred. Please try again.');
    }
  }, [currentPost, storeSubmitReport, showWarning, showSuccess, showError]);

  // Double tap to like
  const handleDoubleTap = useCallback(() => {
    if (!currentPost) return;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) toggleLike();
    } else {
      if (currentPost.type === 'video') {
        setIsPaused(prev => !prev);
      }
    }
    lastTap.current = now;
  }, [currentPost, isLiked, toggleLike]);

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

  // Handle swipe to next/prev post
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
      setIsPaused(false);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  // Create styles with theme
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Memoized insets-dependent styles
  const headerPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);
  const bottomContentPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 10 }), [insets.bottom]);

  // Extracted handlers
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleShowMenu = useCallback(() => setShowMenu(true), []);
  const handleCloseMenu = useCallback(() => setShowMenu(false), []);
  const handleToggleMute = useCallback(() => setIsMuted(prev => !prev), []);
  const handleToggleDescription = useCallback(() => setExpandedDescription(prev => !prev), []);
  const handleCloseReportModal = useCallback(() => setShowReportModal(false), []);

  // Report reason handlers
  const handleReportSpam = useCallback(() => submitReport('spam'), [submitReport]);
  const handleReportInappropriate = useCallback(() => submitReport('inappropriate'), [submitReport]);
  const handleReportHarassment = useCallback(() => submitReport('harassment'), [submitReport]);
  const handleReportViolence = useCallback(() => submitReport('violence'), [submitReport]);
  const handleReportOther = useCallback(() => submitReport('other'), [submitReport]);

  // Render post item
  const renderPostItem = useCallback(({ item, index }: { item: PostItem; index: number }) => {
    const displayLikes = localLikes[item.id] ?? item.likes;
    const displayViews = localViews[item.id] ?? item.views;
    const itemIsOwn = item.user?.id === currentUserId;

    return (
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={[styles.postContainer, { height }]}>
          {/* Media */}
          {item.type === 'video' ? (
            <Video
              ref={index === currentIndex ? videoRef : null}
              source={{ uri: item.media }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={isMuted}
              shouldPlay={index === currentIndex && !isPaused}
              posterSource={{ uri: item.thumbnail }}
              usePoster
            />
          ) : item.allMedia && item.allMedia.length > 1 ? (
            <View style={{ flex: 1 }}>
              <ScrollView
                horizontal
                pagingEnabled
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
                    style={{ width, height: '100%' }}
                  />
                ))}
              </ScrollView>
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
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleShowMenu}
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
              style={[styles.actionBtn, bookmarkLoading && styles.actionBtnDisabled]}
              onPress={toggleBookmark}
              disabled={bookmarkLoading}
            >
              {bookmarkLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={28}
                  color={isBookmarked ? colors.primary : '#FFF'}
                />
              )}
            </TouchableOpacity>

            {item.type === 'video' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleToggleMute}
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
          <View style={[styles.bottomContent, bottomContentPaddingStyle]}>
            {/* User info */}
            <View style={styles.userRow}>
              <TouchableOpacity
                style={styles.userInfo}
                onPress={() => {
                  if (itemIsOwn) {
                    navigation.navigate('Tabs', { screen: 'Profile' });
                  } else {
                    navigation.navigate('UserProfile', { userId: item.user.id });
                  }
                }}
              >
                <AvatarImage source={item.user.avatar} size={40} style={styles.avatar} />
                <Text style={styles.userName}>{item.user.name}</Text>
              </TouchableOpacity>

              {/* Fan button - hidden on own posts */}
              {!itemIsOwn && !isFan && (
                <TouchableOpacity
                  style={[styles.fanBtn, fanLoading && styles.fanBtnDisabled]}
                  onPress={becomeFan}
                  disabled={fanLoading}
                >
                  {fanLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="add" size={16} color={colors.primary} />
                      <Text style={styles.fanBtnText}>Fan</Text>
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

            {/* Description */}
            {item.description ? (
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
            ) : null}

            {/* Tagged users */}
            {item.taggedUsers && item.taggedUsers.length > 0 ? (
              <View style={styles.taggedRow}>
                <Ionicons name="people" size={14} color={colors.primary} />
                <Text style={styles.taggedText}>
                  {item.taggedUsers.map(t => t.fullName || t.username || 'User').join(', ')}
                </Text>
              </View>
            ) : null}

            {/* Stats bar */}
            <View style={styles.statsBar}>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => navigation.navigate('PostLikers', { postId: item.id })}
                activeOpacity={0.7}
              >
                <SmuppyHeartIcon size={18} color={colors.heartRed} filled />
                <Text style={styles.statCount}>{formatNumber(displayLikes)}</Text>
              </TouchableOpacity>
              <View style={styles.statItem}>
                <Ionicons name="eye-outline" size={18} color="#FFF" />
                <Text style={styles.statCount}>{formatNumber(displayViews)}</Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentIndex, isPaused, showLikeAnimation, likeAnimationScale,
    isLiked, isBookmarked, isFan, fanLoading, shareLoading, likeLoading,
    bookmarkLoading, localLikes, localViews, currentUserId,
    colors, styles, headerPaddingStyle, bottomContentPaddingStyle,
    handleDoubleTap, handleShare, handleGoBack, handleShowMenu,
    handleToggleMute, handleToggleDescription,
    toggleLike, toggleBookmark, becomeFan,
  ]);

  // Loading state
  if (isLoadingPost) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // No post found
  if (posts.length === 0 || !currentPost) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="image-outline" size={48} color={colors.gray400} />
        <Text style={{ color: colors.gray500, marginTop: 12 }}>Post not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Delete loading overlay */}
      {deleteLoading && (
        <View style={styles.deleteOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.deleteOverlayText}>Deleting...</Text>
        </View>
      )}

      {/* Posts FlashList (vertical scroll) */}
      <FlashList
        ref={flatListRef}
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        getItemType={getItemType}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
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

            <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleCopyLink}>
              <Ionicons name="link-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>

            {isOwnPost ? (
              <TouchableOpacity style={styles.menuItem} onPress={handleDeletePost}>
                <Ionicons name="trash-outline" size={24} color={colors.error} />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete Post</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                <Ionicons name="flag-outline" size={24} color={colors.heartRed} />
                <Text style={[styles.menuItemText, styles.menuItemTextReport]}>Report</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={handleCloseMenu}
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
  postContainer: {
    width,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
    position: 'absolute',
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
    height: 200,
    backgroundColor: 'transparent',
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
    flex: 1,
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
    borderColor: colors.primary,
    gap: 4,
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
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

  // Tagged users
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  taggedText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
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

  // Delete overlay
  deleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  deleteOverlayText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },

  // Modal handle
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.gray,
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
    color: colors.error,
  },
  menuItemTextReport: {
    color: colors.heartRed,
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.gray,
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
    borderBottomColor: colors.gray,
  },
  reportOptionText: {
    fontSize: 16,
    color: '#FFF',
  },
});

export default PostDetailProfileScreen;
