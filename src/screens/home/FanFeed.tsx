import React, { useState, useCallback, useMemo } from 'react';
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
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';

const { width } = Dimensions.get('window');

// Posts from people you follow (Mock data - will be replaced by useFeedPosts hook)
const FAN_POSTS = [
  {
    id: 1,
    type: 'image',
    media: 'https://picsum.photos/800/1000?random=50',
    user: {
      id: '1',
      name: 'Hannah Smith',
      username: '@hannahsmith',
      avatar: 'https://i.pravatar.cc/100?img=1',
      isVerified: true,
    },
    caption: 'Morning workout done! Nothing beats starting the day with some cardio and strength training. Who else is up early grinding? #fitness #motivation',
    likes: 1234,
    comments: 89,
    shares: 23,
    saves: 156,
    isLiked: false,
    isSaved: false,
    timeAgo: '2h ago',
    location: 'Gold Gym, LA',
  },
  {
    id: 2,
    type: 'video',
    media: 'https://picsum.photos/800/1000?random=51',
    duration: '1:45',
    user: {
      id: '2',
      name: 'Thomas Lefèvre',
      username: '@thomaslef',
      avatar: 'https://i.pravatar.cc/100?img=3',
      isVerified: false,
    },
    caption: 'New personal record on the 5K! Been training for months and finally broke 20 minutes. Next goal: sub-19! #running #pr #goals',
    likes: 892,
    comments: 45,
    shares: 12,
    saves: 78,
    isLiked: true,
    isSaved: false,
    timeAgo: '4h ago',
    location: 'Central Park, NYC',
  },
  {
    id: 3,
    type: 'carousel',
    media: 'https://picsum.photos/800/1000?random=52',
    slideCount: 4,
    user: {
      id: '3',
      name: 'Mariam Fiori',
      username: '@mariamfiori',
      avatar: 'https://i.pravatar.cc/100?img=5',
      isVerified: true,
    },
    caption: 'Swipe to see my full yoga flow sequence. Perfect for morning stretching or evening relaxation. Save this for later! #yoga #wellness #flexibility',
    likes: 2341,
    comments: 167,
    shares: 89,
    saves: 432,
    isLiked: false,
    isSaved: true,
    timeAgo: '6h ago',
    location: 'Bali, Indonesia',
  },
  {
    id: 4,
    type: 'image',
    media: 'https://picsum.photos/800/1000?random=53',
    user: {
      id: '4',
      name: 'Alex Runner',
      username: '@alexrunner',
      avatar: 'https://i.pravatar.cc/100?img=8',
      isVerified: false,
    },
    caption: 'Trail running is my therapy. Nothing clears the mind like nature and fresh air. Where do you like to run?',
    likes: 567,
    comments: 34,
    shares: 8,
    saves: 45,
    isLiked: false,
    isSaved: false,
    timeAgo: '8h ago',
    location: 'Swiss Alps',
  },
  {
    id: 5,
    type: 'video',
    media: 'https://picsum.photos/800/1000?random=54',
    duration: '3:20',
    user: {
      id: '5',
      name: 'FitCoach Pro',
      username: '@fitcoachpro',
      avatar: 'https://i.pravatar.cc/100?img=12',
      isVerified: true,
    },
    caption: 'Full HIIT workout - no equipment needed! 20 minutes, maximum results. Drop a comment if you completed it!',
    likes: 4521,
    comments: 298,
    shares: 234,
    saves: 1890,
    isLiked: false,
    isSaved: false,
    timeAgo: '12h ago',
    location: null,
  },
];

// Stories data
const STORIES = [
  { id: '0', name: 'Your Story', avatar: 'https://i.pravatar.cc/100?img=33', isOwn: true, hasStory: false },
  { id: '1', name: 'Emma', avatar: 'https://i.pravatar.cc/100?img=9', isVerified: true, hasStory: true },
  { id: '2', name: 'James', avatar: 'https://i.pravatar.cc/100?img=11', isVerified: false, hasStory: true },
  { id: '3', name: 'Sofia', avatar: 'https://i.pravatar.cc/100?img=16', isVerified: true, hasStory: true },
  { id: '4', name: 'Mike', avatar: 'https://i.pravatar.cc/100?img=18', isVerified: false, hasStory: true },
  { id: '5', name: 'Lisa', avatar: 'https://i.pravatar.cc/100?img=23', isVerified: false, hasStory: true },
];

const _PAGE_SIZE = 5; // For future pagination

export default function FanFeed() {
  const navigation = useNavigation();
  const { handleScroll } = useTabBar();
  const [posts, setPosts] = useState(FAN_POSTS);
  const [showComments, setShowComments] = useState(false);
  const [_selectedPost, setSelectedPost] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Navigate to user profile
  const goToUserProfile = useCallback((userId) => {
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  // Format numbers
  const formatNumber = useCallback((num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }, []);

  // Toggle like
  const toggleLike = useCallback((postId) => {
    setPosts(prevPosts => prevPosts.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? post.likes - 1 : post.likes + 1,
        };
      }
      return post;
    }));
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
    // TODO: Replace with useFeedPosts().refetch()
    await new Promise(resolve => setTimeout(resolve, 1000));
    setPosts(FAN_POSTS);
    setHasMore(true);
    setRefreshing(false);
  }, []);

  // Load more posts
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // TODO: Replace with useFeedPosts().fetchNextPage()
    await new Promise(resolve => setTimeout(resolve, 1000));
    setHasMore(false);
    setLoadingMore(false);
  }, [loadingMore, hasMore]);

  // Render story item
  const renderStory = (story) => (
    <TouchableOpacity
      key={story.id}
      style={styles.storyItem}
      onPress={() => !story.isOwn && goToUserProfile(story.id)}
    >
      {story.hasStory || story.isOwn ? (
        <LinearGradient
          colors={story.hasStory ? GRADIENTS.primary : ['#ccc', '#ccc']}
          style={styles.storyRing}
        >
          <View style={styles.storyAvatarContainer}>
            <AvatarImage source={story.avatar} size={58} />
          </View>
        </LinearGradient>
      ) : (
        <View style={[styles.storyRing, { backgroundColor: '#eee' }]}>
          <View style={styles.storyAvatarContainer}>
            <AvatarImage source={story.avatar} size={58} />
          </View>
        </View>
      )}

      {story.isOwn && (
        <View style={styles.addStoryBadge}>
          <Ionicons name="add" size={14} color="#fff" />
        </View>
      )}

      <Text style={styles.storyName} numberOfLines={1}>
        {story.isOwn ? 'Your Story' : story.name}
      </Text>
    </TouchableOpacity>
  );

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

      {/* Media - Using OptimizedImage with caching */}
      <TouchableOpacity activeOpacity={0.95}>
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
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={styles.postActionsLeft}>
          <TouchableOpacity
            style={styles.postAction}
            onPress={() => toggleLike(post.id)}
          >
            <Ionicons
              name={post.isLiked ? "heart" : "heart-outline"}
              size={26}
              color={post.isLiked ? "#FF6B6B" : COLORS.dark}
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
      {index < posts.length - 1 && <View style={styles.postDivider} />}
    </View>
  ), [posts.length, goToUserProfile, toggleLike, toggleSave, openComments, formatNumber]);

  // List header with stories
  const ListHeader = useMemo(() => (
    <View style={styles.storiesSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {STORIES.map(renderStory)}
      </ScrollView>
    </View>
  ), []);

  // List footer with loading indicator
  const ListFooter = useCallback(() => {
    if (loadingMore) {
      return (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      );
    }
    if (!hasMore) {
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
  }, [loadingMore, hasMore]);

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
                <Ionicons name="heart-outline" size={16} color={COLORS.gray} />
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

  return (
    <View style={styles.container}>
      {/* FlashList - 10x faster than FlatList */}
      <FlashList
        data={posts}
        renderItem={renderPost}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        estimatedItemSize={500}
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

      {renderCommentsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Stories
  storiesSection: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  storyItem: {
    alignItems: 'center',
    marginLeft: SPACING.base,
    width: 72,
  },
  storyRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 3,
    marginBottom: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatarContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 31,
    padding: 2,
  },
  addStoryBadge: {
    position: 'absolute',
    bottom: 22,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  storyName: {
    fontSize: 11,
    color: COLORS.dark,
    fontFamily: 'Poppins-Regular',
    textAlign: 'center',
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
});
