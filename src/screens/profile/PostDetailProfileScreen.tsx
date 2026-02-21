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
import SharePostModal from '../../components/SharePostModal';
import PostMenuModal from '../../components/PostMenuModal';
import { usePostDetailActions, type PostDetailPost } from '../../hooks/usePostDetailActions';
import { formatNumber } from '../../utils/formatters';
import { getPostById } from '../../services/database';

const { width, height } = Dimensions.get('window');

interface TaggedUserInfo {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
}

interface PostItem extends PostDetailPost {
  location?: string | null;
  taggedUsers?: TaggedUserInfo[];
  allMedia?: string[];
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

  // Params
  const params = route.params as { postId?: string; profilePosts?: PostItem[] } || {};
  const { postId, profilePosts: passedPosts = [] } = params;

  // States
  const [posts, setPosts] = useState<PostItem[]>(passedPosts);
  const [isLoadingPost, setIsLoadingPost] = useState(false);
  const initialIndex = posts.findIndex(p => p.id === postId) || 0;
  const [currentIndex, setCurrentIndex] = useState(Math.max(initialIndex, 0));
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});

  // Current post
  const currentPost = posts[currentIndex] ?? null;

  // Shared actions hook
  const actions = usePostDetailActions({
    currentPost,
    logTag: 'PostDetailProfile',
  });

  // Check if this is the current user's own post
  const isOwnPost = currentPost?.user?.id === actions.currentUserId;

  // Refs
  const videoRef = useRef(null);
  const flatListRef = useRef(null);

  const getItemType = useCallback((item: PostItem) => {
    if (item.allMedia && item.allMedia.length > 1) return 'carousel';
    return item.type === 'video' ? 'video' : 'image';
  }, []);

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

  // Handle swipe to next/prev post
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
      actions.setIsPaused(false);
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

  // Render post item
  const renderPostItem = useCallback(({ item, index }: { item: PostItem; index: number }) => {
    const displayLikes = actions.localLikeCount ?? item.likes;
    const itemIsOwn = item.user?.id === actions.currentUserId;

    return (
      <TouchableWithoutFeedback onPress={actions.handleDoubleTap}>
        <View style={[styles.postContainer, { height }]}>
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
            >
              <Ionicons name="chevron-back" size={28} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={actions.handleShowMenu}
            >
              <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Right actions */}
          <View style={styles.rightActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={actions.handleShare}
            >
              <Ionicons name="paper-plane-outline" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, actions.likeLoading && styles.actionBtnDisabled]}
              onPress={actions.toggleLike}
              disabled={actions.likeLoading}
            >
              {actions.likeLoading ? (
                <ActivityIndicator size="small" color={colors.heartRed} />
              ) : (
                <SmuppyHeartIcon
                  size={28}
                  color={actions.isLiked ? colors.heartRed : '#FFF'}
                  filled={actions.isLiked}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, actions.bookmarkLoading && styles.actionBtnDisabled]}
              onPress={actions.toggleBookmark}
              disabled={actions.bookmarkLoading}
            >
              {actions.bookmarkLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name={actions.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={28}
                  color={actions.isBookmarked ? colors.primary : '#FFF'}
                />
              )}
            </TouchableOpacity>

            {item.type === 'video' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={actions.handleToggleAudioMute}
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
              {!itemIsOwn && !actions.isFan && (
                <TouchableOpacity
                  style={[styles.fanBtn, actions.fanLoading && styles.fanBtnDisabled]}
                  onPress={actions.becomeFan}
                  disabled={actions.fanLoading}
                >
                  {actions.fanLoading ? (
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
                onPress={actions.handleToggleDescription}
                activeOpacity={0.8}
              >
                <Text
                  style={styles.description}
                  numberOfLines={actions.expandedDescription ? undefined : 2}
                >
                  {item.description}
                  {!actions.expandedDescription && item.description.length > 80 && (
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
                  {item.taggedUsers.map(t => resolveDisplayName(t)).join(', ')}
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
    currentIndex, actions.isPaused, actions.showLikeAnimation, actions.likeAnimationScale,
    actions.isLiked, actions.isBookmarked, actions.isFan, actions.fanLoading, actions.likeLoading,
    actions.bookmarkLoading, actions.localLikeCount, actions.currentUserId,
    actions.isAudioMuted, actions.expandedDescription, carouselIndexes,
    colors, styles, headerPaddingStyle, bottomContentPaddingStyle,
    actions.handleDoubleTap, actions.handleShare, actions.handleGoBack, actions.handleShowMenu,
    actions.handleToggleAudioMute, actions.handleToggleDescription,
    actions.toggleLike, actions.toggleBookmark, actions.becomeFan,
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
      {actions.deleteLoading && (
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
        initialScrollIndex={Math.max(initialIndex, 0)}
      />

      {/* Post Menu + Report Modal */}
      <PostMenuModal
        visible={actions.showMenu}
        onClose={actions.handleCloseMenu}
        post={currentPost ? { id: currentPost.id, authorId: currentPost.user.id } : null}
        isOwnPost={isOwnPost}
        onDelete={actions.handleDeletePost}
        onShare={actions.handleShare}
        onCopyLink={actions.handleCopyLink}
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

});

export default PostDetailProfileScreen;
