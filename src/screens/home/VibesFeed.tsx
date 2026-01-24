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
import { useContentStore } from '../../store/contentStore';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import { useMoodAI, getMoodDisplay } from '../../hooks/useMoodAI';
import SharePostModal from '../../components/SharePostModal';
import { getCurrentProfile, getDiscoveryFeed, likePost, unlikePost, hasLikedPostsBatch, Post, followUser, isFollowing } from '../../services/database';

const { width } = Dimensions.get('window');
const GRID_PADDING = 8; // SPACING.sm
const GRID_GAP = 10;
const COLUMN_WIDTH = (width - (GRID_PADDING * 2) - GRID_GAP) / 2;
const PEAK_CARD_WIDTH = 100;
const PEAK_CARD_HEIGHT = 140;

// Icon and color mapping for interests (matching EditInterestsScreen)
const INTEREST_DATA: Record<string, { icon: string; color: string }> = {
  // Sports
  'Football': { icon: 'football', color: '#8B4513' },
  'Basketball': { icon: 'basketball', color: '#FF6B35' },
  'Tennis': { icon: 'tennisball', color: '#C5E063' },
  'Swimming': { icon: 'water', color: '#0099CC' },
  'Running': { icon: 'walk', color: '#FF5722' },
  'Cycling': { icon: 'bicycle', color: '#E63946' },
  'Golf': { icon: 'golf', color: '#228B22' },
  'Volleyball': { icon: 'basketball-outline', color: '#FFC107' },
  // Fitness
  'Gym': { icon: 'barbell', color: '#1E90FF' },
  'CrossFit': { icon: 'fitness', color: '#FF4500' },
  'Weightlifting': { icon: 'barbell-outline', color: '#2F4F4F' },
  'Cardio': { icon: 'heart', color: '#FF1493' },
  'HIIT': { icon: 'flash', color: '#FF6347' },
  'Calisthenics': { icon: 'body', color: '#20B2AA' },
  'Pilates': { icon: 'fitness-outline', color: '#E91E63' },
  'Stretching': { icon: 'resize', color: '#8BC34A' },
  'Fitness': { icon: 'fitness', color: '#FF4500' },
  // Wellness
  'Yoga': { icon: 'body', color: '#9B59B6' },
  'Meditation': { icon: 'leaf', color: '#27AE60' },
  'Nutrition': { icon: 'nutrition', color: '#FF9800' },
  'Spa & Recovery': { icon: 'sparkles', color: '#00BCD4' },
  'Mental Health': { icon: 'happy', color: '#607D8B' },
  'Sleep': { icon: 'moon', color: '#3F51B5' },
  'Mindfulness': { icon: 'flower', color: '#E91E63' },
  'Breathwork': { icon: 'cloudy', color: '#00ACC1' },
  // Outdoor
  'Hiking': { icon: 'trail-sign', color: '#5D4037' },
  'Climbing': { icon: 'trending-up', color: '#795548' },
  'Surfing': { icon: 'water', color: '#0288D1' },
  'Skiing': { icon: 'snow', color: '#42A5F5' },
  'Camping': { icon: 'bonfire', color: '#FF7043' },
  'Trail Running': { icon: 'walk', color: '#4CAF50' },
  'Mountain Biking': { icon: 'bicycle', color: '#795548' },
  'Kayaking': { icon: 'boat', color: '#00897B' },
  // Combat Sports
  'Boxing': { icon: 'fitness', color: '#DC143C' },
  'MMA': { icon: 'fitness', color: '#D32F2F' },
  'Judo': { icon: 'body', color: '#1976D2' },
  'Karate': { icon: 'hand-right', color: '#F57C00' },
  'Taekwondo': { icon: 'flash', color: '#7B1FA2' },
  'BJJ': { icon: 'body-outline', color: '#388E3C' },
  'Kickboxing': { icon: 'fitness-outline', color: '#E64A19' },
  'Muay Thai': { icon: 'flash-outline', color: '#FF5722' },
  // Water Sports
  'Scuba Diving': { icon: 'water', color: '#0277BD' },
  'Snorkeling': { icon: 'water-outline', color: '#00ACC1' },
  'Wakeboarding': { icon: 'boat', color: '#0288D1' },
  'Water Polo': { icon: 'water', color: '#1976D2' },
  'Paddle Board': { icon: 'boat', color: '#00BCD4' },
  'Sailing': { icon: 'boat', color: '#0097A7' },
  // Recovery
  'Massage': { icon: 'hand-left', color: '#8BC34A' },
  'Physiotherapy': { icon: 'bandage', color: '#3498DB' },
  'Cryotherapy': { icon: 'snow', color: '#00BCD4' },
  'Foam Rolling': { icon: 'resize', color: '#FF9800' },
  'Sauna': { icon: 'flame', color: '#FF5722' },
  'Ice Baths': { icon: 'water', color: '#2196F3' },
  // Fallback
  'Dance': { icon: 'musical-notes', color: '#E91E63' },
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
  isSaved: boolean;
  category: string;
  tags?: string[];
}

// Transform Post from database to UI format
// Handles both new format (media_urls, content) and legacy format (media_url, caption)
const transformToUIPost = (post: Post, likedPostIds: Set<string>): UIVibePost => {
  // Generate varied heights for masonry layout
  const heights = [180, 200, 220, 240, 260, 280];
  const randomHeight = heights[Math.abs(post.id.charCodeAt(0)) % heights.length];

  // Get media URL - support both array and single string formats
  const mediaUrl = post.media_urls?.[0] || post.media_url || 'https://via.placeholder.com/400x500';

  // Get content - support both 'content' and 'caption' fields
  const contentText = post.content || post.caption || '';

  // Determine media type - normalize 'photo' to 'image'
  const normalizedType = post.media_type === 'photo' ? 'image' : post.media_type;

  return {
    id: post.id,
    type: normalizedType === 'video' ? 'video' : normalizedType === 'multiple' ? 'carousel' : 'image',
    media: mediaUrl,
    height: randomHeight,
    slideCount: post.media_type === 'multiple' ? (post.media_urls?.length || 1) : undefined,
    user: {
      id: post.author?.id || post.author_id,
      name: post.author?.full_name || post.author?.username || 'User',
      avatar: post.author?.avatar_url || 'https://via.placeholder.com/100',
    },
    title: contentText,
    likes: post.likes_count || 0,
    isLiked: likedPostIds.has(post.id),
    isSaved: false, // TODO: Check saved status from API
    category: post.tags?.[0] || 'Fitness',
    tags: post.tags || [],
  };
};


// Advanced Smuppy Mood Indicator Component
interface MoodIndicatorProps {
  mood: ReturnType<typeof useMoodAI>['mood'];
  onRefresh?: () => void;
}

const MoodIndicator = React.memo(({ mood, onRefresh }: MoodIndicatorProps) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse animation (scale is supported by native driver)
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
  }, []);

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
              <View
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
    onMoodChange: (newMood) => {
      console.log('[VibesFeed] Mood changed to:', newMood.primaryMood);
    },
  });

  // User interests from profile
  const [userInterests, setUserInterests] = useState<string[]>([]);
  const [activeInterests, setActiveInterests] = useState<Set<string>>(new Set());

  // Posts state - allPosts stores everything, posts is filtered view
  const [allPosts, setAllPosts] = useState<UIVibePost[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [selectedPost, setSelectedPost] = useState<UIVibePost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Share modal state
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [postToShare, setPostToShare] = useState<{
    id: string;
    media: string;
    caption?: string;
    user: { name: string; avatar: string };
  } | null>(null);

  // Follow state for modal
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Load user interests from profile (reload when screen receives focus)
  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  // Fetch posts from API - fetches ALL posts, filtering is done locally for speed
  const fetchPosts = useCallback(async (pageNum = 0, refresh = false) => {
    try {
      // Fetch without interest filtering - we'll filter locally
      const { data, error } = await getDiscoveryFeed([], [], pageNum, 40);

      if (error) {
        console.error('[VibesFeed] Error fetching posts:', error);
        if (refresh || pageNum === 0) {
          setAllPosts([]);
          setHasMore(false);
        }
        return;
      }

      if (!data) {
        console.warn('[VibesFeed] No data returned');
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

        const transformedPosts = data.map(post => transformToUIPost(post, likedIds));

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
  }, []);

  // Initial load - only once when component mounts
  useEffect(() => {
    setIsLoading(true);
    fetchPosts(0).finally(() => setIsLoading(false));
  }, [fetchPosts]);

  // NO reload on activeInterests change - filtering is instant/local

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
  const { sortedPosts: filteredPosts, matchingCount } = useMemo(() => {
    // First, apply safety filters (hide under_review and muted/blocked users)
    let result = allPosts.filter(post => {
      if (isUnderReview(String(post.id))) return false;
      const authorId = post.user?.id;
      if (authorId && isHidden(authorId)) return false;
      return true;
    });

    // If no interests selected, sort by engagement only
    if (activeInterests.size === 0) {
      return {
        sortedPosts: [...result].sort((a, b) => b.likes - a.likes),
        matchingCount: 0
      };
    }

    // Calculate relevance score for each post
    const selectedArray = Array.from(activeInterests);
    console.log('[VibesFeed] Active interests:', selectedArray);

    const getRelevanceScore = (post: UIVibePost): number => {
      let score = 0;

      // Check if post matches selected interests (case-insensitive)
      const postTags = post.tags?.map(t => t.toLowerCase()) || [];
      const postCategory = post.category?.toLowerCase() || '';

      const matchingTags = selectedArray.filter(interest =>
        postTags.includes(interest.toLowerCase()) ||
        postCategory === interest.toLowerCase()
      );

      // More matching tags = higher priority
      score += matchingTags.length * 1000;

      // Add engagement score (likes normalized)
      score += Math.min(post.likes, 500); // Cap at 500 to not overpower interest matching

      return score;
    };

    // Count matching posts
    let matching = 0;
    result.forEach(post => {
      if (getRelevanceScore(post) >= 1000) matching++;
    });

    console.log('[VibesFeed] Matching posts:', matching, '/', result.length);

    // Sort by relevance score (highest first)
    const sorted = [...result].sort((a, b) => {
      const scoreA = getRelevanceScore(a);
      const scoreB = getRelevanceScore(b);
      return scoreB - scoreA;
    });

    return { sortedPosts: sorted, matchingCount: matching };
  }, [allPosts, activeInterests, isUnderReview, isHidden]);

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
      }
    } catch (err) {
      console.error('[VibesFeed] Like error:', err);
    }
  }, [allPosts, trackLike]);

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
    // Get fresh post data from allPosts to ensure sync
    const freshPost = allPosts.find(p => p.id === post.id) || post;
    setSelectedPost(freshPost);
    setModalVisible(true);
  }, [trackPostView, allPosts]);

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
        <Image source={{ uri: peak.user.avatar }} style={styles.peakAvatar} />
      </View>
      
      <Text style={styles.peakUserName} numberOfLines={1}>{peak.user.name}</Text>
    </TouchableOpacity>
  );

  // Render vibe card with double-tap to like and glassmorphism
  const renderVibeCard = (post, index: number) => (
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
                <View style={styles.modalUser}>
                  <TouchableOpacity
                    style={styles.modalUserTouch}
                    onPress={() => goToUserProfile(selectedPost.user.id)}
                  >
                    <Image source={{ uri: selectedPost.user.avatar }} style={styles.modalAvatar} />
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
                        setPostToShare({
                          id: selectedPost.id,
                          media: selectedPost.media,
                          caption: selectedPost.title,
                          user: {
                            name: selectedPost.user.name,
                            avatar: selectedPost.user.avatar,
                          },
                        });
                        setShareModalVisible(true);
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
                        <Image source={{ uri: post.media }} style={[styles.relatedImage, { height: 100 }]} />
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
          {/* Add interests button */}
          <TouchableOpacity
            style={styles.addInterestButton}
            onPress={() => navigation.navigate('EditInterests', { returnTo: 'VibesFeed' })}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        </ScrollView>

        {/* Filter status indicator */}
        {activeInterests.size > 0 && (
          <View style={styles.filterStatus}>
            <Text style={styles.filterStatusText}>
              {matchingCount > 0
                ? `${matchingCount} post${matchingCount > 1 ? 's' : ''} matching your interests`
                : 'No exact matches - showing by popularity'}
            </Text>
            <TouchableOpacity onPress={() => setActiveInterests(new Set())}>
              <Text style={styles.clearFiltersText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}

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
        visible={shareModalVisible}
        post={postToShare}
        onClose={() => {
          setShareModalVisible(false);
          setPostToShare(null);
        }}
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
  moodConfidence: {
    width: 36,
    height: 3,
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
  filtersContainer: {
    maxHeight: 36,
    marginBottom: SECTION_GAP,
  },
  filtersContent: {
    paddingHorizontal: SPACING.base,
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
    marginLeft: 4,
  },

  // Filter status
  filterStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: 8,
    backgroundColor: '#F0FDF9',
    marginHorizontal: SPACING.base,
    marginBottom: 8,
    borderRadius: 8,
  },
  filterStatusText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.primary,
    flex: 1,
  },
  clearFiltersText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: COLORS.gray,
    textDecorationLine: 'underline',
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
