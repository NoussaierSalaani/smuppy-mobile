import React, { useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { AccountBadge } from '../../components/Badge';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import DoubleTapLike from '../../components/DoubleTapLike';
import SwipeToPeaks from '../../components/SwipeToPeaks';
import { useContentStore } from '../../store/contentStore';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import SharePostModal from '../../components/SharePostModal';
import { getFeedFromFollowed, likePost, unlikePost, getSuggestedProfiles, followUser, Post, Profile, hasLikedPostsBatch } from '../../services/database';

const { width } = Dimensions.get('window');

// Suggestion interface for the UI
interface UISuggestion {
  id: string;
  name: string;
  username: string;
  avatar: string;
  isVerified: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_local';
}

// Transform Post from database to UI format
interface UIPost {
  id: string;
  type: 'image' | 'video' | 'carousel';
  media: string;
  slideCount?: number;
  duration?: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar: string;
    isVerified: boolean;
    isBot?: boolean;
    accountType?: 'personal' | 'pro_creator' | 'pro_local';
  };
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  isLiked: boolean;
  isSaved: boolean;
  timeAgo: string;
  location: string | null;
}

// Transform Post from database to UI format
// Handles both new format (media_urls, content) and legacy format (media_url, caption)
const transformPostToUI = (post: Post, likedPostIds: Set<string>): UIPost => {
  const getTimeAgo = (dateString: string): string => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get media URL - support both array and single string formats
  const mediaUrl = post.media_urls?.[0] || post.media_url || 'https://via.placeholder.com/800x1000';

  // Get content - support both 'content' and 'caption' fields
  const contentText = post.content || post.caption || '';

  // Determine media type - normalize 'photo' to 'image'
  const normalizedType = post.media_type === 'photo' ? 'image' : post.media_type;

  return {
    id: post.id,
    type: normalizedType === 'video' ? 'video' : normalizedType === 'multiple' ? 'carousel' : 'image',
    media: mediaUrl,
    slideCount: normalizedType === 'multiple' ? (post.media_urls?.length || 1) : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || 'User',
      username: `@${post.author?.username || 'user'}`,
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
      isVerified: post.author?.is_verified || false,
      isBot: post.author?.is_bot || false,
      accountType: post.author?.account_type || 'personal',
    },
    caption: contentText,
    likes: post.likes_count || 0,
    comments: post.comments_count || 0,
    shares: 0,
    saves: 0,
    isLiked: likedPostIds.has(post.id),
    isSaved: false,
    timeAgo: getTimeAgo(post.created_at),
    location: post.location || null,
  };
};

interface FanFeedProps {
  headerHeight?: number;
}

export interface FanFeedRef {
  scrollToTop: () => void;
}

const FanFeed = forwardRef<FanFeedRef, FanFeedProps>(({ headerHeight = 0 }, ref) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const { handleScroll, showBars } = useTabBar();
  const listRef = useRef<any>(null);

  // Expose scrollToTop method to parent
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      showBars();
    },
  }));
  const { isUnderReview } = useContentStore();
  const { isHidden } = useUserSafetyStore();

  // State for real posts from API
  const [posts, setPosts] = useState<UIPost[]>([]);
  const [, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<UISuggestion[]>([]);
  const suggestionsOffsetRef = useRef(0);
  const loadingSuggestionsRef = useRef(false);
  const hasMoreSuggestionsRef = useRef(true);
  const [trackingUserIds, setTrackingUserIds] = useState<Set<string>>(new Set());

  // Share modal state
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [postToShare, setPostToShare] = useState<{
    id: string;
    media: string;
    caption?: string;
    user: { name: string; avatar: string };
  } | null>(null);

  // Post menu state
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPost, setMenuPost] = useState<UIPost | null>(null);

  // Memoized styles to prevent re-renders
  const listContentStyle = useMemo(() => ({
    ...styles.listContent,
    paddingTop: headerHeight > 0 ? headerHeight : 0,
  }), [headerHeight]);

  // Fetch posts from tracked users
  const fetchPosts = useCallback(async (pageNum = 0, refresh = false) => {
    try {
      const { data, error } = await getFeedFromFollowed(pageNum, 10);

      if (error) {
        console.error('[FanFeed] Error fetching posts:', error);
        // On error, still update state to avoid stuck loading
        if (refresh || pageNum === 0) {
          setPosts([]);
          setHasMore(false);
        }
        return;
      }

      // Handle null or undefined data
      if (!data) {
        console.warn('[FanFeed] No data returned');
        if (refresh || pageNum === 0) {
          setPosts([]);
          setHasMore(false);
        }
        return;
      }

      if (data.length > 0) {
        // Use batch function for faster like checking (single query)
        const postIds = data.map(post => post.id);
        const likedMap = await hasLikedPostsBatch(postIds);

        const likedIds = new Set<string>(
          postIds.filter(id => likedMap.get(id))
        );

        const transformedPosts = data.map(post => transformPostToUI(post, likedIds));

        if (refresh || pageNum === 0) {
          setPosts(transformedPosts);
          setLikedPostIds(likedIds);
        } else {
          setPosts(prev => [...prev, ...transformedPosts]);
          setLikedPostIds(prev => new Set([...prev, ...likedIds]));
        }

        setHasMore(data.length >= 10);
      } else {
        // Empty data array
        if (refresh || pageNum === 0) {
          setPosts([]);
          setLikedPostIds(new Set());
        }
        setHasMore(false);
      }
    } catch (err) {
      console.error('[FanFeed] Error:', err);
      // On exception, also clear loading state
      if (refresh) {
        setPosts([]);
        setHasMore(false);
      }
    }
  }, []);

  // Fetch suggestions with pagination - uses refs to avoid re-render loops
  const fetchSuggestions = useCallback(async (append = false) => {
    if (loadingSuggestionsRef.current || !hasMoreSuggestionsRef.current) return;

    try {
      loadingSuggestionsRef.current = true;
      const offset = append ? suggestionsOffsetRef.current : 0;
      const { data, error } = await getSuggestedProfiles(10, offset);

      // Stop retrying on error
      if (error) {
        console.error('[FanFeed] Error fetching suggestions:', error);
        hasMoreSuggestionsRef.current = false;
        loadingSuggestionsRef.current = false;
        return;
      }

      if (data && data.length > 0) {
        const transformed: UISuggestion[] = data.map((p: Profile) => ({
          id: p.id,
          name: p.full_name || p.username || 'User',
          username: p.username || 'user',
          avatar: p.avatar_url || 'https://via.placeholder.com/100',
          isVerified: p.is_verified || false,
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
          setSuggestions(transformed);
        }

        suggestionsOffsetRef.current = offset + data.length;
        hasMoreSuggestionsRef.current = data.length >= 10;
      } else {
        hasMoreSuggestionsRef.current = false;
      }
    } catch (err) {
      console.error('[FanFeed] Error fetching suggestions:', err);
      hasMoreSuggestionsRef.current = false;
    } finally {
      loadingSuggestionsRef.current = false;
    }
  }, []);

  // Keep track of followed user IDs to exclude from suggestions
  const followedUserIds = useRef<Set<string>>(new Set());

  // Handle track/follow user - removes from list without scroll reset
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

      // Remove from suggestions immediately (smooth animation)
      setSuggestions(prev => prev.filter(s => s.id !== userId));

      await followUser(userId);

      // If feed is empty, refresh to show new posts from followed user
      if (posts.length === 0) {
        await fetchPosts(0, true);
      }
    } catch (err) {
      console.error('[FanFeed] Error following user:', err);
      // On error, remove from followed set
      followedUserIds.current.delete(userId);
    } finally {
      // Remove from tracking set
      setTrackingUserIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  }, [trackingUserIds, posts.length, fetchPosts]);

  // Refill suggestions when running low - load more from database
  useEffect(() => {
    // Refill when we have less than 3 suggestions
    if (suggestions.length < 3 && suggestions.length >= 0) {
      fetchSuggestions(true);
    }
  }, [suggestions.length, fetchSuggestions]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchPosts(0), fetchSuggestions(false)]).finally(() => setIsLoading(false));
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
    [posts, isUnderReview, isHidden]
  );

  // Navigate to user profile
  const goToUserProfile = useCallback((userId: string) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  // Format numbers
  const formatNumber = useCallback((num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }, []);

  // Toggle like with real API
  const toggleLike = useCallback(async (postId: string) => {
    // Get current like status from state using functional update
    let wasLiked = false;

    // Optimistic update and capture current state
    setPosts(prevPosts => {
      const post = prevPosts.find(p => p.id === postId);
      if (post) wasLiked = post.isLiked;

      return prevPosts.map(p => {
        if (p.id === postId) {
          return {
            ...p,
            isLiked: !p.isLiked,
            likes: p.isLiked ? p.likes - 1 : p.likes + 1,
          };
        }
        return p;
      });
    });

    try {
      if (wasLiked) {
        // Unlike
        const { error } = await unlikePost(postId);
        if (error) {
          // Revert on error
          setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === postId) {
              return { ...p, isLiked: true, likes: p.likes + 1 };
            }
            return p;
          }));
        } else {
          setLikedPostIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(postId);
            return newSet;
          });
        }
      } else {
        // Like
        const { error } = await likePost(postId);
        if (error) {
          // Revert on error
          setPosts(prevPosts => prevPosts.map(p => {
            if (p.id === postId) {
              return { ...p, isLiked: false, likes: p.likes - 1 };
            }
            return p;
          }));
        } else {
          setLikedPostIds(prev => new Set([...prev, postId]));
        }
      }
    } catch (err) {
      console.error('[FanFeed] Like toggle error:', err);
    }
  }, []);

  // Toggle save
  const toggleSave = useCallback((postId: string) => {
    setPosts(prevPosts => prevPosts.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isSaved: !post.isSaved,
          saves: post.isSaved ? post.saves - 1 : post.saves + 1,
        };
      }
      return post;
    }));
  }, []);

  // Handle share post
  const handleSharePost = useCallback((post: UIPost) => {
    setPostToShare({
      id: post.id,
      media: post.media,
      caption: post.caption,
      user: {
        name: post.user.name,
        avatar: post.user.avatar,
      },
    });
    setShareModalVisible(true);
  }, []);

  // Handle post menu
  const handlePostMenu = useCallback((post: UIPost) => {
    setMenuPost(post);
    setMenuVisible(true);
  }, []);

  // Handle report post
  const handleReportPost = useCallback(() => {
    if (!menuPost) return;
    setMenuVisible(false);
    Alert.alert(
      'Report Post',
      'Are you sure you want to report this post?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Reported', 'Thank you for your report. We will review it.');
          },
        },
      ]
    );
  }, [menuPost]);

  // Handle mute user
  const handleMuteUser = useCallback(() => {
    if (!menuPost) return;
    setMenuVisible(false);
    Alert.alert(
      'Mute User',
      `Mute ${menuPost.user.name}? You won't see their posts anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mute',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Muted', `You won't see posts from ${menuPost.user.name} anymore.`);
          },
        },
      ]
    );
  }, [menuPost]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    await fetchPosts(0, true);
    setRefreshing(false);
  }, [fetchPosts]);

  // Load more posts
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchPosts(nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchPosts]);

  // Render suggestion item
  const renderSuggestion = useCallback((suggestion: UISuggestion, index: number) => {
    const isTracking = trackingUserIds.has(suggestion.id);
    return (
      <View key={`suggestion-${index}-${suggestion.id}`} style={styles.suggestionItem}>
        <TouchableOpacity
          style={styles.suggestionAvatarWrapper}
          onPress={() => goToUserProfile(suggestion.id)}
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
          {suggestion.name.split(' ')[0]}
        </Text>
        <TouchableOpacity
          style={[styles.trackButton, isTracking && styles.trackButtonDisabled]}
          onPress={() => handleTrackUser(suggestion.id)}
          disabled={isTracking}
        >
          <Text style={styles.trackButtonText}>{isTracking ? '...' : 'Track'}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [goToUserProfile, handleTrackUser, trackingUserIds]);

  // Render post item for FlashList
  const renderPost = useCallback(({ item: post, index }: { item: UIPost; index: number }) => (
    <View style={styles.postContainer}>
      {/* Header */}
      <View style={styles.postHeader}>
        <TouchableOpacity
          style={styles.postUser}
          onPress={() => goToUserProfile(post.user.id)}
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
        <TouchableOpacity style={styles.postMore} onPress={() => handlePostMenu(post)}>
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.dark} />
        </TouchableOpacity>
      </View>

      {/* Media - Using OptimizedImage with caching + Double Tap to Like */}
      <DoubleTapLike
        onDoubleTap={() => {
          if (!post.isLiked) {
            toggleLike(post.id);
          }
        }}
        onSingleTap={() => navigation.navigate('PostDetailFanFeed', {
          postId: post.id,
          fanFeedPosts: visiblePosts.map(p => ({
            id: p.id,
            type: p.type,
            media: p.media,
            thumbnail: p.media,
            description: p.caption,
            likes: p.likes,
            comments: p.comments,
            user: {
              id: p.user.id,
              name: p.user.name,
              avatar: p.user.avatar,
              followsMe: false,
            },
          }))
        })}
        showAnimation={!post.isLiked}
      >
        <View style={styles.postMedia}>
          <OptimizedImage
            source={post.media}
            style={styles.postImage}
            contentFit="cover"
            recyclingKey={`post-${post.id}`}
          />

          {/* Video overlay */}
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

          {/* Carousel indicator */}
          {post.type === 'carousel' && (
            <View style={styles.carouselIndicator}>
              <Ionicons name="copy" size={16} color="#fff" />
              <Text style={styles.carouselCount}>{post.slideCount}</Text>
            </View>
          )}
        </View>
      </DoubleTapLike>

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={styles.postActionsLeft}>
          <TouchableOpacity
            style={styles.postActionLike}
            onPress={() => toggleLike(post.id)}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            activeOpacity={0.7}
          >
            <SmuppyHeartIcon
              size={26}
              color={post.isLiked ? "#FF6B6B" : COLORS.dark}
              filled={post.isLiked}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.postAction}
            onPress={() => handleSharePost(post)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="paper-plane-outline" size={22} color={COLORS.dark} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => toggleSave(post.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={post.isSaved ? "bookmark" : "bookmark-outline"}
            size={22}
            color={post.isSaved ? COLORS.primary : COLORS.dark}
          />
        </TouchableOpacity>
      </View>

      {/* Likes */}
      <Text style={styles.postLikes}>{formatNumber(post.likes)} likes</Text>

      {/* Caption */}
      <View style={styles.postCaption}>
        <Text style={styles.postCaptionText}>
          <Text
            style={styles.postCaptionUser}
            onPress={() => goToUserProfile(post.user.id)}
          >
            {post.user.name}
          </Text>
          {'  '}{post.caption}
        </Text>
      </View>


      {/* Divider */}
      {index < visiblePosts.length - 1 && <View style={styles.postDivider} />}
    </View>
  ), [visiblePosts, goToUserProfile, toggleLike, toggleSave, formatNumber, navigation, handlePostMenu, handleSharePost]);

  // List header with suggestions
  const ListHeader = useMemo(() => (
    suggestions.length > 0 ? (
      <View style={styles.suggestionsSection}>
        <View style={styles.suggestionsSectionHeader}>
          <Text style={styles.suggestionsSectionTitle}>Suggestions</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Search')}>
            <Text style={styles.seeAllText}>See all</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsScrollContent}
        >
          {suggestions.map(renderSuggestion)}
        </ScrollView>
      </View>
    ) : null
  ), [suggestions, renderSuggestion, navigation]);

  // List footer with loading indicator
  const ListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      );
    }
    // Only show "All Caught Up" when there IS content and user has seen it all
    if (!hasMore && posts.length > 0) {
      return (
        <View style={styles.endOfFeed}>
          <Ionicons name="checkmark-circle" size={50} color={COLORS.primary} />
          <Text style={styles.endOfFeedTitle}>You're All Caught Up</Text>
          <Text style={styles.endOfFeedSubtitle}>
            You've seen all posts from people you follow
          </Text>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, posts.length]);

  const keyExtractor = useCallback((item: UIPost) => String(item.id), []);


  // Empty state component
  const EmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={64} color={COLORS.grayMuted} />
      <Text style={styles.emptyStateTitle}>No Posts Yet</Text>
      <Text style={styles.emptyStateSubtitle}>
        Track some users to see their posts here
      </Text>
      <TouchableOpacity
        style={styles.emptyStateButton}
        onPress={() => navigation.navigate('Search')}
      >
        <Text style={styles.emptyStateButtonText}>Find People</Text>
      </TouchableOpacity>
    </View>
  ), [navigation]);

  // Navigate to Peaks screen - MUST be before any conditional returns (Rules of Hooks)
  const openPeaks = useCallback(() => {
    navigation.navigate('Peaks');
  }, [navigation]);

  // Loading state
  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
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
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={EmptyState}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressViewOffset={headerHeight}
            />
          }
          contentContainerStyle={listContentStyle}
        />
      </SwipeToPeaks>

      {/* Share Post Modal */}
      <SharePostModal
        visible={shareModalVisible}
        post={postToShare}
        onClose={() => {
          setShareModalVisible(false);
          setPostToShare(null);
        }}
      />

      {/* Post Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={handleReportPost}>
              <Ionicons name="flag-outline" size={22} color={COLORS.dark} />
              <Text style={styles.menuItemText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleMuteUser}>
              <Ionicons name="volume-mute-outline" size={22} color={COLORS.dark} />
              <Text style={styles.menuItemText}>Mute User</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => setMenuVisible(false)}
            >
              <Ionicons name="close-outline" size={22} color={COLORS.gray} />
              <Text style={[styles.menuItemText, { color: COLORS.gray }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

export default FanFeed;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Suggestions Section - Compact spacing
  suggestionsSection: {
    paddingTop: 0,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
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
    color: COLORS.dark,
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: COLORS.primary,
  },
  suggestionsScrollContent: {
    paddingHorizontal: SPACING.sm,
    gap: 0,
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
    backgroundColor: COLORS.white,
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
    color: COLORS.dark,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    marginBottom: 4,
  },
  trackButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  trackButtonDisabled: {
    opacity: 0.6,
  },
  trackButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: COLORS.white,
  },
  trackedButton: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },

  // Post
  postContainer: {
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.sm,
    marginBottom: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    // Shadow 3D effet extérieur prononcé
    shadowColor: '#000',
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
    color: COLORS.dark,
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
    color: COLORS.primary,
  },
  postMeta: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.gray,
  },
  postMore: {
    padding: 4,
  },
  postMedia: {
    width: width,
    height: width * 1.1,
    backgroundColor: COLORS.grayLight,
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
    color: COLORS.dark,
    paddingHorizontal: SPACING.base,
  },
  postCaption: {
    paddingHorizontal: SPACING.base,
    marginTop: 4,
  },
  postCaptionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.dark,
    lineHeight: 20,
  },
  postCaptionUser: {
    fontFamily: 'Poppins-SemiBold',
  },
  postDivider: {
    height: 8,
    backgroundColor: COLORS.backgroundSecondary,
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
    color: COLORS.dark,
    marginTop: SPACING.md,
  },
  endOfFeedSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 4,
    textAlign: 'center',
  },

  // Comments Modal
  commentsContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  commentsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  commentsTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  commentItem: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
  },
  commentContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  commentUser: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: COLORS.dark,
  },
  commentText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.dark,
    marginTop: 2,
  },
  commentTime: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayLight,
  },
  commentInputField: {
    flex: 1,
    marginHorizontal: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 20,
  },
  commentInputPlaceholder: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.grayMuted,
  },
  commentPostBtn: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: COLORS.primary,
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
    backgroundColor: COLORS.white,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
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
    color: COLORS.dark,
    marginTop: SPACING.lg,
  },
  emptyStateSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  emptyStateButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 25,
    marginTop: SPACING.lg,
  },
  emptyStateButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: COLORS.white,
  },

  // Post Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: SPACING.md,
    paddingBottom: 34,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.dark,
    marginLeft: SPACING.md,
  },
});
