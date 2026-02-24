import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  StatusBar,
  Animated,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { normalizeCdnUrl, buildRemoteMediaSource } from '../../utils/cdnUrl';

import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import SharePostModal from '../../components/SharePostModal';
import PostMenuModal from '../../components/PostMenuModal';
import { usePostDetailActions, type PostDetailPost } from '../../hooks/usePostDetailActions';
import { formatNumber } from '../../utils/formatters';

const { width, height } = Dimensions.get('window');
const CONDENSED_HEIGHT = 220;
const GRID_GAP = 12;
const GRID_PADDING = 16;

// View states
const VIEW_STATES = {
  FULLSCREEN: 'fullscreen',
  CONDENSED: 'condensed',
  GRID_ONLY: 'grid_only',
};

interface VibesFeedPost extends PostDetailPost {
  category: string;
  location?: string | null;
  allMedia?: string[];
  user: { id: string; name: string; avatar: string; followsMe: boolean };
}

interface GridPost { id: string; thumbnail: string; title: string; likes: number; height: number; type: string; category: string; user: { id: string; name: string; avatar: string }; duration?: string }

const PostDetailVibesFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Params
  const params = route.params as {
    postId?: string;
    post?: VibesFeedPost;
    startCondensed?: boolean;
  } || {};
  const { postId: _postId, post: initialPost, startCondensed } = params;
  const currentPost = initialPost ?? null;

  // Shared actions hook
  const actions = usePostDetailActions({
    currentPost,
    logTag: 'PostDetailVibesFeed',
  });

  // Screen-specific states
  const [viewState, setViewState] = useState(startCondensed ? VIEW_STATES.CONDENSED : VIEW_STATES.FULLSCREEN);
  const [gridPosts] = useState<GridPost[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const videoRef = useRef(null);

  // Card press animation refs
  const cardScales = useRef<{ [key: string]: Animated.Value }>({}).current;
  const getCardScale = useCallback((id: string) => {
    if (!cardScales[id]) {
      cardScales[id] = new Animated.Value(1);
    }
    return cardScales[id];
  }, [cardScales]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Dynamic styles depending on insets
  const headerPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);
  const bottomContentPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 20 }), [insets.bottom]);
  const condensedPaddingStyle = useMemo(() => ({ paddingTop: insets.top }), [insets.top]);
  const gridOnlyPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);

  // Handle swipe down
  const handleSwipeDown = useCallback(() => {
    if (viewState === VIEW_STATES.FULLSCREEN) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.GRID_ONLY);
    }
  }, [viewState]);

  // Handle swipe up
  const handleSwipeUp = useCallback(() => {
    if (viewState === VIEW_STATES.GRID_ONLY) {
      setViewState(VIEW_STATES.CONDENSED);
    } else if (viewState === VIEW_STATES.CONDENSED) {
      setViewState(VIEW_STATES.FULLSCREEN);
    }
  }, [viewState]);

  // Handle scroll
  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = event.nativeEvent.contentOffset.y;

    if (offsetY > 50 && viewState === VIEW_STATES.FULLSCREEN) {
      handleSwipeDown();
    } else if (offsetY < -50 && viewState !== VIEW_STATES.FULLSCREEN) {
      handleSwipeUp();
    }
  }, [viewState, handleSwipeDown, handleSwipeUp]);

  const handleExpandFullscreen = useCallback(() => setViewState(VIEW_STATES.FULLSCREEN), []);
  const handleBackToCondensed = useCallback(() => setViewState(VIEW_STATES.CONDENSED), []);

  const handleUserPress = useCallback(() => {
    if (!currentPost) return;
    if (currentPost.user.id === actions.currentUserId) {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } else {
      navigation.navigate('UserProfile', { userId: currentPost.user.id });
    }
  }, [currentPost, actions.currentUserId, navigation]);

  const handleViewLikers = useCallback(() => {
    if (currentPost?.id) {
      navigation.navigate('PostLikers', { postId: currentPost.id });
    }
  }, [currentPost?.id, navigation]);

  const handleCarouselScroll = useCallback((e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const slideIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setCarouselIndex(slideIndex);
  }, []);

  // Render modern grid post card
  const renderGridPost = useCallback((post: { id: string; type?: string; thumbnail: string; title?: string; likes?: number; category?: string; height?: number; duration?: string; user?: { id?: string; name?: string; avatar?: string } }, _index: number) => {
    const scale = getCardScale(post.id);

    // Convert mock post to format expected by this screen
    const convertedPost = {
      id: post.id,
      type: post.type || 'image',
      media: post.thumbnail,
      thumbnail: post.thumbnail,
      description: post.title || '',
      likes: post.likes || 0,
      category: post.category || 'Fitness',
      user: {
        id: post.user?.id || 'unknown',
        name: post.user?.name || 'User',
        avatar: post.user?.avatar || null,
        followsMe: false,
      },
    };

    return (
      <Animated.View
        key={`grid-${post.id}`}
        style={[
          styles.gridCardWrapper,
          { height: post.height, transform: [{ scale }] }
        ]}
      >
        <TouchableOpacity
          style={styles.gridCard}
          activeOpacity={0.9}
          onPressIn={() => {
            Animated.timing(scale, {
              toValue: 0.96,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.timing(scale, {
              toValue: 1,
              duration: 100,
              useNativeDriver: true,
            }).start();
          }}
          onPress={() => {
            // Navigate with converted post data - start in condensed mode
            navigation.navigate('PostDetailVibesFeed', {
              postId: convertedPost.id,
              post: convertedPost,
              startCondensed: true
            });
          }}
        >
          <OptimizedImage source={post.thumbnail} style={styles.gridThumbnail} />

          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gridGradient}
          />

          {/* Video duration badge */}
          {post.type === 'video' && post.duration && (
            <View style={styles.durationBadge}>
              <Ionicons name="play" size={10} color="#FFF" />
              <Text style={styles.durationText}>{post.duration}</Text>
            </View>
          )}

          {/* Category tag */}
          {post.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{post.category}</Text>
            </View>
          )}

          {/* Bottom info - simple without blur for better performance */}
          <View style={styles.gridInfo}>
            <View style={styles.gridUserRow}>
              <AvatarImage source={post.user?.avatar} size={22} style={styles.gridAvatar} />
              <Text style={styles.gridUserName} numberOfLines={1}>{post.user?.name}</Text>
            </View>
            <View style={styles.gridStatsRow}>
              <SmuppyHeartIcon size={14} color={colors.heartRed} filled />
              <Text style={styles.gridLikes}>{formatNumber(post.likes ?? 0)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }, [getCardScale, styles, colors, navigation]);

  // Split grid posts into columns for masonry layout (memoized to avoid recomputation on every render)
  const leftColumn = useMemo(() => gridPosts.filter((_, i) => i % 2 === 0), [gridPosts]);
  const rightColumn = useMemo(() => gridPosts.filter((_, i) => i % 2 === 1), [gridPosts]);

  // Guard: if no post data was passed, bail out
  if (!currentPost) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* FULLSCREEN VIEW */}
        {viewState === VIEW_STATES.FULLSCREEN && (
          <TouchableWithoutFeedback onPress={actions.handleDoubleTap}>
            <View style={[styles.fullscreenContainer, styles.fullscreenHeight]}>
              {/* Media */}
              {(() => {
                if (currentPost.type === 'video') {
                  const videoSource = buildRemoteMediaSource(currentPost.media);
                  return (
                    <Video
                      ref={videoRef}
                      source={videoSource || { uri: normalizeCdnUrl(currentPost.media) || '' }}
                      style={styles.fullscreenMedia}
                      resizeMode={ResizeMode.COVER}
                      isLooping
                      isMuted={actions.isAudioMuted}
                      shouldPlay={!actions.isPaused}
                      posterSource={buildRemoteMediaSource(currentPost.thumbnail) || { uri: normalizeCdnUrl(currentPost.thumbnail) || '' }}
                      usePoster
                    />
                  );
                }
                if (currentPost.allMedia && currentPost.allMedia.length > 1) {
                  return (
                    <View style={styles.scrollView}>
                      <FlatList
                        horizontal
                        pagingEnabled
                        data={currentPost.allMedia}
                        keyExtractor={(_, mediaIndex) => `${currentPost.id}-media-${mediaIndex}`}
                        renderItem={({ item: mediaUrl }) => (
                          <OptimizedImage source={mediaUrl} style={styles.carouselImage} />
                        )}
                        showsHorizontalScrollIndicator={false}
                        getItemLayout={(_, layoutIndex) => ({ length: width, offset: width * layoutIndex, index: layoutIndex })}
                        onMomentumScrollEnd={handleCarouselScroll}
                      />
                      <View style={styles.carouselPagination}>
                        {currentPost.allMedia.map((_, dotIndex) => (
                          <View
                            key={`dot-${dotIndex}`}
                            style={[
                              styles.carouselDot,
                              carouselIndex === dotIndex && styles.carouselDotActive,
                            ]}
                          />
                        ))}
                      </View>
                    </View>
                  );
                }
                return <OptimizedImage source={currentPost.media || currentPost.thumbnail} style={styles.fullscreenMedia} />;
              })()}

              {/* Gradient overlay */}
              <LinearGradient
                colors={['transparent', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.gradientOverlay}
              />

              {/* Under Review Overlay */}
              {actions.isUnderReview(currentPost.id) && (
                <View style={styles.underReviewOverlay}>
                  <View style={styles.underReviewBadge}>
                    <Ionicons name="alert-circle" size={24} color="#FFF" />
                    <Text style={styles.underReviewText}>Content under review</Text>
                  </View>
                </View>
              )}

              {/* Like animation */}
              {actions.showLikeAnimation && (
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
                  <BlurView intensity={30} tint="dark" style={styles.headerBtnBlur}>
                    <Ionicons name="close" size={24} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={actions.handleShowMenu}
                >
                  <BlurView intensity={30} tint="dark" style={styles.headerBtnBlur}>
                    <Ionicons name="ellipsis-vertical" size={20} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* Right actions - icons only, no circles */}
              <View style={styles.rightActions}>
                <TouchableOpacity
                  style={styles.actionBtnSimple}
                  onPress={actions.handleShare}
                >
                  <Ionicons name="paper-plane-outline" size={28} color="#FFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnSimple, actions.likeLoading && styles.actionBtnDisabled]}
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
                  style={[styles.actionBtnSimple, actions.bookmarkLoading && styles.actionBtnDisabled]}
                  onPress={actions.toggleBookmark}
                  disabled={actions.bookmarkLoading}
                >
                  {actions.bookmarkLoading ? (
                    <ActivityIndicator size="small" color={colors.primaryGreen} />
                  ) : (
                    <Ionicons
                      name={actions.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={28}
                      color={actions.isBookmarked ? colors.primaryGreen : '#FFF'}
                    />
                  )}
                </TouchableOpacity>

                {currentPost.type === 'video' && (
                  <TouchableOpacity
                    style={styles.actionBtnSimple}
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
                    onPress={handleUserPress}
                  >
                    <AvatarImage source={currentPost.user.avatar} size={44} style={styles.avatar} />
                    <View>
                      <Text style={styles.userName}>{currentPost.user.name}</Text>
                      <Text style={styles.userCategory}>{currentPost.category}</Text>
                    </View>
                  </TouchableOpacity>

                  {currentPost.user.id !== actions.currentUserId && !actions.isFan && (
                    <TouchableOpacity
                      style={[styles.fanBtn, actions.fanLoading && styles.fanBtnDisabled]}
                      onPress={actions.becomeFan}
                      disabled={actions.fanLoading}
                    >
                      {actions.fanLoading ? (
                        <ActivityIndicator size="small" color={colors.primaryGreen} />
                      ) : (
                        <>
                          <Ionicons name="add" size={18} color={colors.primaryGreen} />
                          <Text style={styles.fanBtnText}>Fan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Location */}
                {currentPost.location ? (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color={colors.primary} />
                    <Text style={styles.locationText}>{currentPost.location}</Text>
                  </View>
                ) : null}

                {/* Description */}
                <TouchableOpacity
                  onPress={actions.handleToggleDescription}
                  activeOpacity={0.8}
                >
                  <Text
                    style={styles.description}
                    numberOfLines={actions.expandedDescription ? undefined : 2}
                  >
                    {currentPost.description}
                  </Text>
                </TouchableOpacity>

                {/* Stats bar */}
                <View style={styles.statsBar}>
                  <TouchableOpacity
                    style={styles.statItem}
                    onPress={handleViewLikers}
                    activeOpacity={0.7}
                  >
                    <SmuppyHeartIcon size={16} color={colors.heartRed} filled />
                    <Text style={styles.statCount}>{formatNumber(actions.localLikeCount ?? currentPost.likes)}</Text>
                  </TouchableOpacity>
                </View>

                {/* Swipe indicator */}
                <View style={styles.swipeIndicator}>
                  <View style={styles.swipeBar} />
                  <Text style={styles.swipeText}>Swipe up for more</Text>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        )}

        {/* CONDENSED VIEW */}
        {viewState === VIEW_STATES.CONDENSED && (
          <View style={condensedPaddingStyle}>
            {/* Condensed post at top */}
            <TouchableOpacity
              style={styles.condensedPost}
              activeOpacity={0.95}
              onPress={handleExpandFullscreen}
            >
              <OptimizedImage source={currentPost.thumbnail} style={styles.condensedMedia} />
              <LinearGradient
                colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.6)']}
                style={styles.condensedGradient}
              />

              <View style={styles.condensedHeader}>
                <TouchableOpacity
                  style={styles.condensedBackBtn}
                  onPress={actions.handleGoBack}
                >
                  <BlurView intensity={30} tint="dark" style={styles.condensedBtnBlur}>
                    <Ionicons name="close" size={22} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
                <TouchableOpacity style={styles.condensedExpandBtn}>
                  <BlurView intensity={30} tint="dark" style={styles.condensedBtnBlur}>
                    <Ionicons name="expand" size={18} color="#FFF" />
                  </BlurView>
                </TouchableOpacity>
              </View>

              <View style={styles.condensedInfo}>
                <View style={styles.condensedUser}>
                  <AvatarImage source={currentPost.user.avatar} size={36} style={styles.condensedAvatar} />
                  <View>
                    <Text style={styles.condensedUserName}>{currentPost.user.name}</Text>
                    <Text style={styles.condensedCategory}>{currentPost.category}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.condensedStats}
                  onPress={handleViewLikers}
                  activeOpacity={0.7}
                >
                  <SmuppyHeartIcon size={16} color={colors.heartRed} filled />
                  <Text style={styles.condensedLikes}>{formatNumber(currentPost.likes)}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>More to explore</Text>
              <TouchableOpacity style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primaryGreen} />
              </TouchableOpacity>
            </View>

            {/* Grid posts (Pinterest style) */}
            <View style={styles.gridContainer}>
              <View style={styles.masonryContainer}>
                <View style={styles.masonryColumn}>
                  {leftColumn.map((post, index) => renderGridPost(post, index * 2))}
                </View>
                <View style={styles.masonryColumn}>
                  {rightColumn.map((post, index) => renderGridPost(post, index * 2 + 1))}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* GRID ONLY VIEW */}
        {viewState === VIEW_STATES.GRID_ONLY && (
          <View style={gridOnlyPaddingStyle}>
            {/* Header */}
            <View style={styles.gridOnlyHeader}>
              <TouchableOpacity
                style={styles.gridBackBtn}
                onPress={handleBackToCondensed}
              >
                <Ionicons name="chevron-up" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.gridOnlyTitle}>Explore</Text>
              <View style={styles.spacer40} />
            </View>

            {/* Grid posts (Pinterest style) */}
            <View style={styles.gridContainer}>
              <View style={styles.masonryContainer}>
                <View style={styles.masonryColumn}>
                  {leftColumn.map((post, index) => renderGridPost(post, index * 2))}
                </View>
                <View style={styles.masonryColumn}>
                  {rightColumn.map((post, index) => renderGridPost(post, index * 2 + 1))}
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Post Menu + Report Modal */}
      <PostMenuModal
        visible={actions.showMenu}
        onClose={actions.handleCloseMenu}
        post={currentPost ? { id: currentPost.id, authorId: currentPost.user.id } : null}
        isOwnPost={!!currentPost && currentPost.user.id === actions.currentUserId}
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
  scrollView: {
    flex: 1,
  },

  // Fullscreen
  fullscreenContainer: {
    width: width,
    position: 'relative',
  },
  fullscreenHeight: {
    height: height,
  },
  fullscreenMedia: {
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
    overflow: 'hidden',
    borderRadius: 22,
  },
  headerBtnBlur: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },

  // Right actions
  rightActions: {
    position: 'absolute',
    right: 12,
    bottom: 140,
    alignItems: 'center',
    gap: 12,
  },
  actionBtnSimple: {
    padding: 8,
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
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  userCategory: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  fanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.primaryGreen,
    gap: 4,
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryGreen,
  },
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
  description: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    marginBottom: 12,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statCount: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },

  // Swipe indicator
  swipeIndicator: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 8,
  },
  swipeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },

  // Condensed post
  condensedPost: {
    height: CONDENSED_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  condensedMedia: {
    width: '100%',
    height: '100%',
  },
  condensedGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  condensedHeader: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  condensedBackBtn: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  condensedExpandBtn: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  condensedBtnBlur: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  condensedInfo: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  condensedUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  condensedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  condensedUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  condensedCategory: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 1,
  },
  condensedStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  condensedLikes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryGreen,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  masonryColumn: {
    flex: 1,
    gap: GRID_GAP,
  },
  gridCardWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  gridCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  gridThumbnail: {
    width: '100%',
    height: '100%',
  },
  gridGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  durationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(14,191,138,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  gridInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
    paddingTop: 20,
  },
  gridUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gridAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginRight: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  gridUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  gridStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridLikes: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Grid only header
  gridOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gridBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridOnlyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  spacer40: {
    width: 40,
  },

});

export default PostDetailVibesFeedScreen;
