/**
 * usePostDetailActions - Shared logic for PostDetail screens
 *
 * Extracts duplicated handler logic (like, bookmark, follow, report,
 * mute, block, delete, share, copy-link, double-tap, like-animation)
 * from PostDetailFanFeedScreen, PostDetailVibesFeedScreen, and
 * PostDetailProfileScreen.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import { useUserStore } from '../stores/userStore';
import { useFeedStore } from '../stores/feedStore';
import { useContentStore } from '../stores/contentStore';
import { useUserSafetyStore } from '../stores/userSafetyStore';
import { useShareModal } from './useModalState';
import { copyPostLink } from '../utils/share';
import {
  followUser,
  isFollowing,
  likePost,
  hasLikedPost,
  savePost,
  unsavePost,
  hasSavedPost,
  deletePost,
} from '../services/database';
import { isValidUUID } from '../utils/formatters';

// ============================================
// TYPES
// ============================================

/** Minimum shape a post must have for all shared actions to work. */
export interface PostDetailPost {
  id: string;
  type: string;
  media: string;
  thumbnail: string;
  description: string;
  likes: number;
  user: {
    id: string;
    name: string;
    avatar: string;
  };
}

/** Return type of the hook -- every handler & piece of state the screens need. */
export interface PostDetailActions {
  // Stores / context values
  currentUserId: string | undefined;
  shareModal: ReturnType<typeof useShareModal>;

  // Like state
  isLiked: boolean;
  likeLoading: boolean;
  localLikeCount: number | null;
  showLikeAnimation: boolean;
  likeAnimationScale: Animated.Value;
  toggleLike: () => Promise<void>;
  triggerLikeAnimation: () => void;

  // Bookmark state
  isBookmarked: boolean;
  bookmarkLoading: boolean;
  toggleBookmark: () => Promise<void>;

  // Follow state
  isFan: boolean;
  fanLoading: boolean;
  becomeFan: () => Promise<void>;

  // Audio / pause
  isAudioMuted: boolean;
  isPaused: boolean;
  setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleAudioMute: () => void;

  // Description expand
  expandedDescription: boolean;
  handleToggleDescription: () => void;

  // Menu
  showMenu: boolean;
  handleShowMenu: () => void;
  handleCloseMenu: () => void;

  // Navigation / misc
  handleGoBack: () => void;
  handleDoubleTap: () => void;

  // Post-menu actions
  handleShare: () => void;
  handleCopyLink: () => Promise<void>;
  handleReport: (reason: string) => Promise<void>;
  handleMute: () => void;
  handleBlock: () => void;
  handleDeletePost: () => void;
  handleViewProfile: () => void;

  // Report helpers
  hasUserReported: (postId: string) => boolean;
  isUnderReview: (postId: string) => boolean;

  // Delete loading (for overlay in profile screen)
  deleteLoading: boolean;
}

export interface UsePostDetailActionsOptions {
  /** The currently visible post (may change as user scrolls). */
  currentPost: PostDetailPost | null;
  /** Optional log tag for __DEV__ warnings (e.g. "PostDetailFanFeed"). */
  logTag?: string;
}

// ============================================
// HOOK
// ============================================

export function usePostDetailActions({
  currentPost,
  logTag = 'PostDetail',
}: UsePostDetailActionsOptions): PostDetailActions {
  const navigation = useNavigation();
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();

  const { submitPostReport, hasUserReported, isUnderReview } = useContentStore();
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();
  const currentUserId = useUserStore((state) => state.user?.id);

  const shareModal = useShareModal();

  // ------ State ------
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isFan, setIsFan] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [localLikeCount, setLocalLikeCount] = useState<number | null>(null);

  // Loading guards
  const likeInProgress = useRef(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [fanLoading, setFanLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Refs
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  // Keep a ref to currentPost for stable callbacks that don't need to
  // re-create when the post changes (e.g. effects that close over it).
  const postRef = useRef(currentPost);
  postRef.current = currentPost;

  // ------ Effects: check status when post changes ------

  // Reset states when post changes
  useEffect(() => {
    setExpandedDescription(false);
    setLocalLikeCount(null);
  }, [currentPost?.id]);

  // Check follow status
  useEffect(() => {
    if (!currentPost?.user?.id || currentPost.user.id === currentUserId) return;
    let cancelled = false;
    const check = async () => {
      try {
        if (!isValidUUID(currentPost.user.id)) {
          setIsFan(false);
          return;
        }
        const { following } = await isFollowing(currentPost.user.id);
        if (!cancelled) setIsFan(!!following);
      } catch {
        // Silently handle
      }
    };
    check();
    return () => { cancelled = true; };
     
  }, [currentPost?.user?.id, currentUserId]);

  // Check like / bookmark status
  useEffect(() => {
    if (!currentPost?.id || !isValidUUID(currentPost.id)) return;
    let cancelled = false;
    const check = async () => {
      try {
        const { hasLiked } = await hasLikedPost(currentPost.id);
        if (!cancelled) setIsLiked(hasLiked);
      } catch { /* silent */ }
      try {
        const { saved } = await hasSavedPost(currentPost.id);
        if (!cancelled) setIsBookmarked(saved);
      } catch { /* silent */ }
    };
    check();
    return () => { cancelled = true; };
     
  }, [currentPost?.id]);

  // ------ Like animation ------

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

  // ------ Toggle like ------

  const toggleLike = useCallback(async () => {
    if (likeInProgress.current || !postRef.current) return;
    likeInProgress.current = true;

    const post = postRef.current;
    const postId = post.id;
    const currentLikes = localLikeCount ?? post.likes ?? 0;

    // Optimistic update
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setLocalLikeCount(newLiked ? currentLikes + 1 : Math.max(currentLikes - 1, 0));
    if (newLiked) triggerLikeAnimation();

    if (!postId || !isValidUUID(postId)) {
      likeInProgress.current = false;
      return;
    }

    setLikeLoading(true);
    try {
      const { error } = await likePost(postId);
      if (error) {
        setIsLiked(!newLiked);
        setLocalLikeCount(currentLikes);
      } else {
        useFeedStore.getState().toggleLikeOptimistic(postId, newLiked);
      }
    } catch (error) {
      if (__DEV__) console.warn(`[${logTag}] Like error:`, error);
      setIsLiked(!newLiked);
      setLocalLikeCount(currentLikes);
    } finally {
      setLikeLoading(false);
      likeInProgress.current = false;
    }
  }, [isLiked, localLikeCount, triggerLikeAnimation, logTag]);

  // ------ Toggle bookmark ------

  const toggleBookmark = useCallback(async () => {
    if (bookmarkLoading || !postRef.current) return;

    const post = postRef.current;
    const postId = post.id;

    // Optimistic update
    const newBookmarkState = !isBookmarked;
    setIsBookmarked(newBookmarkState);

    if (!postId || !isValidUUID(postId)) return;

    setBookmarkLoading(true);
    try {
      if (!newBookmarkState) {
        const { error } = await unsavePost(postId);
        if (error) {
          setIsBookmarked(true);
        } else {
          showSuccess('Removed', 'Post removed from saved.');
        }
      } else {
        const { error } = await savePost(postId);
        if (error) {
          setIsBookmarked(false);
        } else {
          showSuccess('Saved', 'Post added to your collection.');
        }
      }
    } catch (error) {
      if (__DEV__) console.warn(`[${logTag}] Bookmark error:`, error);
      setIsBookmarked(!newBookmarkState);
    } finally {
      setBookmarkLoading(false);
    }
  }, [bookmarkLoading, isBookmarked, showSuccess, logTag]);

  // ------ Become fan ------

  const becomeFan = useCallback(async () => {
    if (fanLoading || !postRef.current?.user?.id) return;
    const post = postRef.current;
    const userId = post.user.id;

    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn(`[${logTag}] Invalid userId:`, userId);
      return;
    }

    setFanLoading(true);
    try {
      const { error } = await followUser(userId);
      if (!error) {
        setIsFan(true);
        showSuccess('Followed', `You are now a fan of ${post.user.name || 'this user'}.`);
      } else {
        if (__DEV__) console.warn(`[${logTag}] Follow error:`, error);
      }
    } catch (error) {
      if (__DEV__) console.warn(`[${logTag}] Follow error:`, error);
    } finally {
      setFanLoading(false);
    }
  }, [fanLoading, showSuccess, logTag]);

  // ------ Double tap ------

  const handleDoubleTap = useCallback(() => {
    if (!postRef.current) return;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      if (!isLiked) {
        toggleLike();
      }
    } else {
      if (postRef.current.type === 'video') {
        setIsPaused(prev => !prev);
      }
    }
    lastTap.current = now;
  }, [isLiked, toggleLike]);

  // ------ Menu handlers ------

  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleShowMenu = useCallback(() => setShowMenu(true), []);
  const handleCloseMenu = useCallback(() => setShowMenu(false), []);
  const handleToggleAudioMute = useCallback(() => setIsAudioMuted(prev => !prev), []);
  const handleToggleDescription = useCallback(() => setExpandedDescription(prev => !prev), []);

  // ------ Share ------

  const handleShare = useCallback(() => {
    if (!postRef.current) return;
    const post = postRef.current;
    setShowMenu(false);
    shareModal.open({
      id: post.id,
      type: 'post',
      title: post.user.name,
      subtitle: post.description,
      image: post.media,
      avatar: post.user.avatar,
    });
  }, [shareModal]);

  // ------ Copy link ------

  const handleCopyLink = useCallback(async () => {
    if (!postRef.current) return;
    setShowMenu(false);
    const copied = await copyPostLink(postRef.current.id);
    if (copied) {
      showSuccess('Copied!', 'Post link copied to clipboard');
    }
  }, [showSuccess]);

  // ------ Report ------

  const handleReport = useCallback(async (reason: string) => {
    if (!postRef.current) return;
    const post = postRef.current;
    if (hasUserReported(post.id)) {
      showError('Already Reported', 'You have already reported this content. It is under review.');
      return;
    }
    if (isUnderReview(post.id)) {
      showError('Under Review', 'This content is already being reviewed by our team.');
      return;
    }
    const result = await submitPostReport(post.id, reason);
    if (result.alreadyReported) {
      showError('Already Reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', result.message || 'Could not report post. Please try again.');
    }
  }, [hasUserReported, isUnderReview, submitPostReport, showError, showSuccess]);

  // ------ Mute ------

  const handleMute = useCallback(() => {
    if (muteLoading || !postRef.current) return;
    const userId = postRef.current.user?.id;
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
  }, [muteLoading, isUserMuted, showError, showDestructiveConfirm, mute, showSuccess]);

  // ------ Block ------

  const handleBlock = useCallback(() => {
    if (blockLoading || !postRef.current) return;
    const userId = postRef.current.user?.id;
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
  }, [blockLoading, isBlocked, showError, showDestructiveConfirm, block, showSuccess]);

  // ------ Delete ------

  const handleDeletePost = useCallback(() => {
    if (deleteLoading || !postRef.current) return;
    const post = postRef.current;
    setShowMenu(false);
    showDestructiveConfirm(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      async () => {
        setDeleteLoading(true);
        try {
          const { error } = await deletePost(post.id);
          if (error) {
            showError('Error', 'Could not delete post. Please try again.');
          } else {
            useFeedStore.getState().markPostDeleted(post.id);
            showSuccess('Deleted', 'Post has been deleted.');
            navigation.goBack();
          }
        } finally {
          setDeleteLoading(false);
        }
      }
    );
  }, [deleteLoading, showDestructiveConfirm, showError, showSuccess, navigation]);

  // ------ View profile ------

  const handleViewProfile = useCallback(() => {
    setShowMenu(false);
    if (!postRef.current) return;
    const userId = postRef.current.user.id;
    if (userId === currentUserId) {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  }, [currentUserId, navigation]);

  // ============================================
  // RETURN
  // ============================================

  return {
    currentUserId,
    shareModal,

    isLiked,
    likeLoading,
    localLikeCount,
    showLikeAnimation,
    likeAnimationScale,
    toggleLike,
    triggerLikeAnimation,

    isBookmarked,
    bookmarkLoading,
    toggleBookmark,

    isFan,
    fanLoading,
    becomeFan,

    isAudioMuted,
    isPaused,
    setIsPaused,
    handleToggleAudioMute,

    expandedDescription,
    handleToggleDescription,

    showMenu,
    handleShowMenu,
    handleCloseMenu,

    handleGoBack,
    handleDoubleTap,

    handleShare,
    handleCopyLink,
    handleReport,
    handleMute,
    handleBlock,
    handleDeletePost,
    handleViewProfile,

    hasUserReported,
    isUnderReview,

    deleteLoading,
  };
}
