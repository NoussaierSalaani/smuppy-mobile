import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import DoubleTapLike from '../../components/DoubleTapLike';
import { useContentStore } from '../../store/contentStore';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import { useMoodAI, getMoodDisplay } from '../../hooks/useMoodAI';
import { getCurrentProfile, getDiscoveryFeed, likePost, unlikePost, hasLikedPost, Post } from '../../services/database';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;
const PEAK_CARD_WIDTH = 100;
const PEAK_CARD_HEIGHT = 140;

// Icon mapping for interests
const INTEREST_ICONS: Record<string, string> = {
  'Fitness': 'fitness',
  'Yoga': 'body',
  'Running': 'walk',
  'Nutrition': 'nutrition',
  'Camping': 'bonfire',
  'Swimming': 'water',
  'Cycling': 'bicycle',
  'Hiking': 'trail-sign',
  'Gym': 'barbell',
  'Meditation': 'leaf',
  'Dance': 'musical-notes',
  'Climbing': 'trending-up',
  'Tennis': 'tennisball',
  'Basketball': 'basketball',
  'Football': 'football',
  'Golf': 'golf',
};

// Mock Peaks data (will be replaced with real API)
const PEAKS_DATA = [
  {
    id: 'peak1',
    thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200',
    user: { id: 'u1', name: 'Sarah', avatar: 'https://i.pravatar.cc/100?img=1' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak2',
    thumbnail: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200',
    user: { id: 'u2', name: 'Mike', avatar: 'https://i.pravatar.cc/100?img=12' },
    duration: 6,
    hasNew: true,
  },
  {
    id: 'peak3',
    thumbnail: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=200',
    user: { id: 'u3', name: 'Emma', avatar: 'https://i.pravatar.cc/100?img=5' },
    duration: 15,
    hasNew: false,
  },
  {
    id: 'peak4',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    user: { id: 'u4', name: 'John', avatar: 'https://i.pravatar.cc/100?img=8' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak5',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200',
    user: { id: 'u5', name: 'Lisa', avatar: 'https://i.pravatar.cc/100?img=9' },
    duration: 6,
    hasNew: false,
  },
];

// UI Post interface for VibesFeed display
interface UIVibePost {
  id: string;
  type: 'image' | 'video' | 'carousel';
  media: string;
  height: number;
  duration?: string;
  slideCount?: number;
  user: {
    id: string;
    name: string;
    avatar: string;
  };
  title: string;
  likes: number;
  isLiked: boolean;
  category: string;
}

// Transform Post from database to UI format
const transformToUIPost = (post: Post, likedPostIds: Set<string>): UIVibePost => {
  // Generate varied heights for masonry layout
  const heights = [180, 200, 220, 240, 260, 280];
  const randomHeight = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];

  return {
    id: post.id,
    type: post.media_type === 'video' ? 'video' : post.media_type === 'multiple' ? 'carousel' : 'image',
    media: post.media_urls?.[0] || 'https://via.placeholder.com/400x500',
    height: randomHeight,
    slideCount: post.media_type === 'multiple' ? post.media_urls?.length : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || post.author?.username || 'User',
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
    },
    title: post.content || '',
    likes: post.likes_count || 0,
    isLiked: likedPostIds.has(post.id),
    category: post.tags?.[0] || 'General',
  };
};

// Related posts (for modal)
const RELATED_POSTS = [
  { id: '101', media: 'https://picsum.photos/200/250?random=101', height: 120 },
  { id: '102', media: 'https://picsum.photos/200/200?random=102', height: 100 },
  { id: '103', media: 'https://picsum.photos/200/280?random=103', height: 140 },
  { id: '104', media: 'https://picsum.photos/200/220?random=104', height: 110 },
  { id: '105', media: 'https://picsum.photos/200/260?random=105', height: 130 },
  { id: '106', media: 'https://picsum.photos/200/240?random=106', height: 120 },
];

// Advanced Smuppy Mood Indicator Component
interface MoodIndicatorProps {
  mood: ReturnType<typeof useMoodAI>['mood'];
  onRefresh?: () => void;
}

const MoodIndicator = React.memo(({ mood, onRefresh }: MoodIndicatorProps) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation
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

    // Glow animation for high confidence
    if (mood && mood.confidence > 0.6) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [mood?.confidence]);

  if (!mood) return null;

  const display = getMoodDisplay(mood.primaryMood);
  const confidencePercent = Math.round(mood.confidence * 100);

  // Strategy badge
  const strategyBadge = mood.signals.engagement > 0.7 ? 'Active' :
                        mood.signals.behavioral > 0.7 ? 'Engaged' :
                        'Exploring';

  return (
    <TouchableOpacity onPress={onRefresh} activeOpacity={0.8}>
      <Animated.View style={[styles.moodContainer, { transform: [{ scale: pulseAnim }] }]}>
        <LinearGradient
          colors={[display.color + '25', display.color + '10', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.moodGradient}
        >
          {/* Emoji with glow effect */}
          <Animated.View
            style={[
              styles.moodIconContainer,
              {
                backgroundColor: display.color + '30',
                shadowColor: display.color,
                shadowOpacity: glowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.2, 0.6],
                }) as any,
                shadowRadius: 8,
              },
            ]}
          >
            <Text style={styles.moodEmoji}>{display.emoji}</Text>
          </Animated.View>

          {/* Text content */}
          <View style={styles.moodTextContainer}>
            <View style={styles.moodLabelRow}>
              <Text style={styles.moodLabel}>Your vibe</Text>
              <View style={[styles.strategyBadge, { backgroundColor: display.color + '20' }]}>
                <Text style={[styles.strategyBadgeText, { color: display.color }]}>{strategyBadge}</Text>
              </View>
            </View>
            <Text style={[styles.moodValue, { color: display.color }]}>{display.label}</Text>
            <Text style={styles.moodDescription}>{display.description}</Text>
          </View>

          {/* Confidence indicator */}
          <View style={styles.moodConfidenceContainer}>
            <Text style={[styles.moodConfidenceText, { color: display.color }]}>{confidencePercent}%</Text>
            <View style={styles.moodConfidence}>
              <Animated.View
                style={[
                  styles.moodConfidenceBar,
                  {
                    width: `${confidencePercent}%`,
                    backgroundColor: display.color,
                  },
                ]}
              />
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
});

export default function VibesFeed() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBar();
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
    onMoodChange: (newMood) => {
      console.log('[VibesFeed] Mood changed to:', newMood.primaryMood);
    },
  });

  // User interests from profile
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [activeInterests, setActiveInterests] = useState<Set<string>>(new Set());

  // Posts state
  const [posts, setPosts] = useState<UIVibePost[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [selectedPost, setSelectedPost] = useState<UIVibePost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Load user interests from profile
  useEffect(() => {
    const loadUserInterests = async () => {
      const { data: profile } = await getCurrentProfile();
      if (profile?.interests && profile.interests.length > 0) {
        setUserInterests(profile.interests);
      } else {
        // Default interests if user hasn't set any
        setUserInterests(['Fitness', 'Yoga', 'Running', 'Nutrition', 'Swimming', 'Cycling']);
      }
    };
    loadUserInterests();
  }, []);

  // Fetch posts from API
  const fetchPosts = useCallback(async (pageNum = 0, refresh = false) => {
    try {
      const selectedArray = Array.from(activeInterests);
      const { data, error } = await getDiscoveryFeed(selectedArray, userInterests, pageNum, 20);

      if (error) {
        console.error('[VibesFeed] Error fetching posts:', error);
        return;
      }

      if (data) {
        // Check liked status for each post
        const likedIds = new Set<string>();
        for (const post of data) {
          const { hasLiked } = await hasLikedPost(post.id);
          if (hasLiked) likedIds.add(post.id);
        }

        const transformedPosts = data.map(post => transformToUIPost(post, likedIds));

        if (refresh || pageNum === 0) {
          setPosts(transformedPosts);
          setLikedPostIds(likedIds);
        } else {
          setPosts(prev => [...prev, ...transformedPosts]);
          setLikedPostIds(prev => new Set([...prev, ...likedIds]));
        }

        setHasMore(data.length >= 20);
      }
    } catch (err) {
      console.error('[VibesFeed] Error:', err);
    }
  }, [activeInterests, userInterests]);

  // Initial load when interests are ready
  useEffect(() => {
    if (userInterests.length > 0) {
      setIsLoading(true);
      fetchPosts(0).finally(() => setIsLoading(false));
    }
  }, [userInterests, fetchPosts]);

  // Reload when active interests change
  useEffect(() => {
    if (userInterests.length > 0 && !isLoading) {
      setPage(0);
      fetchPosts(0, true);
    }
  }, [activeInterests]);

  // Navigate to user profile
  const goToUserProfile = useCallback((userId: string) => {
    // Close modal properly with engagement tracking
    if (modalVisible && selectedPost) {
      const timeSpent = (Date.now() - postViewStartRef.current) / 1000;
      trackPostExit(selectedPost.id, timeSpent);
      setModalVisible(false);
      setSelectedPost(null);
    }
    navigation.navigate('UserProfile', { userId });
  }, [navigation, modalVisible, selectedPost, trackPostExit]);

  // Navigate to Peak view
  const goToPeakView = useCallback((peak: any, index: number) => {
    navigation.navigate('PeakView', {
      peakData: PEAKS_DATA as any,
      initialIndex: index,
    });
  }, [navigation]);

  // Filter posts (hide under_review - SAFETY-2 AND hide muted/blocked - SAFETY-3)
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (isUnderReview(String(post.id))) return false;
      const authorId = post.user?.id;
      if (authorId && isHidden(authorId)) return false;
      return true;
    });
  }, [posts, isUnderReview, isHidden]);

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
    return userInterests.map((interest) => ({
      id: interest,
      name: interest,
      icon: (INTEREST_ICONS[interest] || 'sparkles') as keyof typeof Ionicons.glyphMap,
      active: activeInterests.has(interest),
    }));
  }, [userInterests, activeInterests]);

  // Like/unlike post with engagement tracking
  const toggleLike = useCallback(async (postId: string) => {
    // Optimistic update
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

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    try {
      if (post.isLiked) {
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
        trackLike(postId, post.category);
      }
    } catch (err) {
      console.error('[VibesFeed] Like error:', err);
    }
  }, [posts, trackLike]);

  // Track post view start time for engagement tracking
  const postViewStartRef = useRef<number>(0);

  // Open post modal with engagement tracking
  const openPostModal = useCallback((post: UIVibePost) => {
    postViewStartRef.current = Date.now();
    trackPostView(post.id, post.category, post.user.id, post.type);
    setSelectedPost(post);
    setModalVisible(true);
  }, [trackPostView]);

  // Close post modal with engagement tracking
  const closePostModal = useCallback(() => {
    if (selectedPost) {
      const timeSpent = (Date.now() - postViewStartRef.current) / 1000;
      trackPostExit(selectedPost.id, timeSpent);
    }
    setModalVisible(false);
    setSelectedPost(null);
  }, [selectedPost, trackPostExit]);

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
    const leftColumn = [];
    const rightColumn = [];
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
  const renderPeakCard = (peak, index) => (
    <TouchableOpacity
      key={peak.id}
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
        <Image source={{ uri: peak.user.avatar }} style={styles.peakAvatar} />
      </View>
      
      <Text style={styles.peakUserName} numberOfLines={1}>{peak.user.name}</Text>
    </TouchableOpacity>
  );

  // Render vibe card with double-tap to like and glassmorphism
  const renderVibeCard = (post) => (
    <DoubleTapLike
      key={post.id}
      onDoubleTap={() => {
        if (!post.isLiked) {
          toggleLike(post.id);
        }
      }}
      onSingleTap={() => openPostModal(post)}
      showAnimation={!post.isLiked}
      style={[styles.vibeCard, { height: post.height }]}
    >
      <Image source={{ uri: post.media }} style={styles.vibeImage} />

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
            <Image source={{ uri: post.user.avatar }} style={styles.vibeAvatar} />
            <Text style={styles.vibeUserName} numberOfLines={1}>{post.user.name}</Text>
            <View style={styles.vibeLikes}>
              <SmuppyHeartIcon
                size={12}
                color={post.isLiked ? COLORS.primary : "#fff"}
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
                  source={{ uri: selectedPost.media }}
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
                <TouchableOpacity 
                  style={styles.modalUser}
                  onPress={() => goToUserProfile(selectedPost.user.id)}
                >
                  <Image source={{ uri: selectedPost.user.avatar }} style={styles.modalAvatar} />
                  <View style={styles.modalUserInfo}>
                    <Text style={styles.modalUserName}>{selectedPost.user.name}</Text>
                    <Text style={styles.modalCategory}>{selectedPost.category}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalFollowButton}>
                    <Text style={styles.modalFollowText}>Fan</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                <Text style={styles.modalTitle}>{selectedPost.title}</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalAction}>
                    <SmuppyHeartIcon size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>{formatNumber(selectedPost.likes)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="chatbubble-outline" size={22} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Comment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="share-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="bookmark-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Related posts */}
              <View style={styles.relatedSection}>
                <Text style={styles.relatedTitle}>More like this</Text>
                <View style={styles.relatedGrid}>
                  {RELATED_POSTS.map((post) => (
                    <TouchableOpacity key={post.id} style={styles.relatedCard}>
                      <Image source={{ uri: post.media }} style={[styles.relatedImage, { height: post.height }]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

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
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
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
          />
        }
      >
        {/* SMUPPY MOOD INDICATOR - AI-powered personalization */}
        <MoodIndicator mood={mood} onRefresh={refreshMood} />

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
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  interest.active && styles.filterChipActive,
                ]}
                onPress={() => toggleInterest(interest.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={interest.icon}
                  size={12}
                  color={interest.active ? '#fff' : COLORS.primary}
                />
                <Text style={[
                  styles.filterChipText,
                  interest.active && styles.filterChipTextActive,
                ]}>
                  {interest.name}
                </Text>
                {interest.active && (
                  <Ionicons name="close" size={10} color="#fff" style={{ marginLeft: 4 }} />
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    paddingTop: SPACING.sm,
  },

  // Smuppy Mood Indicator
  moodContainer: {
    marginHorizontal: SPACING.base,
    marginBottom: SPACING.md,
  },
  moodGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  moodIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodTextContainer: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  moodLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
    color: COLORS.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontSize: 14,
    marginTop: 2,
  },
  moodDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: 10,
    color: COLORS.gray,
    marginTop: 1,
  },
  moodConfidenceContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  moodConfidenceText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 11,
    marginBottom: 3,
  },
  moodConfidence: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  moodConfidenceBar: {
    height: '100%',
    borderRadius: 2,
  },

  // PEAKS SECTION
  peaksSection: {
    marginBottom: SPACING.md,
  },
  peaksSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
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
  filtersContainer: {
    maxHeight: 40,
    marginBottom: SPACING.sm,
  },
  filtersContent: {
    paddingHorizontal: SPACING.base,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: COLORS.primary,
    marginLeft: 4,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Grid
  gridContainer: {
    paddingHorizontal: SPACING.base,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },

  // Vibe Card
  vibeCard: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    marginBottom: SPACING.base,
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
  modalFollowButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  modalFollowText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
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
  },
  relatedImage: {
    width: '100%',
  },

  // Pagination
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
