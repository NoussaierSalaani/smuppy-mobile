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
import { resolveDisplayName } from '../../types/profile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { normalizeCdnUrl } from '../../utils/cdnUrl';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import {
  followUser,
  isFollowing,
  likePost,
  hasLikedPost,
  savePost,
  unsavePost,
  hasSavedPost,
  getPostById,
  deletePost,
} from '../../services/database';
import { copyPostLink } from '../../utils/share';
import SharePostModal from '../../components/SharePostModal';
import { useShareModal } from '../../hooks/useModalState';
import { isValidUUID, formatNumber } from '../../utils/formatters';
import { useContentStore } from '../../stores/contentStore';
import { useUserSafetyStore } from '../../stores/userSafetyStore';

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
  location?: string | null;
  taggedUsers?: TaggedUserInfo[];
  allMedia?: string[];
  user: {
    id: string;
    name: string;
    avatar: string;
  };
}

// Helper to convert API post to PostItem format
interface RawPost {
  id: string;
  media_urls?: string[];
  media_type?: string;
  content?: string;
  likes_count?: number;
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
    location: post.location || null,
    taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
    allMedia: allMedia.length > 1 ? allMedia : undefined,
    user: {
      id: post.author?.id || post.author_id || '',
      name: resolveDisplayName(post.author, ''),
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

  // Params
  const params = route.params as { postId?: string; profilePosts?: PostItem[] } || {};
  const { postId, profilePosts: passedPosts = [] } = params;

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
  const shareModal = useShareModal();
  const likeLoadingRef = useRef(false);
  const [likeLoadingState, setLikeLoadingState] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [localLikes, setLocalLikes] = useState<Record<string, number>>({});
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});

  // Content store for reports
  const { submitPostReport, hasUserReported, isUnderReview } = useContentStore();
  // User safety store for mute/block
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();
  const { showSuccess, showError, showDestructiveConfirm } = useSmuppyAlert();

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
        showSuccess('Followed', `You are now a fan of ${currentPost.user.name || 'this user'}.`);
      } else {
        if (__DEV__) console.warn('[PostDetailProfile] Follow error:', error);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Follow error:', error);
    } finally {
      setFanLoading(false);
    }
  }, [fanLoading, currentPost?.user?.id, currentPost?.user?.name, isOwnPost, showSuccess]);

  // Toggle like with optimistic count update (ref-based guard)
  const toggleLike = useCallback(async () => {
    if (likeLoadingRef.current || !currentPost) return;

    const id = currentPost.id;
    if (!id || !isValidUUID(id)) {
      setIsLiked(!isLiked);
      if (!isLiked) triggerLikeAnimation();
      return;
    }

    likeLoadingRef.current = true;
    setLikeLoadingState(true);
    const currentLikes = localLikes[id] ?? currentPost.likes;

    try {
      // Optimistic update
      const newLiked = !isLiked;
      setIsLiked(newLiked);
      setLocalLikes(prev => ({ ...prev, [id]: newLiked ? currentLikes + 1 : Math.max(currentLikes - 1, 0) }));
      if (newLiked) triggerLikeAnimation();

      // Single toggle endpoint: backend returns { liked: true/false }
      const { error } = await likePost(id);
      if (error) {
        // Revert
        setIsLiked(isLiked);
        setLocalLikes(prev => ({ ...prev, [id]: currentLikes }));
      } else {
        useFeedStore.getState().toggleLikeOptimistic(id, newLiked);
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Like error:', error);
    } finally {
      likeLoadingRef.current = false;
      setLikeLoadingState(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost, isLiked, localLikes]);

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
            useFeedStore.getState().markPostDeleted(currentPost.id);
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
  }, [currentPost, isOwnPost, showDestructiveConfirm, showError, showSuccess, navigation]);

  // Share post — opens in-app send modal
  const handleShare = useCallback(() => {
    if (!currentPost) return;
    setShowMenu(false);
    shareModal.open({
      id: currentPost.id,
      type: 'post',
      title: currentPost.user?.name || '',
      subtitle: currentPost.description,
      image: currentPost.media,
      avatar: currentPost.user?.avatar,
    });
  }, [currentPost, shareModal]);

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
      showError('Already Reported', 'You have already reported this content. It is under review.');
      return;
    }
    if (isUnderReview(currentPost.id)) {
      showError('Under Review', 'This content is already being reviewed by our team.');
      return;
    }
    setShowReportModal(true);
  }, [currentPost, hasUserReported, isUnderReview, showError]);

  // Submit report — async with proper error handling
  const submitReport = useCallback(async (reason: string) => {
    if (!currentPost) return;
    setShowReportModal(false);
    const result = await submitPostReport(currentPost.id, reason);
    if (result.alreadyReported) {
      showError('Already Reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', result.message || 'Could not report post. Please try again.');
    }
  }, [currentPost, submitPostReport, showSuccess, showError]);

  // Mute user
  const handleMute = useCallback(() => {
    if (muteLoading || !currentPost) return;
    const userId = currentPost.user?.id;
    if (!userId) return;
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

  // Block user
  const handleBlock = useCallback(() => {
    if (blockLoading || !currentPost) return;
    const userId = currentPost.user?.id;
    if (!userId) return;
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
    const itemIsOwn = item.user?.id === currentUserId;

    return (
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={[styles.postContainer, { height }]}>
          {/* Media */}
          {item.type === 'video' ? (
            <Video
              ref={index === currentIndex ? videoRef : null}
              source={{ uri: normalizeCdnUrl(item.media) || '' }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={isMuted}
              shouldPlay={index === currentIndex && !isPaused}
              posterSource={{ uri: normalizeCdnUrl(item.thumbnail) || '' }}
              usePoster
            />
          ) : item.allMedia && item.allMedia.length > 1 ? (
            <View style={styles.carouselContainer}>
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
                    style={styles.carouselImage}
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
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradientOverlay}
          />

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
              style={styles.actionBtn}
              onPress={handleShare}
            >
              <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, likeLoadingState && styles.actionBtnDisabled]}
              onPress={toggleLike}
              disabled={likeLoadingState}
            >
              {likeLoadingState ? (
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
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentIndex, isPaused, showLikeAnimation, likeAnimationScale,
    isLiked, isBookmarked, isFan, fanLoading, likeLoadingState,
    bookmarkLoading, localLikes, currentUserId,
    colors, styles, headerPaddingStyle, bottomContentPaddingStyle,
    handleDoubleTap, handleShare, handleGoBack, handleShowMenu,
    handleToggleMute, handleToggleDescription,
    toggleLike, toggleBookmark, becomeFan,
  ]);

  // Loading state
  if (isLoadingPost) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // No post found
  if (posts.length === 0 || !currentPost) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="image-outline" size={48} color={colors.gray} />
        <Text style={styles.emptyText}>Post not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackBtn}>
          <Text style={styles.goBackText}>Go Back</Text>
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
                <Ionicons name="trash-outline" size={24} color="#FF3B30" />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete Post</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleMute} disabled={muteLoading}>
                  <Ionicons name="eye-off-outline" size={24} color="#FFF" />
                  <Text style={styles.menuItemText}>Mute user</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock} disabled={blockLoading}>
                  <Ionicons name="ban-outline" size={24} color="#FF6B6B" />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block user</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Ionicons name="flag-outline" size={24} color="#FF6B6B" />
                  <Text style={[styles.menuItemText, styles.menuItemTextReport]}>Report</Text>
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

      <SharePostModal
        visible={shareModal.isVisible}
        content={shareModal.data}
        onClose={shareModal.close}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: colors.gray,
    marginTop: 12,
    fontSize: 16,
  },
  goBackBtn: {
    marginTop: 20,
    padding: 12,
  },
  goBackText: {
    color: colors.primary,
    fontSize: 16,
  },
  carouselContainer: {
    flex: 1,
  },
  carouselImage: {
    width: width,
    height: '100%',
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
    height: 300,
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
    color: '#FF3B30',
  },
  menuItemTextReport: {
    color: '#FF6B6B',
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
