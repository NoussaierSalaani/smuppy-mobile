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
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { useContentStore, useUserSafetyStore } from '../../stores';
import { sharePost, copyPostLink } from '../../utils/share';
import { followUser, isFollowing, likePost, unlikePost, hasLikedPost, savePost, unsavePost, hasSavedPost } from '../../services/database';

const { width, height } = Dimensions.get('window');

// Post type for this screen
interface FanFeedPost {
  id: string;
  type: 'video' | 'image';
  media: string;
  thumbnail: string;
  description: string;
  likes: number;
  views?: number;
  comments?: number;
  user: {
    id: string;
    name: string;
    avatar: string;
    followsMe: boolean;
  };
}

// Loading state record type
type LoadingRecord = Record<string, boolean>;

const MOCK_FANFEED_POSTS: FanFeedPost[] = [];

const PostDetailFanFeedScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();

  // Content store for reports and status
  const { submitReport: storeSubmitReport, hasUserReported, isUnderReview } = useContentStore();
  // User safety store for mute/block
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();

  // Params
  const params = (route.params as { postId?: string; fanFeedPosts?: FanFeedPost[] }) || {};
  const { postId, fanFeedPosts = MOCK_FANFEED_POSTS } = params;
  // Find the correct post index - findIndex returns -1 if not found
  const foundIndex = fanFeedPosts.findIndex(p => p.id === postId);
  const initialIndex = foundIndex >= 0 ? foundIndex : 0;

  // States
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Record<string, boolean>>({});
  const [fanStatus, setFanStatus] = useState<Record<string, boolean>>({}); // { odId: true/false }
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedDescription, setExpandedDescription] = useState(false);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);

  // Loading states for anti spam-click
  const [likeLoading, setLikeLoading] = useState<LoadingRecord>({});
  const [bookmarkLoading, setBookmarkLoading] = useState<LoadingRecord>({});
  const [fanLoading, setFanLoading] = useState<LoadingRecord>({});
  const [fanStatusChecking, setFanStatusChecking] = useState<Record<string, boolean>>({}); // Track which users we're checking
  const [shareLoading, setShareLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  
  // Index minimum (ne peut pas remonter plus haut que le post initial)
  const minIndex = initialIndex >= 0 ? initialIndex : 0;
  
  // Refs
  const videoRef = useRef<any>(null);
  const flatListRef = useRef<any>(null);
  const likeAnimationScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);
  
  // Current post
  const currentPost = fanFeedPosts[currentIndex];
  
  // Check if already fan of current post user
  const _isAlreadyFan = fanStatus[currentPost.user.id] === true;
  const _theyFollowMe = currentPost.user.followsMe;

  // Validate UUID format
  const isValidUUID = (id: string) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return id && uuidRegex.test(id);
  };

  // Check follow status when post changes
  useEffect(() => {
    const checkFollowStatus = async () => {
      const userId = currentPost.user?.id;
      if (userId && isValidUUID(userId) && fanStatus[userId] === undefined && !fanStatusChecking[userId]) {
        // Mark as checking to prevent flicker
        setFanStatusChecking(prev => ({ ...prev, [userId]: true }));
        try {
          const { following } = await isFollowing(userId);
          setFanStatus(prev => ({ ...prev, [userId]: following || false }));
        } finally {
          setFanStatusChecking(prev => ({ ...prev, [userId]: false }));
        }
      }
    };
    checkFollowStatus();
  }, [currentPost.user?.id, fanStatus, fanStatusChecking]);

  // Check like/bookmark status when post changes
  useEffect(() => {
    const checkPostStatus = async () => {
      const postId = currentPost.id;
      if (!postId || !isValidUUID(postId)) return;

      // Only check if we haven't already checked this post
      if (likedPosts[postId] === undefined) {
        const { hasLiked } = await hasLikedPost(postId);
        if (hasLiked) {
          setLikedPosts(prev => ({ ...prev, [postId]: true }));
        }
      }

      if (bookmarkedPosts[postId] === undefined) {
        const { saved } = await hasSavedPost(postId);
        if (saved) {
          setBookmarkedPosts(prev => ({ ...prev, [postId]: true }));
        }
      }
    };
    checkPostStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPost.id]);

  // Navigate to user profile (only if valid UUID)
  const navigateToProfile = (userId: string) => {
    if (isValidUUID(userId)) {
      navigation.navigate('UserProfile', { userId });
    } else {
      console.warn('[PostDetailFanFeed] Cannot navigate - invalid userId:', userId);
    }
  };

  // Double tap to like
  const handleDoubleTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected - Like
      if (!likedPosts[currentPost.id]) {
        setLikedPosts(prev => ({ ...prev, [currentPost.id]: true }));
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
  
  // Handle scroll - bloque le scroll vers le haut au-delà du post initial
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const newIndex = Math.round(offsetY / height);

    // Empêcher de remonter plus haut que le post initial
    if (newIndex < minIndex) {
      flatListRef.current?.scrollToIndex({
        index: minIndex,
        animated: true,
      });
    }
  };

  // Handle swipe to next/prev post
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;

      // Ne pas aller plus haut que minIndex
      if (newIndex !== null && newIndex !== undefined && newIndex >= minIndex) {
        setCurrentIndex(newIndex);
        setIsPaused(false);
        setExpandedDescription(false);
      }
    }
  }).current;
  
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;
  
  // Toggle like with anti spam-click - connected to database
  const toggleLike = async (postId: string) => {
    if (likeLoading[postId]) return;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!postId || !uuidRegex.test(postId)) {
      // For mock data, use local state only
      setLikedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
      if (!likedPosts[postId]) {
        triggerLikeAnimation();
      }
      return;
    }

    setLikeLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const isCurrentlyLiked = likedPosts[postId];
      if (isCurrentlyLiked) {
        const { error } = await unlikePost(postId);
        if (!error) {
          setLikedPosts(prev => ({ ...prev, [postId]: false }));
        }
      } else {
        const { error } = await likePost(postId);
        if (!error) {
          setLikedPosts(prev => ({ ...prev, [postId]: true }));
          triggerLikeAnimation();
        }
      }
    } catch (error) {
      console.error('[PostDetailFanFeed] Like error:', error);
    } finally {
      setLikeLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Toggle bookmark with anti spam-click - connected to database
  const toggleBookmark = async (postId: string) => {
    if (bookmarkLoading[postId]) return;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!postId || !uuidRegex.test(postId)) {
      // For mock data, use local state only
      setBookmarkedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
      return;
    }

    setBookmarkLoading(prev => ({ ...prev, [postId]: true }));
    try {
      const isCurrentlySaved = bookmarkedPosts[postId];
      if (isCurrentlySaved) {
        const { error } = await unsavePost(postId);
        if (!error) {
          setBookmarkedPosts(prev => ({ ...prev, [postId]: false }));
        }
      } else {
        const { error } = await savePost(postId);
        if (!error) {
          setBookmarkedPosts(prev => ({ ...prev, [postId]: true }));
        }
      }
    } catch (error) {
      console.error('[PostDetailFanFeed] Bookmark error:', error);
    } finally {
      setBookmarkLoading(prev => ({ ...prev, [postId]: false }));
    }
  };

  // Become fan with anti spam-click - using real database
  const becomeFan = async (userId: string) => {
    // Validate UUID format to avoid mock data errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || fanLoading[userId] || !uuidRegex.test(userId)) {
      console.warn('[PostDetailFanFeed] Invalid userId:', userId);
      return;
    }
    setFanLoading(prev => ({ ...prev, [userId]: true }));
    try {
      const { error } = await followUser(userId);
      if (!error) {
        setFanStatus(prev => ({ ...prev, [userId]: true }));
      } else {
        console.error('[PostDetailFanFeed] Follow error:', error);
      }
    } catch (error) {
      console.error('[PostDetailFanFeed] Follow error:', error);
    } finally {
      setFanLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  // Share post with anti spam-click
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

  // Report post with anti spam-click
  const handleReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      setShowMenu(false);

      // Check if already reported (anti-spam)
      if (hasUserReported(currentPost.id)) {
        showError('Déjà signalé', 'Vous avez déjà signalé ce contenu. Il est en cours d\'examen.');
        return;
      }

      // Check if content is already under review
      if (isUnderReview(currentPost.id)) {
        showError('Sous examen', 'Ce contenu est déjà en cours d\'examen par notre équipe.');
        return;
      }

      // Show report modal
      setShowReportModal(true);
    } finally {
      setReportLoading(false);
    }
  };

  // Submit report to store
  const submitReport = (reason: string) => {
    setShowReportModal(false);

    // Submit to content store
    const result = storeSubmitReport(currentPost.id, reason);

    if (result.alreadyReported) {
      showError('Déjà signalé', result.message);
    } else if (result.success) {
      showSuccess('Signalé', result.message);
    } else {
      showError('Erreur', 'Une erreur est survenue. Veuillez réessayer.');
    }
  };

  // Mute user with anti spam-click
  const handleMute = async () => {
    if (muteLoading) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already muted
    if (isUserMuted(userId)) {
      setShowMenu(false);
      showError('Déjà masqué', 'Cet utilisateur est déjà masqué.');
      return;
    }

    setShowMenu(false);
    showDestructiveConfirm(
      'Masquer cet utilisateur ?',
      'Vous ne verrez plus ses publications dans vos feeds.',
      async () => {
        setMuteLoading(true);
        try {
          const { error } = await mute(userId);
          if (error) {
            showError('Erreur', 'Impossible de masquer cet utilisateur.');
          } else {
            showSuccess('Utilisateur masqué', 'Vous ne verrez plus ses publications.');
          }
        } finally {
          setMuteLoading(false);
        }
      }
    );
  };

  // Block user with anti spam-click
  const handleBlock = async () => {
    if (blockLoading) return;
    const userId = currentPost.user?.id;
    if (!userId) return;

    // Check if already blocked
    if (isBlocked(userId)) {
      setShowMenu(false);
      showError('Déjà bloqué', 'Cet utilisateur est déjà bloqué.');
      return;
    }

    setShowMenu(false);
    showDestructiveConfirm(
      'Bloquer cet utilisateur ?',
      'Vous ne verrez plus ses publications et il ne pourra plus interagir avec vous.',
      async () => {
        setBlockLoading(true);
        try {
          const { error } = await block(userId);
          if (error) {
            showError('Erreur', 'Impossible de bloquer cet utilisateur.');
          } else {
            showSuccess('Utilisateur bloqué', 'Vous ne verrez plus ses publications.');
          }
        } finally {
          setBlockLoading(false);
        }
      }
    );
  };
  
  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Render post item
  const renderPostItem = ({ item, index }: { item: FanFeedPost; index: number }) => {
    const isLiked = likedPosts[item.id];
    const isBookmarked = bookmarkedPosts[item.id];
    const isFanOfUser = fanStatus[item.user.id];
    const isCheckingFanStatus = fanStatusChecking[item.user.id] || (fanStatus[item.user.id] === undefined && isValidUUID(item.user.id));
    const userFollowsMe = item.user.followsMe;
    const postUnderReview = isUnderReview(item.id);

    return (
      <TouchableWithoutFeedback onPress={handleDoubleTap}>
        <View style={[styles.postContainer, { height: height }]}>
          {/* Under Review Overlay */}
          {postUnderReview && (
            <View style={styles.underReviewOverlay}>
              <View style={styles.underReviewBadge}>
                <Ionicons name="alert-circle" size={24} color="#FFF" />
                <Text style={styles.underReviewText}>Contenu sous examen</Text>
              </View>
            </View>
          )}

          {/* Media */}
          {item.type === 'video' ? (
            <Video
              ref={index === currentIndex ? videoRef : null}
              source={{ uri: item.media }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={isAudioMuted}
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
              <SmuppyHeartIcon size={100} color={colors.heartRed} filled />
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
              style={[styles.actionBtn, likeLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleLike(item.id)}
              disabled={likeLoading[item.id]}
            >
              {likeLoading[item.id] ? (
                <ActivityIndicator size="small" color={colors.primaryGreen} />
              ) : (
                <SmuppyHeartIcon
                  size={28}
                  color={isLiked ? colors.heartRed : '#FFF'}
                  filled={isLiked}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, bookmarkLoading[item.id] && styles.actionBtnDisabled]}
              onPress={() => toggleBookmark(item.id)}
              disabled={bookmarkLoading[item.id]}
            >
              {bookmarkLoading[item.id] ? (
                <ActivityIndicator size="small" color={colors.primaryGreen} />
              ) : (
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={28}
                  color={isBookmarked ? colors.primaryGreen : '#FFF'}
                />
              )}
            </TouchableOpacity>

            {item.type === 'video' && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setIsAudioMuted(!isAudioMuted)}
              >
                <Ionicons
                  name={isAudioMuted ? 'volume-mute' : 'volume-high'}
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
                onPress={() => navigateToProfile(item.user.id)}
              >
                <AvatarImage source={item.user.avatar} size={40} style={styles.avatar} />
                <Text style={styles.userName}>{item.user.name}</Text>
              </TouchableOpacity>
              
              {/* Bouton Fan - logique:
                  - Si on vérifie le statut → pas de bouton (évite le clignotement)
                  - Si déjà fan → pas de bouton (rien)
                  - Si pas fan + ils me suivent → "Track"
                  - Si pas fan + ils me suivent pas → "+ Fan"
              */}
              {!isCheckingFanStatus && !isFanOfUser && (
                <TouchableOpacity
                  style={[styles.fanBtn, fanLoading[item.user.id] && styles.fanBtnDisabled]}
                  onPress={() => becomeFan(item.user.id)}
                  disabled={fanLoading[item.user.id]}
                >
                  {fanLoading[item.user.id] ? (
                    <ActivityIndicator size="small" color={colors.primaryGreen} />
                  ) : (
                    <>
                      {!userFollowsMe && (
                        <Ionicons name="add" size={16} color={colors.primaryGreen} />
                      )}
                      <Text style={styles.fanBtnText}>
                        {userFollowsMe ? 'Track' : 'Fan'}
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
                <SmuppyHeartIcon size={18} color={colors.heartRed} filled />
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
  };
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Posts FlashList (vertical scroll) */}
      <FlashList<FanFeedPost>
        ref={flatListRef}
        data={fanFeedPosts}
        renderItem={renderPostItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={handleScroll}
        scrollEventThrottle={16}
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

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCopyLink}
            >
              <Ionicons name="link-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Copy Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                navigateToProfile(currentPost.user.id);
              }}
            >
              <Ionicons name="person-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>View Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleMute} disabled={muteLoading}>
              <Ionicons name="eye-off-outline" size={24} color="#FFF" />
              <Text style={styles.menuItemText}>Mute user</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleBlock} disabled={blockLoading}>
              <Ionicons name="ban-outline" size={24} color="#FF6B6B" />
              <Text style={[styles.menuItemText, { color: '#FF6B6B' }]}>Block user</Text>
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

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
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
    borderColor: colors.primaryGreen,
    gap: 4,
    minWidth: 70,
    justifyContent: 'center',
  },
  fanBtnDisabled: {
    opacity: 0.6,
  },
  fanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryGreen,
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
    backgroundColor: colors.border,
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
    backgroundColor: colors.border,
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
    borderBottomColor: colors.border,
  },
  reportOptionText: {
    fontSize: 16,
    color: '#FFF',
  },
});

export default PostDetailFanFeedScreen;