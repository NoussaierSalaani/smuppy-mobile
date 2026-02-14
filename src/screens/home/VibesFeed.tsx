import React, { memo, useState, useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Animated,
  RefreshControl,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage, { AvatarImage, ThumbnailImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import type { MainStackParamList } from '../../types';
import * as Haptics from 'expo-haptics';
import { SIZES, SPACING, GRADIENTS } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import DoubleTapLike from '../../components/DoubleTapLike';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useContentStore } from '../../stores/contentStore';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { useMoodAI, getMoodDisplay } from '../../hooks/useMoodAI';
import { useShareModal } from '../../hooks/useModalState';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import { transformToVibePost, UIVibePost } from '../../utils/postTransformers';
import { ALL_INTERESTS } from '../../config/interests';
import { ALL_EXPERTISE } from '../../config/expertise';
import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import { useTheme } from '../../hooks/useTheme';

import { PeakGridSkeleton } from '../../components/skeleton';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

import SharePostModal from '../../components/SharePostModal';
import VibeGuardianOverlay from '../../components/VibeGuardianOverlay';
import SessionRecapModal from '../../components/SessionRecapModal';
import { useVibeGuardian } from '../../hooks/useVibeGuardian';
import { useVibeStore } from '../../stores/vibeStore';
import { getCurrentProfile, getDiscoveryFeed, hasLikedPostsBatch, hasSavedPostsBatch, followUser, isFollowing, deletePost } from '../../services/database';
import { sharePost } from '../../utils/share';
import type { Peak } from '../../types';
import { resolveDisplayName } from '../../types/profile';
import { awsAPI } from '../../services/aws-api';
import { usePrefetchProfile } from '../../hooks/queries';
import { useExpiredPeaks } from '../../hooks/useExpiredPeaks';
import { formatNumber } from '../../utils/formatters';
import ExpiredPeakModal from '../../components/peaks/ExpiredPeakModal';

const { width } = Dimensions.get('window');
const GRID_PADDING = 8; // SPACING.sm
const GRID_GAP = 10;
const COLUMN_WIDTH = (width - (GRID_PADDING * 2) - GRID_GAP) / 2;
const PEAK_CARD_WIDTH = 100;
const PEAK_CARD_HEIGHT = 140;

// Module-level cache — survives navigation but not app restart
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let vibesFeedCache: { posts: UIVibePost[]; timestamp: number; page: number } = {
  posts: [],
  timestamp: 0,
  page: 0,
};

/** Clear the module-level feed cache (call on logout/account switch) */
export const clearVibesFeedCache = () => {
  vibesFeedCache = { posts: [], timestamp: 0, page: 0 };
};

const PEAK_PLACEHOLDER = 'https://dummyimage.com/600x800/0b0b0b/ffffff&text=Peak';

// UUID validation regex (CLAUDE.md compliance)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sanitize text for display: strip HTML tags and control characters
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
};

// Peak data type for carousel
interface PeakCardData {
  id: string;
  videoUrl?: string;
  thumbnail: string;
  user: { id: string; name: string; avatar: string | null };
  duration: number;
  hasNew: boolean;
  createdAt?: string;
  isLiked?: boolean;
  likes?: number;
  repliesCount?: number;
  textOverlay?: string;
  filterId?: string;
  filterIntensity?: number;
  overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
  isChallenge?: boolean;
  challengeId?: string;
  challengeTitle?: string;
  expiresAt?: string;
  isOwnPeak?: boolean;
}

// Build unified lookup from interests + expertise + business categories (icon + color per name)
const INTEREST_DATA: Record<string, { icon: string; color: string }> = (() => {
  const map: Record<string, { icon: string; color: string }> = {};
  for (const source of [ALL_INTERESTS, ALL_EXPERTISE]) {
    for (const category of source) {
      map[category.category] = { icon: category.icon, color: category.color };
      for (const item of category.items) {
        map[item.name] = { icon: item.icon, color: item.color };
      }
    }
  }
  // Add business categories (keyed by id and label)
  for (const biz of ALL_BUSINESS_CATEGORIES) {
    map[biz.id] = { icon: biz.icon, color: biz.color };
    map[biz.label] = { icon: biz.icon, color: biz.color };
  }
  return map;
})();

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

// Level labels defined as plain English strings inside component

const MoodIndicator = React.memo(({ mood, onRefresh, onVibePress }: MoodIndicatorProps) => {
  const { colors, isDark } = useTheme();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const vibeScore = useVibeStore((s) => s.vibeScore);
  const vibeLevel = useVibeStore((s) => s.vibeLevel);
  const currentStreak = useVibeStore((s) => s.currentStreak);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const levelLabels: Record<string, string> = {
    newcomer: 'Newcomer',
    explorer: 'Explorer',
    contributor: 'Contributor',
    influencer: 'Influencer',
    legend: 'Legend',
  };

  useEffect(() => {
    const pulse = Animated.loop(
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
    );
    pulse.start();
    return () => pulse.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mood) return null;

  const display = getMoodDisplay(mood.primaryMood);
  const levelColor = LEVEL_COLORS[vibeLevel] || colors.gray;
  const levelLabel = levelLabels[vibeLevel] || 'Newcomer';

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
            <Text style={[styles.moodConfidenceText, { color: levelColor }]}>{`${vibeScore} pts`}</Text>
            {currentStreak > 1 && (
              <View style={styles.streakRow}>
                <Ionicons name="flame" size={10} color="#FF6B35" />
                <Text style={styles.streakText}>{`${currentStreak}d`}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
});

// ============================================
// Memoized VibeCard for masonry grid
// ============================================
interface VibeCardProps {
  post: UIVibePost;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
  onLike: (postId: string) => void;
  onTap: (post: UIVibePost) => void;
  onUserPress: (userId: string) => void;
}

const VibeCard = memo<VibeCardProps>(({ post, styles, onLike, onTap, onUserPress }) => (
  <DoubleTapLike
    key={post.id}
    onDoubleTap={() => { if (!post.isLiked) onLike(post.id); }}
    onSingleTap={() => onTap(post)}
    showAnimation={!post.isLiked}
    style={[styles.vibeCard, { height: post.height }]}
  >
    <OptimizedImage source={post.media} style={styles.vibeImage} recyclingKey={post.id} />

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

    <TouchableOpacity
      style={styles.vibeNameBadge}
      onPress={(e) => {
        e.stopPropagation();
        onUserPress(post.user.id);
      }}
      activeOpacity={0.8}
    >
      <AvatarImage source={post.user.avatar} size={18} style={styles.vibeAvatar} />
      <Text style={styles.vibeUserName} numberOfLines={1}>{sanitizeText(post.user.name)}</Text>
    </TouchableOpacity>
  </DoubleTapLike>
), (prev, next) =>
  prev.post.id === next.post.id &&
  prev.post.isLiked === next.post.isLiked &&
  prev.post.likes === next.post.likes &&
  prev.styles === next.styles
);

interface VibesFeedProps {
  headerHeight?: number;
}

export interface VibesFeedRef {
  scrollToTop: () => void;
}

const VibesFeed = forwardRef<VibesFeedRef, VibesFeedProps>(({ headerHeight = 0 }, ref) => {
  const { colors, isDark } = useTheme();
  const { showSuccess, showError, showDestructiveConfirm } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const { handleScroll, showBars } = useTabBar();
  const scrollRef = useRef<FlashListRef<UIVibePost>>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Expose scrollToTop method to parent
  useImperativeHandle(ref, () => ({
    scrollToTop: () => {
      scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      showBars();
    },
  }));
  const { isUnderReview, submitPostReport, hasUserReported } = useContentStore();
  const { isHidden, mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();

  // Account type and user ID (needed before useMoodAI to gate it)
  const accountType = useUserStore((state) => state.user?.accountType);
  const currentUserId = useUserStore((state) => state.user?.id);
  const isBusiness = accountType === 'pro_business';

  // Expired peaks modal
  const { expiredPeaks, savePeakToProfile, deletePeak, downloadPeak } = useExpiredPeaks();
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  useEffect(() => {
    if (expiredPeaks.length > 0) {
      setShowExpiredModal(true);
    } else {
      setShowExpiredModal(false);
    }
  }, [expiredPeaks.length]);

  // Advanced Mood AI System (disabled for business accounts)
  const {
    mood,
    handleScroll: handleMoodScroll,
    trackPostView,
    trackPostExit,
    trackLike,
    refreshMood,
  } = useMoodAI({
    enabled: !isBusiness,
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

  // Posts state - initialize from cache for instant display
  const [allPosts, setAllPosts] = useState<UIVibePost[]>(vibesFeedCache.posts);
  const [, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(() => vibesFeedCache.posts.length === 0);
  const [page, setPage] = useState(vibesFeedCache.page);

  const [selectedPost, setSelectedPost] = useState<UIVibePost | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [peaksData, setPeaksData] = useState<PeakCardData[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // Share modal state (using shared hook)
  const shareModal = useShareModal();

  // Menu & report modal state for inline modal
  const [modalMenuVisible, setModalMenuVisible] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);

  // Follow state for modal
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [carouselIndexes, setCarouselIndexes] = useState<Record<string, number>>({});

  // Re-sync like/save state when screen regains focus
  const isFirstVibesFocus = useRef(true);
  const allPostsRef = useRef(allPosts);
  allPostsRef.current = allPosts;
  useFocusEffect(
    useCallback(() => {
      if (isFirstVibesFocus.current) {
        isFirstVibesFocus.current = false;
        return;
      }

      // Immediately apply like overrides from detail screens (no flash)
      const overrides = useFeedStore.getState().optimisticLikes;
      const overrideIds = Object.keys(overrides);
      if (overrideIds.length > 0) {
        setAllPosts(prev => prev.map(p => {
          const override = overrides[p.id];
          if (override !== undefined && override !== p.isLiked) {
            return { ...p, isLiked: override, likes: p.likes + (override ? 1 : -1) };
          }
          return p;
        }));
      }

      // Re-sync like/save state from database (backup)
      // Clear optimistic overrides only AFTER authoritative data is applied
      const currentPosts = allPostsRef.current;
      if (currentPosts.length > 0) {
        const postIds = currentPosts.map(p => p.id);
        Promise.allSettled([
          hasLikedPostsBatch(postIds),
          hasSavedPostsBatch(postIds),
        ]).then(([likedResult, savedResult]) => {
          const likedMap = likedResult.status === 'fulfilled' ? likedResult.value : new Map<string, boolean>();
          const savedMap = savedResult.status === 'fulfilled' ? savedResult.value : new Map<string, boolean>();
          setAllPosts(prev => prev.map(p => ({
            ...p,
            isLiked: likedMap.get(p.id) ?? p.isLiked,
            isSaved: savedMap.get(p.id) ?? p.isSaved,
          })));
          // Now that authoritative data is applied, clear overrides
          if (overrideIds.length > 0) {
            const applied = postIds.filter(id => id in overrides);
            if (applied.length > 0) {
              useFeedStore.getState().clearOptimisticLikes(applied);
            }
          }
        });
      } else if (overrideIds.length > 0) {
        // No posts to re-sync, clear overrides immediately
        useFeedStore.getState().clearOptimisticLikes(overrideIds);
      }
    }, [])
  );

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
        if (__DEV__) console.warn('[VibesFeed] Error fetching posts:', error);
        if (allPosts.length === 0) setLoadError(true);
        return;
      }
      setLoadError(false);

      if (!data || data.length === 0) {
        if (refresh || pageNum === 0) {
          setHasMore(false);
        }
        return;
      }

      const postIds = data.map(post => post.id);
      const [likedResult, savedResult] = await Promise.allSettled([
        hasLikedPostsBatch(postIds),
        hasSavedPostsBatch(postIds),
      ]);

      const likedMap = likedResult.status === 'fulfilled' ? likedResult.value : new Map<string, boolean>();
      const savedMap = savedResult.status === 'fulfilled' ? savedResult.value : new Map<string, boolean>();

      const likedIds = new Set<string>(
        postIds.filter(id => likedMap.get(id))
      );
      const savedIds = new Set<string>(
        postIds.filter(id => savedMap.get(id))
      );

      const transformedPosts = data.map(post => transformToVibePost(post, likedIds, savedIds));

      if (refresh || pageNum === 0) {
        setAllPosts(transformedPosts);
        setLikedPostIds(likedIds);
        vibesFeedCache = { posts: transformedPosts, timestamp: Date.now(), page: 0 };
      } else {
        setAllPosts(prev => {
          const updated = [...prev, ...transformedPosts];
          vibesFeedCache = { posts: updated, timestamp: Date.now(), page: pageNum };
          return updated;
        });
        setLikedPostIds(prev => new Set([...prev, ...likedIds]));
      }

      setHasMore(data.length >= 40);
    } catch (err) {
      if (__DEV__) console.warn('[VibesFeed] Error:', err);
      if (allPosts.length === 0) setLoadError(true);
    }
  }, [activeInterests, userInterests, allPosts.length]);

  // Reload when interests change — skip if cache is fresh
  useEffect(() => {
    const isCacheStale = Date.now() - vibesFeedCache.timestamp > CACHE_TTL;
    if (vibesFeedCache.posts.length > 0 && !isCacheStale) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setPage(0);
    fetchPosts(0, true).finally(() => setIsLoading(false));
  }, [fetchPosts]);

  // Fetch peaks for carousel
  useEffect(() => {
    let mounted = true;

    if (__DEV__) {
      console.log('[VibesFeed] Fetching peaks...', { currentUserId });
    }

    const toCdn = (url?: string | null) => {
      if (!url) return null;
      return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
    };

    awsAPI.getPeaks({ limit: 10 })
      .then((res) => {
        if (!mounted) return;
        if (__DEV__) {
          console.log('[VibesFeed] Peaks API response:', {
            count: res.data?.length || 0,
            data: res.data
          });
        }

        const mappedPeaks = (res.data || []).map((p) => {
          const thumbnail = toCdn(p.thumbnailUrl) || toCdn(p.author?.avatarUrl) || PEAK_PLACEHOLDER;
          const videoUrl = toCdn(p.videoUrl) || undefined;
          const createdAt = p.createdAt || new Date().toISOString();
          const hasNew = (Date.now() - new Date(createdAt).getTime()) < 60 * 60 * 1000;
          return {
            id: p.id,
            videoUrl,
            thumbnail,
            user: { id: p.author?.id || p.authorId, name: resolveDisplayName(p.author), avatar: toCdn(p.author?.avatarUrl) || null },
            duration: p.duration || 0,
            createdAt,
            isLiked: !!p.isLiked,
            likes: p.likesCount ?? 0,
            repliesCount: p.commentsCount ?? 0,
            textOverlay: p.caption || undefined,
            filterId: p.filterId || undefined,
            filterIntensity: p.filterIntensity ?? undefined,
            overlays: p.overlays || undefined,
            isChallenge: !!p.challenge?.id,
            challengeId: p.challenge?.id || undefined,
            challengeTitle: p.challenge?.title || undefined,
            expiresAt: p.expiresAt || undefined,
            isOwnPeak: (p.author?.id || p.authorId) === currentUserId,
            hasNew,
          };
        });

        if (__DEV__) {
          console.log('[VibesFeed] Mapped peaks:', mappedPeaks.length);
        }

        setPeaksData(mappedPeaks);
      })
      .catch((err) => {
        if (__DEV__) {
          console.warn('[VibesFeed] Error loading peaks:', err);
        }
      });

    return () => { mounted = false; };
  }, [currentUserId]);

  // Passive daily login streak tracking
  useEffect(() => {
    useVibeStore.getState().checkDailyLogin();
  }, []);

  // Prefetch profile data before navigation
  const prefetchProfile = usePrefetchProfile();

  // Navigate to user profile (or Profile tab if it's current user)
  const goToUserProfile = useCallback((userId: string) => {
    // Validate UUID format (CLAUDE.md compliance)
    if (!userId || !UUID_REGEX.test(userId)) {
      if (__DEV__) console.warn('[VibesFeed] Invalid user UUID:', userId);
      return;
    }

    // Close modal properly with engagement tracking
    if (modalVisible && selectedPost) {
      const timeSpent = (Date.now() - postViewStartRef.current) / 1000;
      trackPostExit(selectedPost.id, timeSpent);
      setModalVisible(false);
      setSelectedPost(null);
      setIsFollowingUser(false);
      // Wait for modal to close before navigating
      setTimeout(() => {
        if (userId === currentUserId) {
          navigation.navigate('Tabs', { screen: 'Profile' });
        } else {
          prefetchProfile(userId);
          navigation.navigate('UserProfile', { userId });
        }
      }, 300);
    } else {
      if (userId === currentUserId) {
        navigation.navigate('Tabs', { screen: 'Profile' });
      } else {
        prefetchProfile(userId);
        navigation.navigate('UserProfile', { userId });
      }
    }
  }, [navigation, modalVisible, selectedPost, trackPostExit, currentUserId, prefetchProfile]);

  // Group peaks by author for story circles (per PEAKS.md §3.3)
  const peakAuthorGroups = useMemo(() => {
    const groups = new Map<string, { user: PeakCardData['user']; peaks: PeakCardData[]; hasUnwatched: boolean; latestCreatedAt: string }>();
    peaksData.forEach(peak => {
      const userId = peak.user.id;
      const existing = groups.get(userId);
      if (existing) {
        existing.peaks.push(peak);
        if (peak.hasNew) existing.hasUnwatched = true;
        if (peak.createdAt && peak.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = peak.createdAt;
        }
      } else {
        groups.set(userId, {
          user: peak.user,
          peaks: [peak],
          hasUnwatched: peak.hasNew,
          latestCreatedAt: peak.createdAt || new Date().toISOString(),
        });
      }
    });
    // Sort: unviewed groups first, then by latest peak created_at DESC
    const sorted = Array.from(groups.values());
    sorted.sort((a, b) => {
      if (a.hasUnwatched !== b.hasUnwatched) return a.hasUnwatched ? -1 : 1;
      return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
    });
    // Sort peaks within each group by created_at ASC (oldest first = watch in order)
    for (const group of sorted) {
      group.peaks.sort((a, b) =>
        new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
    }
    return sorted;
  }, [peaksData]);

  // Peaks reorganized into contiguous author groups for story navigation
  const groupedPeaks = useMemo(() => {
    return peakAuthorGroups.flatMap(g => g.peaks);
  }, [peakAuthorGroups]);

  // Navigate to Peak view — grouped by author for story navigation
  const goToStoryGroup = useCallback((group: { user: PeakCardData['user']; peaks: PeakCardData[] }) => {
    const index = groupedPeaks.findIndex(p => p.user.id === group.user.id);
    const safeIndex = index >= 0 ? index : 0;
    navigation.navigate('PeakView', {
      peaks: groupedPeaks as unknown as Peak[],
      initialIndex: safeIndex,
    });
  }, [navigation, groupedPeaks]);

  // Sort posts by interests + engagement — feed always stays full, chips boost matching posts
  const filteredPosts = useMemo(() => {
    // Safety filters only (hide under_review and muted/blocked users)
    const result = allPosts.filter(post => {
      if (isUnderReview(String(post.id))) return false;
      const authorId = post.user?.id;
      if (authorId && isHidden(authorId)) return false;
      return true;
    });

    // Use active chips if any, otherwise profile interests
    const interestsToUse = activeInterests.size > 0
      ? Array.from(activeInterests)
      : userInterests;

    if (interestsToUse.length === 0) {
      return [...result].sort((a, b) => b.likes - a.likes);
    }

    const interestsSet = new Set(interestsToUse.map(i => i.toLowerCase()));
    const weight = activeInterests.size > 0 ? 1000 : 500;

    // Pre-compute scores once (O(n)) instead of inside sort comparator (O(n*m*logn))
    const scored = result.map(post => {
      const tags = post.tags?.map(t => t.toLowerCase()) || [];
      const cat = post.category?.toLowerCase() || '';
      const matchCount = tags.filter(t => interestsSet.has(t)).length + (interestsSet.has(cat) ? 1 : 0);
      return { post, score: matchCount * weight + Math.min(post.likes, 500) };
    });

    return scored.sort((a, b) => b.score - a.score).map(s => s.post);
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

  // Like/Save with optimistic update + rollback (shared hook)
  // onLike callback tracks engagement for AI mood + Vibe Guardian
  const onLikeCallback = useCallback((postId: string) => {
    const post = allPosts.find(p => p.id === postId);
    trackLike(postId, post?.category || '');
    trackPositiveInteraction();
  }, [allPosts, trackLike, trackPositiveInteraction]);

  const { toggleLike, toggleSave } = usePostInteractions({
    setPosts: setAllPosts,
    onLike: onLikeCallback,
    onSaveToggle: (_postId, saved) => {
      showSuccess(saved ? 'Saved' : 'Removed', saved ? 'Post added to your collection.' : 'Post removed from saved.');
    },
  });

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
      const userId = selectedPost?.user?.id;
      // Validate UUID format before API call (CLAUDE.md compliance)
      if (userId && UUID_REGEX.test(userId) && modalVisible) {
        const { following } = await isFollowing(userId);
        setIsFollowingUser(following);
      }
    };
    checkFollowStatus().catch((err) => {
      if (__DEV__) console.warn('Check follow status error:', err);
    });
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
      .slice(0, 12); // More related posts in masonry
  }, [selectedPost, allPosts]);

  // Become a fan from modal
  const becomeFan = useCallback(async () => {
    const userId = selectedPost?.user?.id;
    // Validate UUID format (CLAUDE.md compliance)
    if (followLoading || !userId || !UUID_REGEX.test(userId)) {
      if (__DEV__ && userId && !UUID_REGEX.test(userId)) {
        console.warn('[VibesFeed] Invalid user UUID for follow:', userId);
      }
      return;
    }
    setFollowLoading(true);
    try {
      const { error } = await followUser(userId);
      if (!error) {
        setIsFollowingUser(true);
        showSuccess('Followed', `You are now a fan of ${selectedPost?.user?.name || 'this user'}.`);
      }
    } catch (err) {
      if (__DEV__) console.warn('[VibesFeed] Follow error:', err);
    } finally {
      setFollowLoading(false);
    }
  }, [followLoading, selectedPost?.user?.id, selectedPost?.user?.name, showSuccess]);


  // Navigate to prescriptions (vibe press)
  const handleNavigatePrescriptions = useCallback(() => {
    navigation.navigate('Prescriptions');
  }, [navigation]);

  // Navigate to Peaks screen
  const handleNavigatePeaks = useCallback(() => {
    navigation.navigate('Peaks');
  }, [navigation]);

  // Add interest button handler (varies by account type)
  const handleAddInterestPress = useCallback(() => {
    if (accountType === 'personal') {
      navigation.navigate('EditInterests', { returnTo: 'VibesFeed' });
    } else if (accountType === 'pro_business') {
      navigation.navigate('EditExpertise', { returnTo: 'VibesFeed', includeBusinessCategories: true });
    } else {
      navigation.navigate('EditExpertise', { returnTo: 'VibesFeed' });
    }
  }, [accountType, navigation]);

  // Combined scroll handler for tab bar + mood tracking
  const handleCombinedScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    handleScroll(event);
    handleMoodScroll(event);
  }, [handleScroll, handleMoodScroll]);

  // Close expired peak modal
  const handleCloseExpiredModal = useCallback(() => setShowExpiredModal(false), []);

  // Modal action handlers
  const handleModalLike = useCallback(() => {
    if (selectedPost) {
      toggleLike(selectedPost.id);
    }
  }, [selectedPost, toggleLike]);

  const handleModalShare = useCallback(() => {
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
  }, [selectedPost, shareModal]);

  const handleModalSave = useCallback(() => {
    if (selectedPost) {
      toggleSave(selectedPost.id);
    }
  }, [selectedPost, toggleSave]);

  const handleModalUserPress = useCallback(() => {
    if (selectedPost) {
      goToUserProfile(selectedPost.user.id);
    }
  }, [selectedPost, goToUserProfile]);

  // Native OS share (fast) — replaces in-app DM share as primary action
  const handleModalNativeShare = useCallback(async () => {
    if (!selectedPost) return;
    try {
      await sharePost(selectedPost.id, selectedPost.title, selectedPost.user.name);
    } catch {
      // User cancelled — silent
    }
  }, [selectedPost]);

  // Open menu in modal
  const handleModalMenu = useCallback(() => setModalMenuVisible(true), []);
  const handleCloseModalMenu = useCallback(() => setModalMenuVisible(false), []);
  const handleCloseReportModal = useCallback(() => setShowReportModal(false), []);

  // Report post from modal
  const handleReportPost = useCallback(() => {
    if (!selectedPost) return;
    if (hasUserReported(selectedPost.id)) {
      setModalMenuVisible(false);
      showError('Already Reported', 'You have already reported this content. It is under review.');
      return;
    }
    if (isUnderReview(String(selectedPost.id))) {
      setModalMenuVisible(false);
      showError('Under Review', 'This content is already being reviewed by our team.');
      return;
    }
    setModalMenuVisible(false);
    setShowReportModal(true);
  }, [selectedPost, hasUserReported, isUnderReview, showError]);

  // Submit report with reason — async
  const handleSubmitReport = useCallback(async (reason: string) => {
    if (!selectedPost) return;
    setShowReportModal(false);
    const result = await submitPostReport(selectedPost.id, reason);
    if (result.alreadyReported) {
      showError('Already Reported', result.message);
    } else if (result.success) {
      showSuccess('Reported', result.message);
    } else {
      showError('Error', result.message || 'Could not report post. Please try again.');
    }
  }, [selectedPost, submitPostReport, showError, showSuccess]);

  // Mute user from modal
  const handleMuteUser = useCallback(() => {
    if (!selectedPost) return;
    const userId = selectedPost.user.id;
    if (isUserMuted(userId)) {
      setModalMenuVisible(false);
      showError('Already Muted', 'This user is already muted.');
      return;
    }
    setModalMenuVisible(false);
    showDestructiveConfirm(
      'Mute User',
      `Mute ${selectedPost.user.name}? You won't see their posts anymore.`,
      async () => {
        const { error } = await mute(userId);
        if (error) {
          showError('Error', 'Could not mute user. Please try again.');
        } else {
          showSuccess('Muted', `You won't see posts from ${selectedPost.user.name} anymore.`);
        }
      }
    );
  }, [selectedPost, isUserMuted, mute, showDestructiveConfirm, showSuccess, showError]);

  // Block user from modal
  const handleBlockUser = useCallback(() => {
    if (!selectedPost) return;
    const userId = selectedPost.user.id;
    if (isBlocked(userId)) {
      setModalMenuVisible(false);
      showError('Already Blocked', 'This user is already blocked.');
      return;
    }
    setModalMenuVisible(false);
    showDestructiveConfirm(
      'Block User',
      `Block ${selectedPost.user.name}? You will no longer see their posts and they won't be able to interact with you.`,
      async () => {
        const { error } = await block(userId);
        if (error) {
          showError('Error', 'Could not block user. Please try again.');
        } else {
          showSuccess('Blocked', `${selectedPost.user.name} has been blocked.`);
        }
      }
    );
  }, [selectedPost, isBlocked, block, showDestructiveConfirm, showSuccess, showError]);

  // Delete own post from modal
  const handleDeletePost = useCallback(() => {
    if (!selectedPost) return;
    setModalMenuVisible(false);
    showDestructiveConfirm(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      async () => {
        setMenuLoading(true);
        try {
          const { error } = await deletePost(selectedPost.id);
          if (error) {
            showError('Error', 'Could not delete post. Please try again.');
          } else {
            showSuccess('Deleted', 'Post has been deleted.');
            setAllPosts(prev => prev.filter(p => p.id !== selectedPost.id));
            closePostModal();
          }
        } finally {
          setMenuLoading(false);
        }
      }
    );
  }, [selectedPost, showDestructiveConfirm, showSuccess, showError, closePostModal]);

  // Memoized inline styles
  const modalBottomStyle = useMemo(() => ({ height: insets.bottom + 20 }), [insets.bottom]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    await fetchPosts(0, true);
    setRefreshing(false);
  }, [fetchPosts]);

  // Load more vibes — uses refs for guards to avoid stale closures
  const onLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      setPage(nextPage);
      await fetchPosts(nextPage);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, page, fetchPosts]);

  // FlashList renderItem for virtualized grid
  const renderGridItem = useCallback(({ item }: { item: UIVibePost }) => (
    <View style={styles.gridItemWrapper}>
      <VibeCard
        post={item}
        colors={colors}
        styles={styles}
        onLike={toggleLike}
        onTap={openPostModal}
        onUserPress={goToUserProfile}
      />
    </View>
  ), [toggleLike, openPostModal, goToUserProfile, colors, styles]);

  const keyExtractor = useCallback((item: UIVibePost) => item.id, []);

  // Render peak card for author group — original card shape, one per author
  const renderGroupCard = useCallback((group: { user: PeakCardData['user']; peaks: PeakCardData[]; hasUnwatched: boolean }) => {
    const latestPeak = group.peaks[group.peaks.length - 1];
    return (
      <TouchableOpacity
        key={`peak-group-${group.user.id}`}
        style={styles.peakCard}
        onPress={() => goToStoryGroup(group)}
        activeOpacity={0.9}
      >
        <ThumbnailImage source={latestPeak?.thumbnail || PEAK_PLACEHOLDER} style={styles.peakThumbnail} />

        {group.hasUnwatched && <View style={styles.peakNewIndicator} />}

        {group.peaks.length > 1 && (
          <View style={styles.peakCountBadge}>
            <Text style={styles.peakCountText}>{group.peaks.length}</Text>
          </View>
        )}

        <View style={styles.peakAvatarContainer}>
          <AvatarImage source={group.user.avatar} size={36} style={styles.peakAvatar} />
        </View>

        <Text style={styles.peakUserName} numberOfLines={1}>{sanitizeText(group.user.name)}</Text>
      </TouchableOpacity>
    );
  }, [goToStoryGroup, styles]);

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
              {/* Full screen image/carousel with close button */}
              <View style={styles.modalImageContainer}>
                {selectedPost.allMedia && selectedPost.allMedia.length > 1 ? (
                  <>
                    <ScrollView
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onMomentumScrollEnd={(e) => {
                        const slideIndex = Math.round(e.nativeEvent.contentOffset.x / width);
                        setCarouselIndexes(prev => ({ ...prev, [selectedPost.id]: slideIndex }));
                      }}
                    >
                      {selectedPost.allMedia.map((mediaUrl, mediaIndex) => (
                        <OptimizedImage
                          key={`${selectedPost.id}-media-${mediaIndex}`}
                          source={mediaUrl}
                          style={styles.modalImage}
                          contentFit="cover"
                        />
                      ))}
                    </ScrollView>
                    <View style={styles.modalCarouselPagination}>
                      {selectedPost.allMedia.map((_, dotIndex) => (
                        <View
                          key={`dot-${dotIndex}`}
                          style={[
                            styles.modalCarouselDot,
                            (carouselIndexes[selectedPost.id] || 0) === dotIndex && styles.modalCarouselDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  </>
                ) : (
                  <OptimizedImage
                    source={selectedPost.media}
                    style={styles.modalImage}
                    contentFit="cover"
                  />
                )}

                {/* Header buttons on image */}
                <View style={[styles.modalHeaderButtons, { top: insets.top + 12 }]}>
                  <TouchableOpacity
                    onPress={closePostModal}
                    activeOpacity={0.8}
                  >
                    <View style={styles.closeButtonBg}>
                      <Ionicons name="close" size={22} color="#fff" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleModalMenu}
                    activeOpacity={0.8}
                  >
                    <View style={styles.closeButtonBg}>
                      <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Post info */}
              <View style={styles.modalInfo}>
                <View style={styles.modalUser}>
                  <TouchableOpacity
                    style={styles.modalUserTouch}
                    onPress={handleModalUserPress}
                  >
                    <AvatarImage source={selectedPost.user.avatar} size={44} style={styles.modalAvatar} />
                    <View style={styles.modalUserInfo}>
                      <Text style={styles.modalUserName}>{sanitizeText(selectedPost.user.name)}</Text>
                      <Text style={styles.modalCategory}>{sanitizeText(selectedPost.category)}</Text>
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

                <Text style={styles.modalTitle}>{sanitizeText(selectedPost.title)}</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={handleModalLike}
                  >
                    <SmuppyHeartIcon
                      size={24}
                      color={selectedPost.isLiked ? "#FF6B6B" : colors.dark}
                      filled={selectedPost.isLiked}
                    />
                    <Text style={styles.modalActionText}>{formatNumber(selectedPost.likes)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={handleModalNativeShare}
                  >
                    <Ionicons name="share-outline" size={24} color={colors.dark} />
                    <Text style={styles.modalActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={handleModalShare}
                  >
                    <Ionicons name="paper-plane-outline" size={24} color={colors.dark} />
                    <Text style={styles.modalActionText}>Send</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAction}
                    onPress={handleModalSave}
                  >
                    <Ionicons
                      name={selectedPost.isSaved ? "bookmark" : "bookmark-outline"}
                      size={24}
                      color={selectedPost.isSaved ? colors.primary : colors.dark}
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
                        <OptimizedImage source={post.media} style={[styles.relatedImage, { height: 100 }]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Safe area bottom */}
              <View style={modalBottomStyle} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <FlashList
        ref={scrollRef}
        data={filteredPosts}
        renderItem={renderGridItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        {...{ masonry: true, optimizeItemArrangement: true, estimatedItemSize: 230 } as Record<string, unknown>}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={headerHeight > 0 ? { paddingTop: headerHeight, paddingHorizontal: GRID_PADDING - GRID_GAP / 2 } : { paddingHorizontal: GRID_PADDING - GRID_GAP / 2 }}
        onScroll={handleCombinedScroll}
        scrollEventThrottle={16}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={headerHeight}
          />
        }
        ListHeaderComponent={
          <>
            {/* SMUPPY MOOD INDICATOR */}
            {accountType !== 'pro_business' && (
              <MoodIndicator
                mood={mood}
                onRefresh={refreshMood}
                onVibePress={handleNavigatePrescriptions}
              />
            )}

            {/* PEAKS SECTION — Story circles grouped by author (per PEAKS.md §3) */}
            {peakAuthorGroups.length > 0 && <View style={styles.peaksSection}>
              <View style={styles.peaksSectionHeader}>
                <Text style={styles.peaksSectionTitle}>Peaks</Text>
                <TouchableOpacity
                  style={styles.peaksSeeAll}
                  onPress={handleNavigatePeaks}
                >
                  <Text style={styles.peaksSeeAllText}>See all</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.peaksScrollContent}
              >
                {peakAuthorGroups.map((group) => renderGroupCard(group))}
              </ScrollView>
            </View>}

            {/* Filters */}
            <View style={styles.filtersRow}>
              <TouchableOpacity
                style={styles.addInterestButton}
                onPress={handleAddInterestPress}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
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
                            <Ionicons name="close" size={12} color={colors.dark} style={styles.closeIconMargin} />
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
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <PeakGridSkeleton />
          ) : loadError ? (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={64} color={colors.gray} />
              <Text style={styles.emptyTitle}>Couldn't load feed</Text>
              <Text style={styles.emptySubtitle}>Check your connection and try again</Text>
              <TouchableOpacity
                style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 20 }}
                onPress={() => { setLoadError(false); setIsLoading(true); fetchPosts(0, true).finally(() => setIsLoading(false)); }}
              >
                <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color={colors.gray} />
              <Text style={styles.emptyTitle}>No vibes found</Text>
              <Text style={styles.emptySubtitle}>Try selecting different interests</Text>
            </View>
          )
        }
        ListFooterComponent={
          <>
            {loadingMore && (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            <View style={styles.footerSpacer} />
          </>
        }
      />

      {renderModal()}

      {/* Modal Menu (Report/Mute/Block/Delete) */}
      <Modal
        visible={modalMenuVisible}
        animationType="slide"
        transparent
        onRequestClose={handleCloseModalMenu}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseModalMenu}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            {selectedPost && selectedPost.user.id === currentUserId && (
              <TouchableOpacity style={styles.menuItem} onPress={handleDeletePost} disabled={menuLoading}>
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete Post</Text>
              </TouchableOpacity>
            )}
            {selectedPost && selectedPost.user.id !== currentUserId && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleMuteUser}>
                  <Ionicons name="eye-off-outline" size={22} color={colors.dark} />
                  <Text style={styles.menuItemText}>Mute User</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlockUser}>
                  <Ionicons name="ban-outline" size={22} color="#FF6B6B" />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block User</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.menuItem} onPress={handleReportPost}>
              <Ionicons name="flag-outline" size={22} color="#FF6B6B" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancelButton} onPress={handleCloseModalMenu}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Reason Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={handleCloseReportModal}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseReportModal}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />
            <Text style={styles.reportTitle}>Report this post</Text>
            <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>
            <TouchableOpacity style={styles.reportOption} onPress={() => handleSubmitReport('spam')}>
              <Text style={styles.reportOptionText}>Spam or misleading</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportOption} onPress={() => handleSubmitReport('inappropriate')}>
              <Text style={styles.reportOptionText}>Inappropriate content</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportOption} onPress={() => handleSubmitReport('harassment')}>
              <Text style={styles.reportOptionText}>Harassment or bullying</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportOption} onPress={() => handleSubmitReport('violence')}>
              <Text style={styles.reportOptionText}>Violence or dangerous</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportOption} onPress={() => handleSubmitReport('other')}>
              <Text style={styles.reportOptionText}>Other</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancelButton} onPress={handleCloseReportModal}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share Post Modal */}
      <SharePostModal
        visible={shareModal.isVisible}
        post={shareModal.data}
        onClose={shareModal.close}
      />

      {/* Vibe Guardian Overlay — anti-doom-scroll (not for business accounts) */}
      {!isBusiness && (
        <VibeGuardianOverlay
          visible={isGuardianAlert}
          onDismiss={dismissGuardianAlert}
        />
      )}

      {/* Session Recap Modal (not for business accounts) */}
      {accountType !== 'pro_business' && (
        <SessionRecapModal
          visible={showSessionRecap}
          recap={sessionRecap}
          onDismiss={dismissSessionRecap}
        />
      )}

      {/* Expired Peaks Decision Modal */}
      <ExpiredPeakModal
        visible={showExpiredModal && expiredPeaks.length > 0}
        peaks={expiredPeaks}
        onSaveToProfile={savePeakToProfile}
        onDownload={downloadPeak}
        onDelete={deletePeak}
        onClose={handleCloseExpiredModal}
      />
    </View>
  );
});

export default VibesFeed;

const SECTION_GAP = 8; // Consistent spacing between all sections

const createStyles = (colors: typeof import('../../config/theme').COLORS, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
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
    color: colors.gray,
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
    color: colors.gray,
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
    color: colors.dark,
  },
  peaksSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  peaksSeeAllText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: colors.primary,
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
    backgroundColor: colors.gray900,
  },
  peakNewIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
  },
  peakCountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  peakCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
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
    borderColor: colors.primary,
  },
  peakUserName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: colors.dark,
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
    backgroundColor: colors.background,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: colors.grayBorder,
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
    backgroundColor: colors.primaryLight,
    gap: 5,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.dark,
  },
  closeIconMargin: {
    marginLeft: 2,
  },
  addInterestButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
  },
  gridItemWrapper: {
    paddingHorizontal: GRID_GAP / 2,
    paddingBottom: GRID_GAP,
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
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(14, 191, 138, 0.35)' : 'rgba(14, 191, 138, 0.25)',
  },
  vibeImage: {
    width: '100%',
    height: '100%',
  },
  vibeNameBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: '80%',
  },
  vibeAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  vibeUserName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
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
    color: colors.primary,
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.6)',
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.6)',
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
    color: colors.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.sm,
  },

  // ===== MODAL (Full screen post) =====
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalImageContainer: {
    position: 'relative',
    width: width,
    height: width * 1.25,
  },
  modalImage: {
    width: width,
    height: '100%',
  },
  modalCarouselPagination: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCarouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  modalCarouselDotActive: {
    backgroundColor: '#fff',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalHeaderButtons: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  closeButtonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.5)',
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
    color: colors.dark,
  },
  modalCategory: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
  },
  modalUserTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalFollowButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
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
    color: colors.dark,
    marginBottom: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: colors.grayBorder,
  },
  modalAction: {
    alignItems: 'center',
  },
  modalActionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.gray,
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
    color: colors.dark,
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
    backgroundColor: colors.backgroundSecondary,
  },
  relatedOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)',
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
  footerSpacer: {
    height: 100,
  },

  // Menu & Report Modals
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.grayBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  menuItemText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
  },
  menuItemTextDanger: {
    color: '#FF6B6B',
  },
  menuCancelButton: {
    marginTop: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  menuCancelText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.dark,
  },
  reportTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
    textAlign: 'center',
    marginBottom: 4,
  },
  reportSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 16,
  },
  reportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  reportOptionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.dark,
  },
});
