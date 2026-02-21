import React, { memo, useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Share,
  InteractionManager,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import type { MainStackParamList } from '../../types';
import { GRADIENTS, SPACING, HIT_SLOP } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { AccountBadge } from '../../components/Badge';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import DoubleTapLike from '../../components/DoubleTapLike';
import SwipeToPeaks from '../../components/SwipeToPeaks';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useContentStore } from '../../stores/contentStore';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { useShareModal } from '../../hooks/useModalState';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import { transformToFanPost, UIFanPost } from '../../utils/postTransformers';
import { getMediaVariant } from '../../utils/cdnUrl';
import SharePostModal from '../../components/SharePostModal';
import { getFeedFromFollowed, getSuggestedProfiles, followUser, Profile, hasLikedPostsBatch, hasSavedPostsBatch, deletePost } from '../../services/database';
import { LiquidButton } from '../../components/LiquidButton';
import PostMenuModal from '../../components/PostMenuModal';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme } from '../../hooks/useTheme';

import { FeedSkeleton } from '../../components/skeleton';
import { usePrefetchProfile } from '../../hooks/queries';
import { formatNumber } from '../../utils/formatters';
import { preloadImages } from '../../hooks/useImagePreload';
import { resolveDisplayName } from '../../types/profile';


const { width } = Dimensions.get('window');

// Suggestion interface for the UI
interface UISuggestion {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
}

// UIFanPost and transformToFanPost are now imported from utils/postTransformers
// Using UIFanPost as UIPost alias for backward compatibility
type UIPost = UIFanPost;

// ============================================
// Memoized PostItem component for FlashList
// ============================================
type PostItemProps = Readonly<{
  post: UIPost;
  isLast: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
  onUserPress: (userId: string) => void;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onMenu: (post: UIPost) => void;
  onShare: (post: UIPost) => void;
  onDetail: (post: UIPost) => void;
  onLikersPress: (postId: string) => void;
  initialCarouselIndex?: number;
  onCarouselIndexChange?: (postId: string, index: number) => void;
}>;


const PostItem = memo<PostItemProps>(({
  post, isLast, colors, styles,
  onUserPress, onLike, onSave, onMenu, onShare, onDetail, onLikersPress,
  initialCarouselIndex = 0, onCarouselIndexChange,
}) => {
  const carouselIndex = initialCarouselIndex;

  return (
    <View style={styles.postContainer}>
      {/* Header */}
      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.postUser}
          onPress={() => onUserPress(post.user.id)}
        >
          <AvatarImage source={post.user.avatar} size={40} />
          <View style={styles.postUserInfo}>
            <View style={styles.postUserNameRow}>
              <Text style={styles.postUserName}>{post.user.name}</Text>
              <AccountBadge
                size={16}
                style={styles.verifiedBadge}
                isVerified={post.user.isVerified}
                accountType={post.user.accountType}
              />
              {post.user.isBot && (
                <View style={styles.teamBadge}>
                  <Text style={styles.teamBadgeText}>(Team Smuppy)</Text>
                </View>
              )}
            </View>
            <Text style={styles.postMeta}>
              {post.timeAgo}{post.location ? ` • ${post.location}` : null}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.postMore}
          onPress={() => onMenu(post)}
          accessibilityLabel="Post options"
          accessibilityRole="button"
          hitSlop={HIT_SLOP.medium}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Media */}
      <DoubleTapLike
        onDoubleTap={() => { if (!post.isLiked) onLike(post.id); }}
        onSingleTap={() => onDetail(post)}
        showAnimation={!post.isLiked}
      >
        <View style={styles.postMedia}>
          {post.allMedia && post.allMedia.length > 1 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                  onCarouselIndexChange?.(post.id, newIndex);
                }}
              >
                {post.allMedia.map((mediaUrl, mediaIndex) => (
                  <OptimizedImage
                    key={`${post.id}-media-${mediaIndex}`}
                    source={mediaUrl}
                    style={styles.carouselMediaItem}
                    contentFit="cover"
                  />
                ))}
              </ScrollView>
              <View style={styles.carouselPagination}>
                {post.allMedia.map((_, dotIndex) => (
                  <View
                    key={`${post.id}-dot-${dotIndex}`}
                    style={[
                      styles.carouselDot,
                      carouselIndex === dotIndex && styles.carouselDotActive,
                    ]}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <OptimizedImage
                source={getMediaVariant(post.media, 'medium', post.mediaMeta)}
                style={styles.postImage}
                contentFit="cover"
                recyclingKey={`post-${post.id}`}
                placeholder={post.mediaMeta?.blurhash}
              />
              {post.type === 'video' && (
                <View style={styles.videoOverlay}>
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={30} color="#fff" />
                  </View>
                  <View style={styles.videoDuration}>
                    <Text style={styles.videoDurationText}>{post.duration}</Text>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </DoubleTapLike>

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={styles.postActionsLeft}>
          <TouchableOpacity
            style={styles.postActionLike}
            onPress={() => onLike(post.id)}
            hitSlop={HIT_SLOP.large}
            activeOpacity={0.7}
            accessibilityLabel={post.isLiked ? 'Unlike this post' : 'Like this post'}
            accessibilityRole="button"
            accessibilityState={{ selected: post.isLiked }}
            accessibilityHint="Double tap to toggle like"
          >
            <SmuppyHeartIcon
              size={26}
              color={post.isLiked ? "#FF6B6B" : colors.dark}
              filled={post.isLiked}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.postAction}
            onPress={() => onShare(post)}
            hitSlop={HIT_SLOP.medium}
            accessibilityLabel="Share this post"
            accessibilityRole="button"
            accessibilityHint="Opens share options"
          >
            <Ionicons name="paper-plane-outline" size={22} color={colors.dark} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => onSave(post.id)}
          hitSlop={HIT_SLOP.medium}
          accessibilityLabel={post.isSaved ? 'Remove from saved' : 'Save this post'}
          accessibilityRole="button"
          accessibilityState={{ selected: post.isSaved }}
          accessibilityHint="Double tap to toggle save"
        >
          <Ionicons
            name={post.isSaved ? "bookmark" : "bookmark-outline"}
            size={22}
            color={post.isSaved ? colors.primary : colors.dark}
          />
        </TouchableOpacity>
      </View>

      {/* Likes */}
      <TouchableOpacity
        onPress={() => onLikersPress(post.id)}
        activeOpacity={0.7}
      >
        <Text style={styles.postLikes}>{formatNumber(post.likes)} likes</Text>
      </TouchableOpacity>

      {/* Caption */}
      <View style={styles.postCaption} accessibilityRole="text">
        <Text style={styles.postCaptionText}>
          <Text
            style={styles.postCaptionUser}
            onPress={() => onUserPress(post.user.id)}
          >
            {post.user.name}
          </Text>
          {'  '}{post.caption}
        </Text>
      </View>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <View style={styles.postTags}>
          {post.tags.map((tag, tagIndex) => (
            <Text key={`tag-${tagIndex}`} style={styles.postTag}>
              #{tag}
            </Text>
          ))}
        </View>
      )}

      {/* Tagged Users */}
      {post.taggedUsers && post.taggedUsers.length > 0 && (
        <View style={styles.taggedUsersRow}>
          <Ionicons name="people-outline" size={14} color={colors.gray} />
          <Text style={styles.taggedUsersText}>
            {post.taggedUsers.map(t => resolveDisplayName(t)).join(', ')}
          </Text>
        </View>
      )}

      {/* Divider */}
      {!isLast && <View style={styles.postDivider} />}
    </View>
  );
}, (prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.isLiked === next.post.isLiked &&
  prev.post.isSaved === next.post.isSaved &&
  prev.post.likes === next.post.likes &&
  prev.post.caption === next.post.caption &&
  prev.post.user?.id === next.post.user?.id &&
  prev.post.media === next.post.media &&
  prev.isLast === next.isLast &&
  prev.initialCarouselIndex === next.initialCarouselIndex &&
  prev.styles === next.styles
);

type FanFeedProps = Readonly<{
  headerHeight?: number;
}>;


export interface FanFeedRef {
  scrollToTop: () => void;
}

const FanFeed = forwardRef<FanFeedRef, FanFeedProps>(({ headerHeight = 0 }, ref) => {
  const { colors, isDark } = useTheme();
  const { showSuccess, showError, showDestructiveConfirm } = useSmuppyAlert();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { handleScroll, showBars } = useTabBar();
  const listRef = useRef<React.ElementRef<typeof FlashList<UIPost>>>(null);

  // Expose scrollToTop method to parent
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      showBars();
    },
  }));
  const { isUnderReview, submitPostReport, hasUserReported } = useContentStore();
  const { isHidden, mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();
  // Extract arrays (not stable function refs) so useMemo recomputes on block/mute
  const blockedUserIds = useUserSafetyStore((s) => s.blockedUserIds);
  const mutedUserIds = useUserSafetyStore((s) => s.mutedUserIds);
  const currentUser = useUserStore((state) => state.user);

  // State for real posts from API
  const [posts, setPosts] = useState<UIPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadMoreErrorCount = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<UISuggestion[]>([]);
  const suggestionsCursorRef = useRef<string | null>(null);
  const loadingSuggestionsRef = useRef(false);
  const hasMoreSuggestionsRef = useRef(true);
  const suggestionsErrorCountRef = useRef(0);
  const MAX_SUGGESTIONS_ERRORS = 3;
  const [suggestionsExhausted, setSuggestionsExhausted] = useState(false);
  const [trackingUserIds, setTrackingUserIds] = useState<Set<string>>(new Set());
  const trackingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Track carousel indexes at parent level to survive PostItem re-renders (H5)
  const carouselIndexesRef = useRef<Record<string, number>>({});

  // Cleanup tracking timeouts on unmount to prevent memory leaks
  useEffect(() => {
    const timeouts = trackingTimeoutsRef.current;
    return () => {
      timeouts.forEach(timeoutId => clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, []);

  // Share modal state (using shared hook)
  const shareModal = useShareModal();

  // Post menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPost, setMenuPost] = useState<UIPost | null>(null);

  // Memoized styles to prevent re-renders
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const listContentStyle = useMemo(() => ({
    ...styles.listContent,
    paddingTop: Math.max(headerHeight, 0),
  }), [headerHeight, styles]);

  // Fetch posts from tracked users
  const fetchPosts = useCallback(async (cursor?: string, refresh = false) => {
    const isInitial = !cursor;
    try {
      if (isInitial) setLoadError(null);
      const { data, nextCursor, hasMore: more, error } = await getFeedFromFollowed({
        cursor,
        limit: 10,
      });

      if (error) {
        if (__DEV__) console.warn('[FanFeed] Error fetching posts:', error);
        if (refresh) {
          // On refresh error: show toast but KEEP existing posts (non-destructive)
          showError('Refresh failed', 'Unable to load new posts. Please try again.');
          // Only clear posts if there are none (initial-like state)
          if (postsRef.current.length === 0) {
            setLoadError(error);
          }
        } else if (isInitial) {
          // Initial load error: no existing posts to preserve — show empty state
          setPosts([]);
          hasMoreRef.current = false;
          setHasMore(false);
          setLoadError(error);
        } else {
          // Load-more error: set error state so stale data is accompanied by an indicator
          setLoadError(error);
          loadMoreErrorCount.current += 1;
          if (loadMoreErrorCount.current >= 3) {
            hasMoreRef.current = false;
            setHasMore(false);
          }
        }
        return;
      }

      // Reset error count and clear any previous error on successful fetch
      loadMoreErrorCount.current = 0;
      setLoadError(null);

      // Handle null or undefined data
      if (!data || data.length === 0) {
        if (refresh || isInitial) {
          setPosts([]);
          hasMoreRef.current = false;
          setHasMore(false);
        } else {
          hasMoreRef.current = false;
          setHasMore(false);
        }
        nextCursorRef.current = null;
        return;
      }

      // Use batch functions for faster like/save checking (single query each)
      // Promise.allSettled: one failure must not break the entire feed
      const postIds = data.map(post => post.id);
      const [likedResult, savedResult] = await Promise.allSettled([
        hasLikedPostsBatch(postIds),
        hasSavedPostsBatch(postIds),
      ]);

      const likedMap = likedResult.status === 'fulfilled' ? likedResult.value : new Map<string, boolean>();
      const savedMap = savedResult.status === 'fulfilled' ? savedResult.value : new Map<string, boolean>();

      const likedIds = new Set<string>(
        postIds.filter(id => likedMap.get(id))
      );
      const savedIds = new Set<string>(
        postIds.filter(id => savedMap.get(id))
      );

      const transformedPosts = data.map(post => transformToFanPost(post, likedIds, savedIds));

      if (refresh || isInitial) {
        setPosts(transformedPosts);
      } else {
        // Deduplicate when appending — cursor pagination guarantees no overlap,
        // but guard against edge cases (e.g. posts created between requests)
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = transformedPosts.filter(p => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
      }

      nextCursorRef.current = nextCursor;
      hasMoreRef.current = more;
      setHasMore(more);
    } catch (err) {
      if (__DEV__) console.warn('[FanFeed] Error:', err);
      if (refresh) {
        // On refresh error: show toast but KEEP existing posts
        showError('Refresh failed', 'Unable to load new posts. Please try again.');
        if (postsRef.current.length === 0) {
          setLoadError('Unable to load feed. Check your connection and try again.');
        }
      } else if (isInitial) {
        // Initial load error: no existing posts to preserve
        setPosts([]);
        hasMoreRef.current = false;
        setHasMore(false);
        setLoadError('Unable to load feed. Check your connection and try again.');
      }
    }
  }, [showError]);

  // Fetch suggestions with pagination - uses refs to avoid re-render loops
  const fetchSuggestions = useCallback(async (append = false, force = false) => {
    // Allow force fetch to bypass loading check (used when following a user)
    if (loadingSuggestionsRef.current && !force) return;
    if (!hasMoreSuggestionsRef.current && !force) return;

    try {
      loadingSuggestionsRef.current = true;
      const cursor = append ? suggestionsCursorRef.current ?? undefined : undefined;
      const { data, error, nextCursor, hasMore: apiHasMore } = await getSuggestedProfiles(15, cursor); // Fetch 15 to have buffer

      // Stop retrying after too many consecutive errors
      if (error) {
        if (__DEV__) console.warn('[FanFeed] Error fetching suggestions:', error);
        suggestionsErrorCountRef.current += 1;
        if (suggestionsErrorCountRef.current >= MAX_SUGGESTIONS_ERRORS) {
          hasMoreSuggestionsRef.current = false;
          setSuggestionsExhausted(true);
        }
        // loadingSuggestionsRef reset handled by finally block
        return;
      }

      // Reset error count on success
      suggestionsErrorCountRef.current = 0;
      setSuggestionsExhausted(false);

      if (data && data.length > 0) {
        const transformed: UISuggestion[] = data.map((p: Profile) => ({
          id: p.id,
          name: resolveDisplayName(p),
          username: p.username || 'user',
          avatar: p.avatar_url || null,
          isVerified: !!p.is_verified,
          accountType: p.account_type || 'personal',
        }));

        if (append) {
          // Filter out duplicates and already followed users
          setSuggestions(prev => {
            const existingIds = new Set(prev.map(s => s.id));
            const newSuggestions = transformed.filter(s =>
              !existingIds.has(s.id) && !followedUserIds.current.has(s.id)
            );
            return [...prev, ...newSuggestions];
          });
        } else {
          // Filter out already followed users on initial load too
          const filtered = transformed.filter(s => !followedUserIds.current.has(s.id));
          setSuggestions(filtered);
        }

        suggestionsCursorRef.current = nextCursor ?? null;
        hasMoreSuggestionsRef.current = apiHasMore ?? data.length >= 10;
      } else {
        hasMoreSuggestionsRef.current = false;
      }
    } catch (err) {
      if (__DEV__) console.warn('[FanFeed] Error fetching suggestions:', err);
      suggestionsErrorCountRef.current += 1;
      if (suggestionsErrorCountRef.current >= MAX_SUGGESTIONS_ERRORS) {
        hasMoreSuggestionsRef.current = false;
        setSuggestionsExhausted(true);
      }
    } finally {
      loadingSuggestionsRef.current = false;
    }
  }, []);

  // Keep track of followed user IDs to exclude from suggestions
  const followedUserIds = useRef<Set<string>>(new Set());

  // When screen regains focus (e.g. returning from PostDetail or UserProfile),
  // re-sync like/save state and refresh suggestions
  const isFirstFocus = useRef(true);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }

      let cancelled = false;

      // Reset and refetch suggestions — the API excludes already-followed profiles
      suggestionsCursorRef.current = null;
      hasMoreSuggestionsRef.current = true;
      fetchSuggestions(false, true);

      // Remove posts deleted from detail screens
      const deletedPosts = useFeedStore.getState().deletedPostIds;
      if (Object.keys(deletedPosts).length > 0) {
        setPosts(prev => prev.filter(p => !deletedPosts[p.id]));
      }

      // Immediately apply like overrides from detail screens (no flash)
      const overrides = useFeedStore.getState().optimisticLikes;
      const overrideIds = Object.keys(overrides);
      if (overrideIds.length > 0) {
        setPosts(prev => prev.map(p => {
          const override = overrides[p.id];
          if (override !== undefined && override !== p.isLiked) {
            return { ...p, isLiked: override, likes: p.likes + (override ? 1 : -1) };
          }
          return p;
        }));
      }

      // Re-sync like/save state from database (backup for accuracy)
      // Clear optimistic overrides only AFTER authoritative data is applied
      const currentPosts = postsRef.current;
      if (currentPosts.length > 0) {
        const postIds = currentPosts.map(p => p.id);
        Promise.allSettled([
          hasLikedPostsBatch(postIds),
          hasSavedPostsBatch(postIds),
        ]).then(([likedResult, savedResult]) => {
          if (cancelled) return;
          const likedMap = likedResult.status === 'fulfilled' ? likedResult.value : new Map<string, boolean>();
          const savedMap = savedResult.status === 'fulfilled' ? savedResult.value : new Map<string, boolean>();
          setPosts(prev => prev.map(p => ({
            ...p,
            isLiked: likedMap.get(p.id) ?? p.isLiked,
            isSaved: savedMap.get(p.id) ?? p.isSaved,
          })));
          // Now that authoritative data is applied, clear overrides
          if (overrideIds.length > 0) {
            const applied = postIds.filter(id => id in overrides);
            if (applied.length > 0) {
              useFeedStore.getState().clearOptimisticLikes(applied);
            }
          }
        }).catch((err) => {
          if (__DEV__) console.warn('[FanFeed] Error syncing like/save state:', err);
        });
      } else if (overrideIds.length > 0) {
        // No posts to re-sync, clear overrides immediately
        useFeedStore.getState().clearOptimisticLikes(overrideIds);
      }

      return () => { cancelled = true; };
    }, [fetchSuggestions])
  );

  // Handle track/follow user - removes from list and immediately loads replacement
  const handleTrackUser = useCallback(async (userId: string) => {
    // Prevent double-tap: skip if already tracking this user
    if (trackingUserIds.has(userId)) {
      return;
    }

    try {
      // Mark as tracking to prevent double-tap
      setTrackingUserIds(prev => new Set([...prev, userId]));

      // Add to followed set to exclude from future suggestions
      followedUserIds.current.add(userId);

      // Capture the suggestion before removing (for rollback on error)
      let removedSuggestion: UISuggestion | undefined;
      setSuggestions(prev => {
        removedSuggestion = prev.find(s => s.id === userId);
        return prev.filter(s => s.id !== userId);
      });

      // Immediately fetch more suggestions to replace the removed one
      // Use force=true to bypass loading check
      fetchSuggestions(true, true);

      // Follow user in background (don't await to keep UI responsive)
      followUser(userId).then(() => {
        // If feed is empty, refresh to show new posts from followed user
        if (postsRef.current.length === 0) {
          fetchPosts(undefined, true);
        }
      }).catch(err => {
        if (__DEV__) console.warn('[FanFeed] Error following user:', err);
        // Rollback: remove from followed set and re-add suggestion
        followedUserIds.current.delete(userId);
        if (removedSuggestion) {
          setSuggestions(prev => [removedSuggestion!, ...prev]);
        }
      });
    } finally {
      // Remove from tracking set after a short delay to prevent rapid re-clicks
      // Store timeout ID for cleanup on unmount
      const timeoutId = setTimeout(() => {
        setTrackingUserIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        // Remove from timeout map after it fires
        trackingTimeoutsRef.current.delete(userId);
      }, 500);
      // Limit map size to prevent unbounded growth (M17)
      if (trackingTimeoutsRef.current.size > 50) {
        const firstKey = trackingTimeoutsRef.current.keys().next().value;
        if (firstKey !== undefined) {
          clearTimeout(trackingTimeoutsRef.current.get(firstKey));
          trackingTimeoutsRef.current.delete(firstKey);
        }
      }
      trackingTimeoutsRef.current.set(userId, timeoutId);
    }
  }, [trackingUserIds, fetchPosts, fetchSuggestions]);

  // Refill suggestions when running low - load more from database
  useEffect(() => {
    // Refill when we have less than 5 suggestions — respect hasMore (no force)
    if (suggestions.length < 5 && hasMoreSuggestionsRef.current) {
      fetchSuggestions(true);
    }
  }, [suggestions.length, fetchSuggestions]);

  // Initial load — deferred until after navigation animation completes
  useEffect(() => {
    setIsLoading(true);
    const task = InteractionManager.runAfterInteractions(() => {
      Promise.all([fetchPosts(), fetchSuggestions(false)]).finally(() => setIsLoading(false));
    });
    return () => task.cancel();
  }, [fetchPosts, fetchSuggestions]);

  // Filter out posts that are under review (SAFETY-2) or from muted/blocked users (SAFETY-3)
  const visiblePosts = useMemo(() =>
    posts.filter(post => {
      // Hide posts under review
      if (isUnderReview(String(post.id))) return false;
      // Hide posts from muted/blocked users
      const authorId = post.user?.id;
      if (authorId && isHidden(authorId)) return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, isUnderReview, isHidden, blockedUserIds, mutedUserIds]
  );

  // Prefetch profile data before navigation
  const prefetchProfile = usePrefetchProfile();

  // Navigate to user profile (or Profile tab if it's current user)
  const goToUserProfile = useCallback((userId: string) => {
    if (userId === currentUser?.id) {
      // Navigate to the Profile tab for current user
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      prefetchProfile(userId);
      navigation.navigate('UserProfile', { userId });
    }
  }, [navigation, currentUser?.id, prefetchProfile]);

  // Ref for latest visible posts (used in stable callback to avoid stale closure)
  const visiblePostsRef = useRef(visiblePosts);
  visiblePostsRef.current = visiblePosts;

  // Navigate to full-screen post detail (single tap on media)
  const handleOpenPostDetail = useCallback((post: UIPost) => {
    const currentPosts = visiblePostsRef.current;
    const fanFeedPosts = currentPosts.map(p => ({
      id: p.id,
      type: p.type,
      media: p.media || '',
      allMedia: p.allMedia,
      thumbnail: p.media || '',
      description: p.caption,
      likes: p.likes,
      comments: p.comments,
      location: p.location,
      taggedUsers: p.taggedUsers,
      user: {
        id: p.user.id,
        name: p.user.name,
        avatar: p.user.avatar || '',
        followsMe: false,
      },
    }));
    navigation.navigate('PostDetailFanFeed', { postId: post.id, fanFeedPosts });
  }, [navigation]);


  // Like/Save with optimistic update + rollback (shared hook)
  const { toggleLike, toggleSave } = usePostInteractions({
    setPosts,
    onSaveToggle: (_postId, saved) => {
      showSuccess(saved ? 'Saved' : 'Removed', saved ? 'Post added to your collection.' : 'Post removed from saved.');
    },
    onError: (action) => {
      showError('Action Failed', action === 'like' ? 'Could not update like. Please try again.' : 'Could not save post. Please try again.');
    },
  });

  // Handle share post
  const handleSharePost = useCallback((post: UIPost) => {
    shareModal.open({
      id: post.id,
      type: 'post',
      title: post.user.name,
      subtitle: post.caption,
      image: post.media,
      avatar: post.user.avatar,
    });
  }, [shareModal]);

  // Handle post menu
  const handlePostMenu = useCallback((post: UIPost) => {
    setMenuPost(post);
    setMenuVisible(true);
  }, []);

  // Handle report post — called from PostMenuModal with reason
  const handleReportPost = useCallback(async (reason: string) => {
    if (!menuPost) return;
    if (hasUserReported(menuPost.id)) {
      showError('Already Reported', 'You have already reported this content. It is under review.');
      return;
    }
    if (isUnderReview(String(menuPost.id))) {
      showError('Under Review', 'This content is already being reviewed by our team.');
      return;
    }
    const result = await submitPostReport(menuPost.id, reason);
    if (result.alreadyReported) {
      showError('Already Reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', result.message || 'Could not report post. Please try again.');
    }
  }, [menuPost, hasUserReported, isUnderReview, submitPostReport, showError, showSuccess]);

  // Handle mute user — uses userSafetyStore for proper state sync
  const handleMuteUser = useCallback(() => {
    if (!menuPost) return;
    const userId = menuPost.user.id;
    if (isUserMuted(userId)) {
      setMenuVisible(false);
      showError('Already Muted', 'This user is already muted.');
      return;
    }
    setMenuVisible(false);
    showDestructiveConfirm(
      'Mute User',
      `Mute ${menuPost.user.name}? You won't see their posts anymore.`,
      async () => {
        const { error } = await mute(userId);
        if (error) {
          showError('Error', 'Could not mute user. Please try again.');
        } else {
          showSuccess('Muted', `You won't see posts from ${menuPost.user.name} anymore.`);
          setPosts(prev => prev.filter(p => p.user.id !== userId));
        }
      }
    );
  }, [menuPost, isUserMuted, mute, showDestructiveConfirm, showSuccess, showError]);

  // Handle block user — uses userSafetyStore for proper state sync
  const handleBlockUser = useCallback(() => {
    if (!menuPost) return;
    const userId = menuPost.user.id;
    if (isBlocked(userId)) {
      setMenuVisible(false);
      showError('Already Blocked', 'This user is already blocked.');
      return;
    }
    setMenuVisible(false);
    showDestructiveConfirm(
      'Block User',
      `Block ${menuPost.user.name}? You will no longer see their posts and they won't be able to interact with you.`,
      async () => {
        const { error } = await block(userId);
        if (error) {
          showError('Error', 'Could not block user. Please try again.');
        } else {
          showSuccess('Blocked', `${menuPost.user.name} has been blocked.`);
          setPosts(prev => prev.filter(p => p.user.id !== userId));
        }
      }
    );
  }, [menuPost, isBlocked, block, showDestructiveConfirm, showSuccess, showError]);

  // Handle delete own post
  const handleDeletePost = useCallback(() => {
    if (!menuPost) return;
    setMenuVisible(false);
    showDestructiveConfirm(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      async () => {
        const { error } = await deletePost(menuPost.id);
        if (error) {
          showError('Error', 'Could not delete post. Please try again.');
        } else {
          showSuccess('Deleted', 'Post has been deleted.');
          setPosts(prev => prev.filter(p => p.id !== menuPost.id));
        }
      }
    );
  }, [menuPost, showDestructiveConfirm, showSuccess, showError]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    nextCursorRef.current = null;
    loadMoreErrorCount.current = 0;
    carouselIndexesRef.current = {};
    prefetchedUrlsRef.current.clear();
    await fetchPosts(undefined, true);
    setRefreshing(false);
  }, [fetchPosts]);

  // Load more posts (cursor-based)
  // Uses refs for guards to avoid stale closures from rapid onEndReached
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !nextCursorRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchPosts(nextCursorRef.current);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPosts]);

  // Render suggestion item
  const renderSuggestion = useCallback((suggestion: UISuggestion, _index: number) => {
    const isTracking = trackingUserIds.has(suggestion.id);
    const firstName = suggestion.name.split(' ')[0] || suggestion.name;
    return (
      <View
        key={`suggestion-${suggestion.id}`}
        style={styles.suggestionItem}
        accessible={true}
        accessibilityLabel={`${suggestion.name}${suggestion.isVerified ? ', verified' : ''}, suggested user`}
      >
        <TouchableOpacity
          style={styles.suggestionAvatarWrapper}
          onPress={() => goToUserProfile(suggestion.id)}
          accessibilityLabel={`View ${suggestion.name}'s profile`}
          accessibilityRole="button"
          accessibilityHint="Opens user profile"
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            style={styles.suggestionRing}
          >
            <View style={styles.suggestionAvatarContainer}>
              <AvatarImage source={suggestion.avatar} size={72} />
            </View>
          </LinearGradient>
          <AccountBadge
            size={14}
            style={styles.verifiedBadgeSuggestion}
            isVerified={suggestion.isVerified}
            accountType={suggestion.accountType}
          />
        </TouchableOpacity>
        <Text style={styles.suggestionName} numberOfLines={1}>
          {firstName}
        </Text>
        <LiquidButton
          label={isTracking ? 'Tracking' : 'Track'}
          onPress={() => handleTrackUser(suggestion.id)}
          disabled={isTracking}
          size="xs"
          accessibilityLabel={`Follow ${suggestion.name}`}
          accessibilityHint="Double tap to follow this user"
        />
      </View>
    );
  }, [goToUserProfile, handleTrackUser, trackingUserIds, styles]);

  const handleCloseMenu = useCallback(() => setMenuVisible(false), []);

  const handleNavigateSearch = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  const handleRetryFetch = useCallback(() => {
    fetchPosts(undefined, true);
  }, [fetchPosts]);

  const handleLikersPress = useCallback((postId: string) => {
    navigation.navigate('PostLikers', { postId });
  }, [navigation]);

  // Prefetch upcoming images as user scrolls for faster feed rendering
  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    if (!viewableItems.length) return;
    const maxIndex = Math.max(...viewableItems.map(v => v.index ?? 0));
    const upcoming = visiblePosts.slice(maxIndex + 1, maxIndex + 8);
    const urls = upcoming
      .map(p => getMediaVariant(p.media, 'medium', p.mediaMeta))
      .filter((url): url is string => typeof url === 'string' && !prefetchedUrlsRef.current.has(url));
    if (urls.length > 0) {
      urls.forEach(url => prefetchedUrlsRef.current.add(url));
      preloadImages(urls);
    }
  }, [visiblePosts]);
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Handle carousel index changes from PostItem (persisted in parent ref)
  const handleCarouselIndexChange = useCallback((postId: string, index: number) => {
    carouselIndexesRef.current[postId] = index;
  }, []);

  // Render post item for FlashList — delegates to memoized PostItem
  const renderPost = useCallback(({ item: post, index }: { item: UIPost; index: number }) => (
    <PostItem
      post={post}
      isLast={index === visiblePostsRef.current.length - 1}
      colors={colors}
      styles={styles}
      onUserPress={goToUserProfile}
      onLike={toggleLike}
      onSave={toggleSave}
      onMenu={handlePostMenu}
      onShare={handleSharePost}
      onDetail={handleOpenPostDetail}
      onLikersPress={handleLikersPress}
      initialCarouselIndex={carouselIndexesRef.current[post.id] ?? 0}
      onCarouselIndexChange={handleCarouselIndexChange}
    />
  ), [colors, styles, goToUserProfile, toggleLike, toggleSave, handlePostMenu, handleSharePost, handleOpenPostDetail, handleLikersPress, handleCarouselIndexChange]);

  // Invite friends using native share
  const inviteFriends = useCallback(async () => {
    try {
      await Share.share({
        message: 'Join me on Smuppy - the fitness social network! Download now: https://smuppy.app/download',
        title: 'Join Smuppy',
      });
    } catch (error) {
      if (__DEV__) console.warn('Error sharing:', error);
    }
  }, []);

  // List header with suggestions - ALWAYS show (even without suggestions)
  const ListHeader = useMemo(() => (
    <View style={styles.suggestionsSection} accessible={true} accessibilityLabel="Suggested users to follow">
      <View style={styles.suggestionsSectionHeader}>
        <Text style={styles.suggestionsSectionTitle}>Suggestions</Text>
        <TouchableOpacity
          onPress={handleNavigateSearch}
          accessibilityLabel="See all suggestions"
          accessibilityRole="button"
          accessibilityHint="Opens search to find more users"
        >
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.suggestionsRow}>
        {/* Invite Friends Button - fixed, non-scrollable */}
        <View style={styles.suggestionItem}>
          <TouchableOpacity
            style={styles.inviteButton}
            onPress={inviteFriends}
            accessibilityLabel="Invite friends to Smuppy"
            accessibilityRole="button"
            accessibilityHint="Opens share dialog to invite friends"
          >
            <LinearGradient
              colors={isDark ? ['#1A2A1F', '#2A3A2F'] : ['#E8F5E9', '#C8E6C9']}
              style={styles.inviteButtonInner}
            >
              <Ionicons name="person-add" size={28} color={colors.primary} />
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.suggestionName} numberOfLines={1}>
            Invite
          </Text>
          <LiquidButton
            label="Friends"
            onPress={inviteFriends}
            size="xs"
            variant="outline"
          />
        </View>
        {suggestions.length === 0 && suggestionsExhausted ? (
          <View style={styles.suggestionsEmpty}>
            <Text style={styles.suggestionsEmptyText}>No recommendations available right now</Text>
            <TouchableOpacity
              style={styles.suggestionsEmptyCTA}
              onPress={handleNavigateSearch}
              accessibilityRole="button"
              accessibilityLabel="Explore users"
              accessibilityHint="Opens search to find people to follow"
            >
              <Ionicons name="search-outline" size={16} color={colors.primary} />
              <Text style={styles.suggestionsEmptyCTAText}>Explore</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsScrollContent}
            accessibilityRole="list"
            accessibilityLabel="Suggested users"
          >
            {suggestions.map((item, index) => renderSuggestion(item, index))}
          </ScrollView>
        )}
      </View>
    </View>
  ), [suggestions, suggestionsExhausted, renderSuggestion, handleNavigateSearch, inviteFriends, styles, colors, isDark]);

  // List footer with loading indicator
  const ListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    // Only show "All Caught Up" when there IS content and user has seen it all
    if (!hasMore && postsRef.current.length > 0) {
      return (
        <View style={styles.endOfFeed}>
          <Ionicons name="checkmark-circle" size={50} color={colors.primary} />
          <Text style={styles.endOfFeedTitle}>You're All Caught Up</Text>
          <Text style={styles.endOfFeedSubtitle}>
            You've seen all posts from people you follow
          </Text>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, styles, colors]);

  const keyExtractor = useCallback((item: UIPost) => String(item.id), []);
  const getItemType = useCallback((item: UIPost) => {
    if (item.allMedia && item.allMedia.length > 1) return 'carousel';
    return item.type === 'video' ? 'video' : 'image';
  }, []);

  // Empty state component
  const EmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <Ionicons name={loadError ? "cloud-offline-outline" : "people-outline"} size={64} color={colors.grayMuted} />
      <Text style={styles.emptyStateTitle}>{loadError ? 'Connection Issue' : 'No posts yet'}</Text>
      <Text style={styles.emptyStateSubtitle}>
        {loadError || 'Follow people to see their content here'}
      </Text>
      {loadError ? (
        <TouchableOpacity
          style={styles.emptyStateButton}
          onPress={handleRetryFetch}
        >
          <Text style={styles.emptyStateButtonText}>Retry</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.emptyStateButton}
          onPress={handleNavigateSearch}
        >
          <Text style={styles.emptyStateButtonText}>Find People</Text>
        </TouchableOpacity>
      )}
    </View>
  ), [handleNavigateSearch, styles, colors, loadError, handleRetryFetch]);

  // Navigate to Peaks screen - MUST be before any conditional returns (Rules of Hooks)
  const openPeaks = useCallback(() => {
    navigation.navigate('Peaks');
  }, [navigation]);

  // Loading state — show skeleton instead of spinner
  if (isLoading && posts.length === 0) {
    return <FeedSkeleton />;
  }

  return (
    <View style={styles.container}>
      {/* Swipe down to open Peaks - Smuppy unique gesture */}
      <SwipeToPeaks onOpenPeaks={openPeaks}>
        {/* FlashList - 10x faster than FlatList */}
        <FlashList<UIPost>
          ref={listRef}
          data={visiblePosts}
          renderItem={renderPost}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          {...{ estimatedItemSize: 550 } as Record<string, number>}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={EmptyState}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              progressViewOffset={headerHeight}
            />
          }
          contentContainerStyle={listContentStyle}
        />
      </SwipeToPeaks>

      {/* Share Post Modal */}
      <SharePostModal
        visible={shareModal.isVisible}
        content={shareModal.data}
        onClose={shareModal.close}
      />

      {/* Post Menu + Report Modal */}
      <PostMenuModal
        visible={menuVisible}
        onClose={handleCloseMenu}
        post={menuPost ? { id: menuPost.id, authorId: menuPost.user.id } : null}
        isOwnPost={!!menuPost && menuPost.user.id === currentUser?.id}
        onDelete={handleDeletePost}
        onMute={handleMuteUser}
        onBlock={handleBlockUser}
        onReport={handleReportPost}
        hasReported={menuPost ? hasUserReported(menuPost.id) : false}
        isUnderReview={menuPost ? isUnderReview(String(menuPost.id)) : false}
      />
    </View>
  );
});

export default FanFeed;

const createStyles = (colors: typeof import('../../config/theme').COLORS, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Suggestions Section - Compact spacing
  suggestionsSection: {
    paddingTop: 0,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  suggestionsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: 4,
  },
  suggestionsSectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: colors.dark,
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: colors.primary,
  },
  suggestionsRow: {
    flexDirection: 'row',
  },
  suggestionsScrollContent: {
    paddingHorizontal: SPACING.sm,
    gap: 0,
  },
  suggestionsEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  suggestionsEmptyText: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
  },
  suggestionsEmptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: 6,
  },
  suggestionsEmptyCTAText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: colors.primary,
  },
  suggestionItem: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 88,
  },
  suggestionAvatarWrapper: {
    position: 'relative',
  },
  suggestionRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    padding: 2,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionAvatarContainer: {
    backgroundColor: colors.background,
    borderRadius: 38,
    padding: 2,
  },
  verifiedBadgeSuggestion: {
    position: 'absolute',
    bottom: 3,
    right: -2,
  },
  suggestionName: {
    fontSize: 14,
    color: colors.dark,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    marginBottom: 4,
  },
  // Invite button
  inviteButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },

  // Post
  postContainer: {
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.sm,
    marginBottom: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    // Pronounced outer 3D shadow effect
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  postUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  postUserInfo: {
    marginLeft: SPACING.sm,
    flex: 1,
  },
  postUserNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postUserName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.dark,
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  teamBadge: {
    marginLeft: 6,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  teamBadgeText: {
    fontSize: 9,
    fontFamily: 'Poppins-SemiBold',
    color: colors.primary,
  },
  postMeta: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.gray,
  },
  postMore: {
    padding: 4,
  },
  postMedia: {
    width: width,
    height: width * 1.1,
    backgroundColor: colors.grayBorder,
  },
  carouselMediaItem: {
    width: width,
    height: width * 1.1,
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  videoDurationText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: '#fff',
  },
  carouselIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  carouselCount: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: '#fff',
    marginLeft: 4,
  },
  carouselPagination: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
  },
  postActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postAction: {
    marginRight: SPACING.base,
    padding: 4,
  },
  postActionLike: {
    marginRight: SPACING.base,
    padding: 6,
  },
  postLikes: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.dark,
    paddingHorizontal: SPACING.base,
  },
  postCaption: {
    paddingHorizontal: SPACING.base,
    marginTop: 4,
  },
  postCaptionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  postCaptionUser: {
    fontFamily: 'Poppins-SemiBold',
  },
  postTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.base,
    marginTop: 4,
    gap: 6,
  },
  postTag: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.primary,
  },
  taggedUsersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginTop: 4,
    gap: 4,
  },
  taggedUsersText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
    flex: 1,
  },
  postDivider: {
    height: 8,
    backgroundColor: colors.backgroundSecondary,
    marginTop: SPACING.md,
  },

  // End of Feed
  endOfFeed: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  endOfFeedTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
    marginTop: SPACING.md,
  },
  endOfFeedSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginTop: 4,
    textAlign: 'center',
  },

  // Pagination styles
  listContent: {
    paddingBottom: 100,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.md,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 100,
  },
  emptyStateTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    color: colors.dark,
    marginTop: SPACING.lg,
  },
  emptyStateSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  emptyStateButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 25,
    marginTop: SPACING.lg,
  },
  emptyStateButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.background,
  },

});
