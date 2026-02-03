import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { followUser, isFollowing, likePost, unlikePost, hasLikedPost, savePost, unsavePost, hasSavedPost, getPostById } from '../../services/database';
import { sharePost, copyPostLink } from '../../utils/share';
import { useContentStore } from '../../stores';

const { width, height } = Dimensions.get('window');

interface PostItem {
  id: string;
  type: string;
  media: string;
  thumbnail: string;
  description: string;
  likes: number;
  views: number;
  user: {
    id: string;
    name: string;
    avatar: string;
  };
}

const MOCK_PROFILE_POSTS: PostItem[] = [];

// Helper to convert API post to PostItem format
const convertToPostItem = (post: any): PostItem => ({
  id: post.id,
  type: post.media_type === 'video' ? 'video' : 'image',
  media: post.media_urls?.[0] || '',
  thumbnail: post.media_urls?.[0] || '',
  description: post.content || '',
  likes: post.likes_count || 0,
  views: post.views_count || 0,
  user: {
    id: post.author?.id || post.author_id || '',
    name: post.author?.full_name || post.author?.username || '',
    avatar: post.author?.avatar_url || '',
  },
});


const PostDetailProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

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
  const [theyFollowMe, _setTheyFollowMe] = useState(false); // Est-ce qu'ils me suivent ?
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);
  const [fanLoading, setFanLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  // Content store for reports
  const { submitReport: storeSubmitReport, hasUserReported, isUnderReview } = useContentStore();
  const { showSuccess, showError, showWarning } = useSmuppyAlert();

  // Refs
  const videoRef = useRef(null);
  const flatListRef = useRef(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

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

  // Current post
  const currentPost = posts[currentIndex];

  // Validate UUID format
  const isValidUUID = (id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return id && uuidRegex.test(id);
  };

  // Check follow status on mount or post change
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (currentPost.user?.id) {
        const { following } = await isFollowing(currentPost.user.id);
        setIsFan(following);
      }
    };
    checkFollowStatus();
  }, [currentPost.user?.id]);

  // Check like/bookmark status on mount or post change
  useEffect(() => {
    const checkPostStatus = async () => {
      const postId = currentPost.id;
      if (!postId || !isValidUUID(postId)) return;

      const { hasLiked } = await hasLikedPost(postId);
      setIsLiked(hasLiked);

      const { saved } = await hasSavedPost(postId);
      setIsBookmarked(saved);
    };
    checkPostStatus();
  }, [currentPost.id]);

  // Become fan with real database call
  const becomeFan = async () => {
    if (fanLoading || !currentPost.user?.id) return;
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
  };

  // Toggle like with anti spam-click - connected to database
  const toggleLike = async () => {
    if (likeLoading) return;

    const postId = currentPost.id;
    if (!postId || !isValidUUID(postId)) {
      // For mock data, use local state only
      setIsLiked(!isLiked);
      if (!isLiked) {
        triggerLikeAnimation();
      }
      return;
    }

    setLikeLoading(true);
    try {
      if (isLiked) {
        const { error } = await unlikePost(postId);
        if (!error) {
          setIsLiked(false);
        }
      } else {
        const { error } = await likePost(postId);
        if (!error) {
          setIsLiked(true);
          triggerLikeAnimation();
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Like error:', error);
    } finally {
      setLikeLoading(false);
    }
  };

  // Toggle bookmark with anti spam-click - connected to database
  const toggleBookmark = async () => {
    if (bookmarkLoading) return;

    const postId = currentPost.id;
    if (!postId || !isValidUUID(postId)) {
      // For mock data, use local state only
      setIsBookmarked(!isBookmarked);
      return;
    }

    setBookmarkLoading(true);
    try {
      if (isBookmarked) {
        const { error } = await unsavePost(postId);
        if (!error) {
          setIsBookmarked(false);
        }
      } else {
        const { error } = await savePost(postId);
        if (!error) {
          setIsBookmarked(true);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[PostDetailProfile] Bookmark error:', error);
    } finally {
      setBookmarkLoading(false);
    }
  };

  // Share post
  const handleShare = async () => {
    if (shareLoading) return;
    setShareLoading(true);
    try {
      setShowMenu(false);
      await sharePost(
        currentPost.id,
        currentPost.description,
        currentPost.user.name
      );
    } catch (_error) {
      // User cancelled or error - silent fail
    } finally {
      setShareLoading(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async () => {
    setShowMenu(false);
    const copied = await copyPostLink(currentPost.id);
    if (copied) {
      showSuccess('Copied!', 'Post link copied to clipboard');
    }
  };

  // Report post
  const handleReport = () => {
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
  };

  // Submit report
  const submitReport = (reason: string) => {
    setShowReportModal(false);
    const result = storeSubmitReport(currentPost.id, reason);
    if (result.alreadyReported) {
      showWarning('Already reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', 'An error occurred. Please try again.');
    }
  };

  // Double tap to like
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (!isLiked) {
        setIsLiked(true);
        triggerLikeAnimation();
      }
    } else {
      // Single tap - toggle pause/play for video
      if (currentPost.type === 'video') {
        setIsPaused(!isPaused);
      }
    }
    lastTap.current = now;
  };
  
  // Like animation
  const triggerLikeAnimation = () => {
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
  };
  
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
  
  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  // Create styles with theme
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Render post item
  const renderPostItem = ({ item, index }: { item: PostItem; index: number }) => (
    <TouchableWithoutFeedback onPress={handleDoubleTap}>
      <View style={[styles.postContainer, { height: height }]}>
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
            <SmuppyHeartIcon size={100} color={colors.primary} filled />
          </Animated.View>
        )}
        
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color="#FFF" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowMenu(true)}
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
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <SmuppyHeartIcon
                size={28}
                color={isLiked ? colors.primary : '#FFF'}
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
              onPress={() => setIsMuted(!isMuted)}
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
        <View style={[styles.bottomContent, { paddingBottom: insets.bottom + 10 }]}>
          {/* User info */}
          <View style={styles.userRow}>
            <TouchableOpacity
              style={styles.userInfo}
              onPress={() => navigation.navigate('UserProfile', { userId: item.user.id })}
            >
              <AvatarImage source={item.user.avatar} size={40} style={styles.avatar} />
              <Text style={styles.userName}>{item.user.name}</Text>
            </TouchableOpacity>
            
            {/* Bouton Fan - logique:
                - Si déjà fan → pas de bouton (rien)
                - Si pas fan + ils me suivent → "Track"
                - Si pas fan + ils me suivent pas → "+ Fan"
            */}
            {!isFan && (
              <TouchableOpacity
                style={[styles.fanBtn, fanLoading && styles.fanBtnDisabled]}
                onPress={becomeFan}
                disabled={fanLoading}
              >
                {fanLoading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    {!theyFollowMe && (
                      <Ionicons name="add" size={16} color={colors.primary} />
                    )}
                    <Text style={styles.fanBtnText}>
                      {theyFollowMe ? 'Track' : 'Fan'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          
          {/* Description */}
          <TouchableOpacity
            onPress={() => setExpandedDescription(!expandedDescription)}
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
          
          {/* Stats bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <SmuppyHeartIcon size={18} color={colors.primary} filled />
              <Text style={styles.statCount}>{formatNumber(item.likes)}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="eye-outline" size={18} color="#FFF" />
              <Text style={styles.statCount}>{formatNumber(item.views || 0)}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Posts FlashList (vertical scroll) */}
      <FlashList
        ref={flatListRef}
        data={posts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
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
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
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

            <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
              <Ionicons name="flag-outline" size={24} color="#FF6B6B" />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setShowMenu(false)}
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
        onRequestClose={() => setShowReportModal(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowReportModal(false)}
        >
          <View style={styles.menuContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.reportTitle}>Report this post</Text>
            <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('spam')}
            >
              <Text style={styles.reportOptionText}>Spam or misleading</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('inappropriate')}
            >
              <Text style={styles.reportOptionText}>Inappropriate content</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('harassment')}
            >
              <Text style={styles.reportOptionText}>Harassment or bullying</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('violence')}
            >
              <Text style={styles.reportOptionText}>Violence or dangerous</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reportOption}
              onPress={() => submitReport('other')}
            >
              <Text style={styles.reportOptionText}>Other</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  postContainer: {
    width: width,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
    position: 'absolute',
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
  fanBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  fanBtnTextActive: {
    color: colors.background,
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