import React, { useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import DoubleTapLike from '../../components/DoubleTapLike';
import { useContentStore, useUserSafetyStore, useUserStore } from '../../stores';
import { useMoodAI, getMoodDisplay } from '../../hooks/useMoodAI';
import { useShareModal } from '../../hooks';
import { transformToVibePost, UIVibePost } from '../../utils/postTransformers';

import SharePostModal from '../../components/SharePostModal';
import VibeGuardianOverlay from '../../components/VibeGuardianOverlay';
import SessionRecapModal from '../../components/SessionRecapModal';
import { useVibeGuardian } from '../../hooks/useVibeGuardian';
import { useVibeStore } from '../../stores/vibeStore';
import { getCurrentProfile, getDiscoveryFeed, likePost, unlikePost, hasLikedPostsBatch, followUser, isFollowing } from '../../services/database';

const { width } = Dimensions.get('window');
const GRID_PADDING = 8; // SPACING.sm
const GRID_GAP = 10;
const COLUMN_WIDTH = (width - (GRID_PADDING * 2) - GRID_GAP) / 2;
const PEAK_CARD_WIDTH = 100;
const PEAK_CARD_HEIGHT = 140;

const PEAKS_DATA: { id: string; thumbnail: string; user: { id: string; name: string; avatar: string | null }; duration: number; hasNew: boolean }[] = [];
const INTEREST_DATA: Record<string, { icon: string; color: string }> = {};

// UIVibePost and transformToVibePost are now imported from utils/postTransformers


// Advanced Smuppy Mood Indicator Component
interface MoodIndicatorProps {
  mood: ReturnType<typeof useMoodAI>['mood'];
  onRefresh?: () => void;
  onVibePress?: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  newcomer: '#9E9E9E',
  explorer: '#4CAF50',
  contributor: '#2196F3',
  influencer: '#9C27B0',
  legend: '#FF9800',
};

const LEVEL_LABELS: Record<string, string> = {
  newcomer: 'Newcomer',
  explorer: 'Explorer',
  contributor: 'Contributor',
  influencer: 'Influencer',
  legend: 'Legend',
};

const MoodIndicator = React.memo(({ mood, onRefresh, onVibePress }: MoodIndicatorProps) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const vibeScore = useVibeStore((s) => s.vibeScore);
  const vibeLevel = useVibeStore((s) => s.vibeLevel);
  const currentStreak = useVibeStore((s) => s.currentStreak);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mood) return null;

  const display = getMoodDisplay(mood.primaryMood);
  const levelColor = LEVEL_COLORS[vibeLevel] || COLORS.gray;
  const levelLabel = LEVEL_LABELS[vibeLevel] || 'Newcomer';

  return (
    <TouchableOpacity onPress={onVibePress || onRefresh} activeOpacity={0.8}>
      <Animated.View style={[styles.moodContainer, { transform: [{ scale: pulseAnim }] }]}>
        <LinearGradient
          colors={[display.color + '25', display.color + '10', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.moodGradient}
        >
          {/* Emoji with glow effect */}
          <View
            style={[
              styles.moodIconContainer,
              {
                backgroundColor: display.color + '30',
                shadowColor: display.color,
                shadowOpacity: 0.4,
                shadowRadius: 8,
              },
            ]}
          >
            <Text style={styles.moodEmoji}>{display.emoji}</Text>
          </View>

          {/* Mood + Level info */}
          <View style={styles.moodTextContainer}>
            <View style={styles.moodLabelRow}>
              <Text style={styles.moodLabel}>Your vibe</Text>
              <View style={[styles.strategyBadge, { backgroundColor: levelColor + '20' }]}>
                <Text style={[styles.strategyBadgeText, { color: levelColor }]}>{levelLabel}</Text>
              </View>
            </View>
            <Text style={[styles.moodValue, { color: display.color }]}>{display.label}</Text>
            <Text style={styles.moodDescription}>{display.description}</Text>
          </View>

          {/* Score + Streak */}
          <View style={styles.moodConfidenceContainer}>
            <Text style={[styles.moodConfidenceText, { color: levelColor }]}>{vibeScore} pts</Text>
            {currentStreak > 1 && (
              <View style={styles.streakRow}>
                <Ionicons name="flame" size={10} color="#FF6B35" />
                <Text style={styles.streakText}>{currentStreak}d</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
});

interface VibesFeedProps {
  headerHeight?: number;
}

export interface VibesFeedRef {
  scrollToTop: () => void;
}

const VibesFeed = forwardRef<VibesFeedRef, VibesFeedProps>(({ headerHeight = 0 }, ref) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<any>>();
  const { handleScroll, showBars } = useTabBar();
  const scrollRef = useRef<ScrollView>(null);

  // Expose scrollToTop method to parent
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      showBars();
    },
  }));
  const { isUnderReview } = useContentStore();
  const { isHidden } = useUserSafetyStore();

  // Advanced Mood AI System
  const {
    mood,
    handleScroll: handleMoodScroll,
    trackPostView,
    trackPostExit,
    trackLike,
    refreshMood,
  } = useMoodAI({
    enableScrollTracking: true,
    moodUpdateInterval: 30000, // Update mood every 30s
    onMoodChange: (_newMood) => {
      // Mood changed - could update UI based on mood
    },
  });

  // Vibe Guardian — anti-doom-scroll protection
  const {
    isAlertVisible: isGuardianAlert,
    dismissAlert: dismissGuardianAlert,
    sessionRecap,
    showSessionRecap,
    dismissSessionRecap,
    trackEngagement: guardianTrackEngagement,
    trackPositiveInteraction,
  } = useVibeGuardian();

  // User interests from profile
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [activeInterests, setActiveInterests] = useState<Set<string>>(new Set());

  // Posts state - allPosts stores everything, posts is filtered view
  const [allPosts, setAllPosts] = useState<UIVibePost[]>([]);
  const [, setLikedPostIds] = useState<Set<string>>(new Set());
  const [, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [selectedPost, setSelectedPost] = useState<UIVibePost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Share modal state (using shared hook)
  const shareModal = useShareModal();

  // Follow state for modal
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Get account type to determine what to show (interests vs expertise vs category)
  const accountType = useUserStore((state) => state.user?.accountType);

  // Load user interests/expertise based on account type
  // Personal → interests, Pro_creator → expertise, Pro_business → business_category + expertise
  useFocusEffect(
    useCallback(() => {
      const loadUserPreferences = async () => {
        const { data: profile } = await getCurrentProfile();

        // Choose the right field based on account type
        if (accountType === 'pro_business') {
          // Business accounts: business_category + expertise combined
          const combined: string[] = [];
          if (profile?.business_category) {
            combined.push(profile.business_category);
          }
          if (profile?.expertise && profile.expertise.length > 0) {
            profile.expertise.forEach((e: string) => {
              if (!combined.includes(e)) combined.push(e);
            });
          }
          setUserInterests(combined);
        } else if (accountType === 'pro_creator') {
          // Pro creators: expertise only
          setUserInterests(profile?.expertise?.length ? profile.expertise : []);
        } else {
          // Personal accounts: interests only
          setUserInterests(profile?.interests?.length ? profile.interests : []);
        }
      };
      loadUserPreferences();
    }, [accountType])
  );

  // Fetch posts from API - backend filters by user interests, local sorting refines
  const fetchPosts = useCallback(async (pageNum = 0, refresh = false) => {
    try {
      // Pass active chip filters as selectedInterests, user profile preferences as fallback
      const selectedArr = activeInterests.size > 0 ? Array.from(activeInterests) : [];
      const { data, error } = await getDiscoveryFeed(selectedArr, userInterests, pageNum, 40);

      if (error) {
        console.error('[VibesFeed] Error fetching posts:', error);
        if (refresh || pageNum === 0) {
          // Use mock data as fallback
          console.log('[VibesFeed] Using mock data as fallback');
          setAllPosts([]);
          setHasMore(false);
        }
        return;
      }

      if (!data || data.length === 0) {
        if (refresh || pageNum === 0) {
          setAllPosts([]);
          setHasMore(false);
        }
        return;
      }

      if (data.length > 0) {
        const postIds = data.map(post => post.id);
        const likedMap = await hasLikedPostsBatch(postIds);

        const likedIds = new Set<string>(
          postIds.filter(id => likedMap.get(id))
        );

        const transformedPosts = data.map(post => transformToVibePost(post, likedIds));

        if (refresh || pageNum === 0) {
          setAllPosts(transformedPosts);
          setLikedPostIds(likedIds);
        } else {
          setAllPosts(prev => [...prev, ...transformedPosts]);
          setLikedPostIds(prev => new Set([...prev, ...likedIds]));
        }

        setHasMore(data.length >= 40);
      } else {
        if (refresh || pageNum === 0) {
          setAllPosts([]);
          setLikedPostIds(new Set());
        }
        setHasMore(false);
      }
    } catch (err) {
      console.error('[VibesFeed] Error:', err);
      if (refresh) {
        setAllPosts([]);
        setHasMore(false);
      }
    }
  }, [activeInterests, userInterests]);

  // Reload when interests change (initial load + preference/filter changes)
  useEffect(() => {
    setIsLoading(true);
    setPage(0);
    fetchPosts(0, true).finally(() => setIsLoading(false));
  }, [fetchPosts]);

  // Passive daily login streak tracking
  useEffect(() => {
    useVibeStore.getState().checkDailyLogin();
  }, []);

  // Navigate to user profile
  const goToUserProfile = useCallback((userId: string) => {
    // Close modal properly with engagement tracking
    if (modalVisible && selectedPost) {
      const timeSpent = (Date.now() - postViewStartRef.current) / 1000;
      trackPostExit(selectedPost.id, timeSpent);
      setModalVisible(false);
      setSelectedPost(null);
      setIsFollowingUser(false);
      // Wait for modal to close before navigating
      setTimeout(() => {
        navigation.navigate('UserProfile', { userId });
      }, 300);
    } else {
      navigation.navigate('UserProfile', { userId });
    }
  }, [navigation, modalVisible, selectedPost, trackPostExit]);

  // Navigate to Peak view
  const goToPeakView = useCallback((peak: any, index: number) => {
    navigation.navigate('PeakView', {
      peakData: PEAKS_DATA as any,
      initialIndex: index,
    });
  }, [navigation]);

  // Sort posts by interests + engagement - feed always stays full!
  const filteredPosts = useMemo(() => {
    // First, apply safety filters (hide under_review and muted/blocked users)
    let result = allPosts.filter(post => {
      if (isUnderReview(String(post.id))) return false;
      const authorId = post.user?.id;
      if (authorId && isHidden(authorId)) return false;
      return true;
    });

    // Use activeInterests if any selected, otherwise use userInterests from profile
    const interestsToUse = activeInterests.size > 0
      ? Array.from(activeInterests)
      : userInterests;

    // If no interests at all, sort by engagement only
    if (interestsToUse.length === 0) {
      return [...result].sort((a, b) => b.likes - a.likes);
    }

    // Calculate relevance score for each post
    const getRelevanceScore = (post: UIVibePost): number => {
      let score = 0;

      // Check if post matches interests (case-insensitive)
      const postTags = post.tags?.map(t => t.toLowerCase()) || [];
      const postCategory = post.category?.toLowerCase() || '';

      const matchingTags = interestsToUse.filter(interest =>
        postTags.includes(interest.toLowerCase()) ||
        postCategory === interest.toLowerCase()
      );

      // More matching tags = higher priority
      // Active filters get higher weight than profile interests
      const weight = activeInterests.size > 0 ? 1000 : 500;
      score += matchingTags.length * weight;

      // Add engagement score (likes normalized)
      score += Math.min(post.likes, 500);

      return score;
    };

    // Sort by relevance score (highest first)
    return [...result].sort((a, b) => {
      const scoreA = getRelevanceScore(a);
      const scoreB = getRelevanceScore(b);
      return scoreB - scoreA;
    });
  }, [allPosts, activeInterests, userInterests, isUnderReview, isHidden]);

  // Chip animation scales
  const chipAnimations = useRef<Record<string, Animated.Value>>({}).current;

  // Get or create animation for a chip
  const getChipAnimation = useCallback((id: string) => {
    if (!chipAnimations[id]) {
      chipAnimations[id] = new Animated.Value(1);
    }
    return chipAnimations[id];
  }, [chipAnimations]);

  // Toggle interest filter with animation
  const toggleInterest = useCallback((interestName: string) => {
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Animate the chip
    const scale = getChipAnimation(interestName);
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();

    setActiveInterests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(interestName)) {
        newSet.delete(interestName);
      } else {
        newSet.add(interestName);
      }
      return newSet;
    });
  }, [getChipAnimation]);

  // Transform userInterests into interest objects for filter chips
  const interests = useMemo(() => {
    return userInterests.map((interest) => {
      const data = INTEREST_DATA[interest] || { icon: 'sparkles', color: '#8E8E93' };
      return {
        id: interest,
        name: interest,
        icon: data.icon as keyof typeof Ionicons.glyphMap,
        color: data.color,
        active: activeInterests.has(interest),
      };
    });
  }, [userInterests, activeInterests]);

  // Like/unlike post with engagement tracking
  const toggleLike = useCallback(async (postId: string) => {
    // Get current like status and category from state
    const post = allPosts.find(p => p.id === postId);
    const wasLiked = post?.isLiked || false;
    const postCategory = post?.category || '';

    // Optimistic update
    setAllPosts(prevPosts => prevPosts.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          isLiked: !p.isLiked,
          likes: p.isLiked ? p.likes - 1 : p.likes + 1,
        };
      }
      return p;
    }));

    try {
      if (wasLiked) {
        await unlikePost(postId);
        setLikedPostIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
      } else {
        await likePost(postId);
        setLikedPostIds(prev => new Set([...prev, postId]));
        // Track engagement for AI mood recommendations
        trackLike(postId, postCategory);
        // Track for Vibe Guardian
        trackPositiveInteraction();
      }
    } catch (err) {
      console.error('[VibesFeed] Like error:', err);
    }
  }, [allPosts, trackLike, trackPositiveInteraction]);

  // Toggle save (optimistic update)
  const toggleSave = useCallback((postId: string) => {
    setAllPosts(prevPosts => prevPosts.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isSaved: !post.isSaved,
        };
      }
      return post;
    }));
  }, []);

  // Track post view start time for engagement tracking
  const postViewStartRef = useRef<number>(0);

  // Open post modal with engagement tracking
  const openPostModal = useCallback((post: UIVibePost) => {
    postViewStartRef.current = Date.now();
    trackPostView(post.id, post.category, post.user.id, post.type);
    guardianTrackEngagement();
    // Get fresh post data from allPosts to ensure sync
    const freshPost = allPosts.find(p => p.id === post.id) || post;
    setSelectedPost(freshPost);
    setModalVisible(true);
  }, [trackPostView, allPosts, guardianTrackEngagement]);

  // Close post modal with engagement tracking
  const closePostModal = useCallback(() => {
    if (selectedPost) {
      const timeSpent = (Date.now() - postViewStartRef.current) / 1000;
      trackPostExit(selectedPost.id, timeSpent);
    }
    setModalVisible(false);
    setSelectedPost(null);
    setIsFollowingUser(false); // Reset follow state when closing
  }, [selectedPost, trackPostExit]);

  // Sync selectedPost with allPosts when likes/saves change
  useEffect(() => {
    if (selectedPost && modalVisible) {
      const updatedPost = allPosts.find(p => p.id === selectedPost.id);
      if (updatedPost && (updatedPost.isLiked !== selectedPost.isLiked || updatedPost.likes !== selectedPost.likes || updatedPost.isSaved !== selectedPost.isSaved)) {
        setSelectedPost(updatedPost);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPosts, selectedPost?.id, modalVisible]);

  // Check follow status when modal opens
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (selectedPost?.user?.id && modalVisible) {
        const { following } = await isFollowing(selectedPost.user.id);
        setIsFollowingUser(following);
      }
    };
    checkFollowStatus();
  }, [selectedPost?.user?.id, modalVisible]);

  // Get related posts (same category/tags, excluding current post)
  const relatedPosts = useMemo(() => {
    if (!selectedPost) return [];

    const currentCategory = selectedPost.category?.toLowerCase();
    const currentTags = selectedPost.tags?.map(t => t.toLowerCase()) || [];

    return allPosts
      .filter(post => {
        if (post.id === selectedPost.id) return false;

        // Match by category
        if (post.category?.toLowerCase() === currentCategory) return true;

        // Match by any shared tag
        const postTags = post.tags?.map(t => t.toLowerCase()) || [];
        return postTags.some(tag => currentTags.includes(tag));
      })
      .slice(0, 6); // Limit to 6 related posts
  }, [selectedPost, allPosts]);

  // Become a fan from modal
  const becomeFan = useCallback(async () => {
    if (followLoading || !selectedPost?.user?.id) return;
    setFollowLoading(true);
    try {
      const { error } = await followUser(selectedPost.user.id);
      if (!error) {
        setIsFollowingUser(true);
      }
    } catch (err) {
      console.error('[VibesFeed] Follow error:', err);
    } finally {
      setFollowLoading(false);
    }
  }, [followLoading, selectedPost?.user?.id]);

  // Format numbers
  const formatNumber = useCallback((num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }, []);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    await fetchPosts(0, true);
    setRefreshing(false);
  }, [fetchPosts]);

  // Load more vibes
  const onLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchPosts(nextPage);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchPosts]);

  // Handle scroll end for infinite loading
  const handleScrollEnd = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
    if (isNearBottom && hasMore) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  // Get columns for masonry
  const getColumns = useCallback(() => {
    const leftColumn: UIVibePost[] = [];
    const rightColumn: UIVibePost[] = [];
    let leftHeight = 0;
    let rightHeight = 0;

    filteredPosts.forEach((post) => {
      if (leftHeight <= rightHeight) {
        leftColumn.push(post);
        leftHeight += post.height + 16;
      } else {
        rightColumn.push(post);
        rightHeight += post.height + 16;
      }
    });

    return { leftColumn, rightColumn };
  }, [filteredPosts]);

  const { leftColumn, rightColumn } = useMemo(() => getColumns(), [getColumns]);

  // Render Peak card
  type PeakData = typeof PEAKS_DATA[0];
  const renderPeakCard = (peak: PeakData, index: number) => (
    <TouchableOpacity
      key={`peak-${index}-${peak.id}`}
      style={styles.peakCard}
      onPress={() => goToPeakView(peak, index)}
      activeOpacity={0.9}
    >
      <Image source={{ uri: peak.thumbnail }} style={styles.peakThumbnail} />
      
      {peak.hasNew && <View style={styles.peakNewIndicator} />}
      
      <View style={styles.peakDuration}>
        <Text style={styles.peakDurationText}>{peak.duration}s</Text>
      </View>
      
      <View style={styles.peakAvatarContainer}>
        <Image source={{ uri: peak.user.avatar || undefined }} style={styles.peakAvatar} />
      </View>
      
      <Text style={styles.peakUserName} numberOfLines={1}>{peak.user.name}</Text>
    </TouchableOpacity>
  );

  // Render vibe card with double-tap to like and glassmorphism
  const renderVibeCard = (post: UIVibePost, index: number) => (
    <DoubleTapLike
      key={`vibe-${index}-${post.id}`}
      onDoubleTap={() => {
        if (!post.isLiked) {
          toggleLike(post.id);
        }
      }}
      onSingleTap={() => openPostModal(post)}
      showAnimation={!post.isLiked}
      style={[styles.vibeCard, { height: post.height }]}
    >
      <Image source={{ uri: post.media || undefined }} style={styles.vibeImage} />

      {post.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={12} color="#fff" />
          <Text style={styles.videoDuration}>{post.duration}</Text>
        </View>
      )}

      {post.type === 'carousel' && (
        <View style={styles.carouselIndicator}>
          <Ionicons name="copy" size={14} color="#fff" />
        </View>
      )}

      {/* Glassmorphism overlay - Smuppy style */}
      <View style={styles.vibeOverlayContainer}>
        <BlurView intensity={20} tint="dark" style={styles.vibeBlurOverlay}>
          <Text style={styles.vibeTitle} numberOfLines={2}>{post.title}</Text>
          <TouchableOpacity
            style={styles.vibeMeta}
            onPress={(e) => {
              e.stopPropagation();
              goToUserProfile(post.user.id);
            }}
          >
            <Image source={{ uri: post.user.avatar || undefined }} style={styles.vibeAvatar} />
            <Text style={styles.vibeUserName} numberOfLines={1}>{post.user.name}</Text>
            <View style={styles.vibeLikes}>
              <SmuppyHeartIcon
                size={12}
                color={post.isLiked ? COLORS.heartRed : "#fff"}
                filled={post.isLiked}
              />
              <Text style={[styles.vibeLikesText, post.isLiked && styles.vibeLikesTextLiked]}>
                {formatNumber(post.likes)}
              </Text>
            </View>
          </TouchableOpacity>
        </BlurView>
      </View>
    </DoubleTapLike>
  );

  // Render modal - Full screen post
  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {selectedPost && (
            <>
              {/* Full screen image with close button */}
              <View style={styles.modalImageContainer}>
                <Image
                  source={{ uri: selectedPost.media || undefined }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
                
                {/* Close button on image */}
                <TouchableOpacity
                  style={[styles.closeButton, { top: insets.top + 12 }]}
                  onPress={closePostModal}
                  activeOpacity={0.8}
                >
                  <View style={styles.closeButtonBg}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Post info */}
              <View style={styles.modalInfo}>
                <View style={styles.modalUser}>
                  <TouchableOpacity
                    style={styles.modalUserTouch}
                    onPress={() => goToUserProfile(selectedPost.user.id)}
                  >
                    <Image source={{ uri: selectedPost.user.avatar || undefined }} style={styles.modalAvatar} />
                    <View style={styles.modalUserInfo}>
                      <Text style={styles.modalUserName}>{selectedPost.user.name}</Text>
                      <Text style={styles.modalCategory}>{selectedPost.category}</Text>
                    </View>
                  </TouchableOpacity>
                  {!isFollowingUser && (
                    <TouchableOpacity
                      style={[styles.modalFollowButton, followLoading && styles.modalFollowButtonLoading]}
                      onPress={becomeFan}
                      disabled={followLoading}
                    >
                      <Text style={styles.modalFollowText}>
                        {followLoading ? '...' : 'Become a fan'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.modalTitle}>{selectedPost.title}</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={() => {
                      if (selectedPost) {
                        toggleLike(selectedPost.id);
                      }
                    }}
                  >
                    <SmuppyHeartIcon
                      size={24}
                      color={selectedPost.isLiked ? "#FF6B6B" : COLORS.dark}
                      filled={selectedPost.isLiked}
                    />
                    <Text style={styles.modalActionText}>{formatNumber(selectedPost.likes)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={() => {
                      if (selectedPost) {
                        shareModal.open({
                          id: selectedPost.id,
                          media: selectedPost.media,
                          caption: selectedPost.title,
                          user: {
                            name: selectedPost.user.name,
                            avatar: selectedPost.user.avatar,
                          },
                        });
                      }
                    }}
                  >
                    <Ionicons name="share-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={() => {
                      if (selectedPost) {
                        toggleSave(selectedPost.id);
                      }
                    }}
                  >
                    <Ionicons
                      name={selectedPost.isSaved ? "bookmark" : "bookmark-outline"}
                      size={24}
                      color={selectedPost.isSaved ? COLORS.primary : COLORS.dark}
                    />
                    <Text style={styles.modalActionText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Related posts - Real posts from same category */}
              {relatedPosts.length > 0 && (
                <View style={styles.relatedSection}>
                  <Text style={styles.relatedTitle}>More like this</Text>
                  <View style={styles.relatedGrid}>
                    {relatedPosts.map((post, index) => (
                      <TouchableOpacity
                        key={`related-${index}-${post.id}`}
                        style={styles.relatedCard}
                        onPress={() => {
                          // Switch to this post in the modal
                          postViewStartRef.current = Date.now();
                          trackPostView(post.id, post.category, post.user.id, post.type);
                          setSelectedPost(post);
                        }}
                      >
                        <Image source={{ uri: post.media || undefined }} style={[styles.relatedImage, { height: 100 }]} />
                        <View style={styles.relatedOverlay}>
                          <SmuppyHeartIcon size={10} color="#fff" filled={post.isLiked} />
                          <Text style={styles.relatedLikes}>{formatNumber(post.likes)}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Safe area bottom */}
              <View style={{ height: insets.bottom + 20 }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          headerHeight > 0 && { paddingTop: headerHeight + 4 }
        ]}
        onScroll={(event) => {
          handleScroll(event);
          handleMoodScroll(event);
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScrollEnd}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressViewOffset={headerHeight}
          />
        }
      >
        {/* SMUPPY MOOD INDICATOR - AI-powered personalization */}
        <MoodIndicator
          mood={mood}
          onRefresh={refreshMood}
          onVibePress={() => navigation.navigate('Prescriptions' as any)}
        />

        {/* PEAKS SECTION */}
        <View style={styles.peaksSection}>
          <View style={styles.peaksSectionHeader}>
            <Text style={styles.peaksSectionTitle}>Peaks</Text>
            <TouchableOpacity
              style={styles.peaksSeeAll}
              onPress={() => navigation.navigate('Peaks')}
            >
              <Text style={styles.peaksSeeAllText}>See all</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.peaksScrollContent}
          >
            {PEAKS_DATA.map((peak, index) => renderPeakCard(peak, index))}
          </ScrollView>
        </View>

        {/* Filters with animated chips */}
        <View style={styles.filtersRow}>
          {/* Fixed add button */}
          <TouchableOpacity
            style={styles.addInterestButton}
            onPress={() => {
              const screen = accountType === 'personal' ? 'EditInterests' : 'EditExpertise';
              navigation.navigate(screen, { returnTo: 'VibesFeed' });
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color={COLORS.primary} />
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersContainer}
            contentContainerStyle={styles.filtersContent}
          >
            {interests.map((interest) => (
              <Animated.View
                key={interest.id}
                style={{ transform: [{ scale: getChipAnimation(interest.id) }] }}
              >
                {interest.active ? (
                  <TouchableOpacity
                    onPress={() => toggleInterest(interest.id)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={GRADIENTS.button}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.filterChipGradientBorder}
                    >
                      <View style={styles.filterChipSelectedInner}>
                        <Ionicons
                          name={interest.icon}
                          size={14}
                          color={interest.color}
                        />
                        <Text style={styles.filterChipText}>{interest.name}</Text>
                        <Ionicons name="close" size={12} color={COLORS.dark} style={{ marginLeft: 2 }} />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.filterChip}
                    onPress={() => toggleInterest(interest.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={interest.icon}
                      size={14}
                      color={interest.color}
                    />
                    <Text style={styles.filterChipText}>{interest.name}</Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        {/* Grid */}
        <View style={styles.gridContainer}>
          <View style={styles.masonryContainer}>
            <View style={styles.column}>
              {leftColumn.map(renderVibeCard)}
            </View>
            <View style={styles.column}>
              {rightColumn.map(renderVibeCard)}
            </View>
          </View>

          {filteredPosts.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color={COLORS.gray} />
              <Text style={styles.emptyTitle}>No vibes found</Text>
              <Text style={styles.emptySubtitle}>Try selecting different interests</Text>
            </View>
          )}

          {loadingMore && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </Animated.ScrollView>

      {renderModal()}

      {/* Share Post Modal */}
      <SharePostModal
        visible={shareModal.isVisible}
        post={shareModal.data}
        onClose={shareModal.close}
      />

      {/* Vibe Guardian Overlay — anti-doom-scroll */}
      <VibeGuardianOverlay
        visible={isGuardianAlert}
        onDismiss={dismissGuardianAlert}
      />

      {/* Session Recap Modal */}
      <SessionRecapModal
        visible={showSessionRecap}
        recap={sessionRecap}
        onDismiss={dismissSessionRecap}
      />
    </View>
  );
});

export default VibesFeed;

const SECTION_GAP = 8; // Consistent spacing between all sections

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    paddingTop: 0,
  },

  // Smuppy Mood Indicator
  moodContainer: {
    marginHorizontal: SPACING.base,
    marginBottom: 6,
    marginTop: 0,
  },
  moodGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  moodIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodEmoji: {
    fontSize: 16,
  },
  moodTextContainer: {
    flex: 1,
    marginLeft: SPACING.xs,
  },
  moodLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 9,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  moodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  strategyBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  strategyBadgeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  moodValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    marginTop: 1,
  },
  moodDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: 9,
    color: COLORS.gray,
    marginTop: 0,
  },
  moodConfidenceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  moodConfidenceText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 10,
    marginBottom: 2,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  streakText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 9,
    color: '#FF6B35',
  },

  // PEAKS SECTION
  peaksSection: {
    marginBottom: SECTION_GAP,
  },
  peaksSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: 4,
  },
  peaksSectionTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 18,
    color: COLORS.dark,
  },
  peaksSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  peaksSeeAllText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: COLORS.primary,
  },
  peaksScrollContent: {
    paddingHorizontal: SPACING.base,
    gap: SPACING.sm,
  },
  peakCard: {
    width: PEAK_CARD_WIDTH,
    marginRight: SPACING.sm,
  },
  peakThumbnail: {
    width: PEAK_CARD_WIDTH,
    height: PEAK_CARD_HEIGHT,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },
  peakNewIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  peakDuration: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  peakDurationText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: COLORS.white,
  },
  peakAvatarContainer: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    marginLeft: -18,
  },
  peakAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  peakUserName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: COLORS.dark,
    textAlign: 'center',
    marginTop: 6,
  },

  // Filters
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SECTION_GAP,
    paddingLeft: SPACING.base,
  },
  filtersContainer: {
    maxHeight: 36,
    flex: 1,
  },
  filtersContent: {
    paddingRight: SPACING.base,
    alignItems: 'center',
  },
  filterChip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 5,
  },
  filterChipGradientBorder: {
    height: 32,
    borderRadius: 16,
    padding: 1.5,
    marginRight: 8,
  },
  filterChipSelectedInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10.5,
    borderRadius: 14.5,
    backgroundColor: '#E6FAF8',
    gap: 5,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: '#0A0A0F',
  },
  addInterestButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
  },
  masonryContainer: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  column: {
    width: COLUMN_WIDTH,
  },

  // Vibe Card
  vibeCard: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    marginBottom: SECTION_GAP,
    backgroundColor: COLORS.grayLight,
  },
  vibeImage: {
    width: '100%',
    height: '100%',
  },
  // Glassmorphism overlay - Smuppy signature
  vibeOverlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderBottomLeftRadius: SIZES.radiusMd,
    borderBottomRightRadius: SIZES.radiusMd,
    overflow: 'hidden',
  },
  vibeBlurOverlay: {
    padding: SPACING.sm,
    paddingTop: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  vibeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.sm,
    paddingTop: 30,
  },
  vibeTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: '#fff',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  vibeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vibeAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  vibeUserName: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: '#fff',
    flex: 1,
  },
  vibeLikes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vibeLikesText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: '#fff',
    marginLeft: 4,
  },
  vibeLikesTextLiked: {
    color: COLORS.primary,
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  videoDuration: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: '#fff',
    marginLeft: 4,
  },
  carouselIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 4,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    marginTop: SPACING.sm,
  },

  // ===== MODAL (Full screen post) =====
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalImageContainer: {
    position: 'relative',
    width: width,
    height: width * 1.25,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  closeButtonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalInfo: {
    padding: SPACING.lg,
  },
  modalUser: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalUserInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  modalUserName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.dark,
  },
  modalCategory: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
  },
  modalUserTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalFollowButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  modalFollowButtonLoading: {
    opacity: 0.6,
  },
  modalFollowText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: '#fff',
  },
  modalTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 20,
    color: COLORS.dark,
    marginBottom: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayLight,
  },
  modalAction: {
    alignItems: 'center',
  },
  modalActionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },

  // Related
  relatedSection: {
    padding: SPACING.lg,
    paddingTop: 0,
  },
  relatedTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
    marginBottom: SPACING.md,
  },
  relatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  relatedCard: {
    width: (width - 48) / 3,
    borderRadius: SIZES.radiusSm,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    position: 'relative',
  },
  relatedImage: {
    width: '100%',
    backgroundColor: COLORS.grayLight,
  },
  relatedOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  relatedLikes: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: '#fff',
  },

  // Pagination
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
