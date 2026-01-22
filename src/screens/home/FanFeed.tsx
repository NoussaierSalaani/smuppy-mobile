import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import DoubleTapLike from '../../components/DoubleTapLike';
import SwipeToPeaks from '../../components/SwipeToPeaks';
import { useContentStore } from '../../store/contentStore';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import { getFeedFromFollowed, likePost, unlikePost, hasLikedPost, getSuggestedProfiles, followUser, Post, Profile } from '../../services/database';

const { width } = Dimensions.get('window');

// Suggestion interface for the UI
interface UISuggestion {
  id: string;
  name: string;
  username: string;
  avatar: string;
  isVerified: boolean;
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

  return {
    id: post.id,
    type: post.media_type === 'video' ? 'video' : post.media_type === 'multiple' ? 'carousel' : 'image',
    media: post.media_urls?.[0] || 'https://via.placeholder.com/800x1000',
    slideCount: post.media_type === 'multiple' ? post.media_urls?.length : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || 'User',
      username: `@${post.author?.username || 'user'}`,
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
      isVerified: post.author?.is_verified || false,
    },
    caption: post.content || '',
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

export default function FanFeed() {
  const navigation = useNavigation();
  const { handleScroll } = useTabBar();
  const { isUnderReview } = useContentStore();
  const { isHidden } = useUserSafetyStore();

  // State for real posts from API
  const [posts, setPosts] = useState<UIPost[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [_selectedPost, setSelectedPost] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<UISuggestion[]>([]);

  // Fetch posts from tracked users
  const fetchPosts = useCallback(async (pageNum = 0, refresh = false) => {
    try {
      const { data, error } = await getFeedFromFollowed(pageNum, 10);

      if (error) {
        console.error('[FanFeed] Error fetching posts:', error);
        return;
      }

      if (data) {
        // Check liked status for each post
        const likedIds = new Set<string>();
        for (const post of data) {
          const { hasLiked } = await hasLikedPost(post.id);
          if (hasLiked) likedIds.add(post.id);
        }

        const transformedPosts = data.map(post => transformPostToUI(post, likedIds));

        if (refresh || pageNum === 0) {
          setPosts(transformedPosts);
          setLikedPostIds(likedIds);
        } else {
          setPosts(prev => [...prev, ...transformedPosts]);
          setLikedPostIds(prev => new Set([...prev, ...likedIds]));
        }

        setHasMore(data.length >= 10);
      }
    } catch (err) {
      console.error('[FanFeed] Error:', err);
    }
  }, []);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    try {
      const { data } = await getSuggestedProfiles(8);
      if (data) {
        const transformed: UISuggestion[] = data.map((p: Profile) => ({
          id: p.id,
          name: p.full_name || p.username || 'User',
          username: p.username || 'user',
          avatar: p.avatar_url || 'https://via.placeholder.com/100',
          isVerified: p.is_verified || false,
        }));
        setSuggestions(transformed);
      }
    } catch (err) {
      console.error('[FanFeed] Error fetching suggestions:', err);
    }
  }, []);

  // Handle track/follow user
  const handleTrackUser = useCallback(async (userId: string) => {
    try {
      await followUser(userId);
      // Remove from suggestions after following
      setSuggestions(prev => prev.filter(s => s.id !== userId));
    } catch (err) {
      console.error('[FanFeed] Error following user:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchPosts(0), fetchSuggestions()]).finally(() => setIsLoading(false));
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
  const formatNumber = useCallback((num) => {
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
  const toggleSave = useCallback((postId) => {
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

  // Open comments
  const openComments = useCallback((post) => {
    setSelectedPost(post);
    setShowComments(true);
  }, []);

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
  const renderSuggestion = useCallback((suggestion: UISuggestion) => (
    <View key={suggestion.id} style={styles.suggestionItem}>
      <TouchableOpacity
        style={styles.suggestionAvatarWrapper}
        onPress={() => goToUserProfile(suggestion.id)}
      >
        <LinearGradient
          colors={GRADIENTS.primary}
          style={styles.suggestionRing}
        >
          <View style={styles.suggestionAvatarContainer}>
            <AvatarImage source={suggestion.avatar} size={54} />
          </View>
        </LinearGradient>
        {suggestion.isVerified && (
          <View style={styles.verifiedBadgeSuggestion}>
            <Ionicons name="checkmark" size={8} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
      <Text style={styles.suggestionName} numberOfLines={1}>
        {suggestion.name.split(' ')[0]}
      </Text>
      <TouchableOpacity
        style={styles.trackButton}
        onPress={() => handleTrackUser(suggestion.id)}
      >
        <Text style={styles.trackButtonText}>Track</Text>
      </TouchableOpacity>
    </View>
  ), [goToUserProfile, handleTrackUser]);

  // Render post item for FlashList
  const renderPost = useCallback(({ item: post, index }) => (
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
              {post.user.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.postMeta}>
              {post.timeAgo}{post.location && ` • ${post.location}`}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.postMore}>
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
        onSingleTap={() => navigation.navigate('PostDetailFanFeed', { postId: post.id })}
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
            style={styles.postAction}
            onPress={() => toggleLike(post.id)}
          >
            <SmuppyHeartIcon
              size={26}
              color={post.isLiked ? "#FF6B6B" : COLORS.dark}
              filled={post.isLiked}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.postAction}
            onPress={() => openComments(post)}
          >
            <Ionicons name="chatbubble-outline" size={24} color={COLORS.dark} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.postAction}>
            <Ionicons name="paper-plane-outline" size={24} color={COLORS.dark} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => toggleSave(post.id)}>
          <Ionicons
            name={post.isSaved ? "bookmark" : "bookmark-outline"}
            size={24}
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

      {/* View Comments */}
      {post.comments > 0 && (
        <TouchableOpacity onPress={() => openComments(post)}>
          <Text style={styles.viewComments}>
            View all {post.comments} comments
          </Text>
        </TouchableOpacity>
      )}

      {/* Divider */}
      {index < visiblePosts.length - 1 && <View style={styles.postDivider} />}
    </View>
  ), [visiblePosts.length, goToUserProfile, toggleLike, toggleSave, openComments, formatNumber]);

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

  const keyExtractor = useCallback((item) => String(item.id), []);

  // Comments Modal
  const renderCommentsModal = () => (
    <Modal
      visible={showComments}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.commentsContainer}>
        <View style={styles.commentsHeader}>
          <Text style={styles.commentsTitle}>Comments</Text>
          <TouchableOpacity onPress={() => setShowComments(false)}>
            <Ionicons name="close" size={28} color={COLORS.dark} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.commentsList}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.commentItem}>
              <TouchableOpacity onPress={() => {
                setShowComments(false);
                goToUserProfile(String(i + 30));
              }}>
                <AvatarImage
                  source={`https://i.pravatar.cc/100?img=${i + 30}`}
                  size={36}
                />
              </TouchableOpacity>
              <View style={styles.commentContent}>
                <TouchableOpacity onPress={() => {
                  setShowComments(false);
                  goToUserProfile(String(i + 30));
                }}>
                  <Text style={styles.commentUser}>User{i}</Text>
                </TouchableOpacity>
                <Text style={styles.commentText}>Great post! Love the energy</Text>
                <Text style={styles.commentTime}>{i}h ago</Text>
              </View>
              <TouchableOpacity>
                <SmuppyHeartIcon size={16} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>

        <View style={styles.commentInput}>
          <AvatarImage
            source="https://i.pravatar.cc/100?img=33"
            size={36}
          />
          <View style={styles.commentInputField}>
            <Text style={styles.commentInputPlaceholder}>Add a comment...</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.commentPostBtn}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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

  // Loading state
  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your feed...</Text>
      </View>
    );
  }

  // Navigate to Peaks screen
  const openPeaks = useCallback(() => {
    navigation.navigate('Peaks');
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Swipe down to open Peaks - Smuppy unique gesture */}
      <SwipeToPeaks onOpenPeaks={openPeaks}>
        {/* FlashList - 10x faster than FlatList */}
        <FlashList<UIPost>
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
            />
          }
          contentContainerStyle={styles.listContent}
        />
      </SwipeToPeaks>

      {renderCommentsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Suggestions Section
  suggestionsSection: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  suggestionsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
  },
  suggestionsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: COLORS.dark,
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: COLORS.primary,
  },
  suggestionsScrollContent: {
    paddingHorizontal: SPACING.sm,
  },
  suggestionItem: {
    alignItems: 'center',
    marginHorizontal: 6,
    width: 80,
  },
  suggestionAvatarWrapper: {
    position: 'relative',
  },
  suggestionRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    padding: 2,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionAvatarContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 28,
    padding: 2,
  },
  verifiedBadgeSuggestion: {
    position: 'absolute',
    bottom: 4,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  suggestionName: {
    fontSize: 11,
    color: COLORS.dark,
    fontFamily: 'Poppins-Medium',
    textAlign: 'center',
    marginBottom: 4,
  },
  trackButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  trackButtonText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    color: COLORS.white,
  },

  // Post
  postContainer: {
    paddingTop: SPACING.md,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
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
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
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
  viewComments: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    paddingHorizontal: SPACING.base,
    marginTop: 6,
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
});
