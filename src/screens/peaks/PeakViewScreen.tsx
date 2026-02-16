import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StatusBar,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { normalizeCdnUrl, getVideoPlaybackUrl } from '../../utils/cdnUrl';
import * as MediaLibrary from 'expo-media-library';
import OptimizedImage from '../../components/OptimizedImage';
import { resolveDisplayName } from '../../types/profile';
import PeakCarousel from '../../components/peaks/PeakCarousel';
import TagFriendModal from '../../components/TagFriendModal';
import SharePostModal from '../../components/SharePostModal';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import PeakReactions, { ReactionType } from '../../components/PeakReactions';
import { WorkoutTimer, RepCounter, DayChallenge, CalorieBurn, HeartRatePulse } from '../../filters/overlays';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { copyPeakLink } from '../../utils/share';
import { savePost, unsavePost } from '../../services/database';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useContentStore } from '../../stores/contentStore';
import { awsAPI, APIError } from '../../services/aws-api';
import { useUserSafetyStore } from '../../stores/userSafetyStore';

const { width, height: screenHeight } = Dimensions.get('window');

// Utility: Convert URL to CDN URL
const toCdn = (url?: string | null): string => {
  if (!url) return '';
  return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
};

// ============================================
// Memoized List Item Components
// ============================================

interface ChallengeResponseItemProps {
  item: {
    id: string;
    challengeId?: string;
    peakId: string;
    user?: { id: string; username: string; displayName?: string; avatarUrl?: string; isVerified?: boolean };
    peak?: { id: string; thumbnailUrl?: string; videoUrl?: string; duration?: number; viewsCount?: number };
    voteCount?: number;
    createdAt: string;
  };
  onPress: (peakId: string, userId: string, displayName: string, avatarUrl: string, thumbnailUrl: string, videoUrl: string) => void;
  onVote: (responseId: string, challengeId: string) => void;
  votedResponses: Set<string>;
  colors: { primary: string; gray: string };
  styles: ReturnType<typeof createStyles>;
}

const ChallengeResponseItem = React.memo<ChallengeResponseItemProps>(({ item, onPress, onVote, votedResponses, colors, styles }) => {
  const handlePress = useCallback(() => {
    onPress(
      item.peakId,
      item.user?.id || '',
      resolveDisplayName(item.user, ''),
      item.user?.avatarUrl || '',
      item.peak?.thumbnailUrl || '',
      item.peak?.videoUrl || ''
    );
  }, [item, onPress]);

  const handleVote = useCallback(() => {
    onVote(item.id, item.challengeId || '');
  }, [item.id, item.challengeId, onVote]);

  const isVoted = votedResponses.has(item.id);

  return (
    <TouchableOpacity
      style={styles.responseItem}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <OptimizedImage
        source={{ uri: toCdn(item.peak?.thumbnailUrl) }}
        style={styles.responseThumbnail}
      />
      <View style={styles.responseInfo}>
        <View style={styles.responseUserRow}>
          <AvatarImage
            source={{ uri: toCdn(item.user?.avatarUrl) }}
            style={styles.responseAvatar}
          />
          <Text style={styles.responseUserName} numberOfLines={1}>
            {resolveDisplayName(item.user, 'Unknown').replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '')}
          </Text>
          {item.user?.isVerified && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          )}
        </View>
        <Text style={styles.responseDate}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.responseActions}>
        <TouchableOpacity style={styles.voteButton} onPress={handleVote} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={isVoted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={24} color={isVoted ? colors.primary : colors.gray} />
          {(item.voteCount ?? 0) > 0 && (
            <Text style={[styles.voteCountText, isVoted && { color: colors.primary }]}>{item.voteCount}</Text>
          )}
        </TouchableOpacity>
        <Ionicons name="play-circle" size={24} color={colors.primary} />
      </View>
    </TouchableOpacity>
  );
});

// Filter color overlay mapping — approximates GPU shader effects with gradient overlays
const FILTER_COLOR_MAP: Record<string, { colors: [string, string]; start: { x: number; y: number }; end: { x: number; y: number } }> = {
  gym_lighting:   { colors: ['rgba(255,248,240,0.18)', 'rgba(255,240,220,0.08)'], start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  natural_glow:   { colors: ['rgba(255,220,200,0.15)', 'rgba(255,200,180,0.08)'], start: { x: 0.5, y: 0.3 }, end: { x: 0.5, y: 0.8 } },
  golden_hour:    { colors: ['rgba(255,180,50,0.22)', 'rgba(255,140,0,0.10)'],    start: { x: 1, y: 0 },   end: { x: 0, y: 1 } },
  tan_tone:       { colors: ['rgba(200,150,80,0.18)', 'rgba(180,120,60,0.10)'],   start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  muscle_boost:   { colors: ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.15)'],             start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
  sweat_glow:     { colors: ['rgba(255,255,230,0.15)', 'rgba(255,255,200,0.05)'], start: { x: 0.5, y: 0.2 }, end: { x: 0.5, y: 0.8 } },
  energy_aura:    { colors: ['rgba(100,200,255,0.12)', 'rgba(200,100,255,0.12)'], start: { x: 0, y: 0 },   end: { x: 1, y: 1 } },
  neon_outline:   { colors: ['rgba(0,255,200,0.10)', 'rgba(255,0,200,0.10)'],     start: { x: 0, y: 0 },   end: { x: 1, y: 1 } },
  lightning_flex: { colors: ['rgba(70,130,255,0.15)', 'rgba(100,180,255,0.08)'],   start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
};

// Render overlay widget at stored position based on type + params
function renderOverlayWidget(type: string, params: Record<string, unknown>): React.JSX.Element | null {
  switch (type) {
    case 'workout_timer':
      return (
        <WorkoutTimer
          params={{
            totalSeconds: (params.totalSeconds as number) || 60,
            currentSeconds: (params.currentSeconds as number) || 0,
            isRunning: (params.isRunning as boolean) ?? false,
            mode: (params.mode as 'countdown' | 'stopwatch') || 'stopwatch',
            color: (params.color as string) || '#11E3A3',
          }}
          size={80}
        />
      );
    case 'rep_counter':
      return (
        <RepCounter
          params={{
            currentReps: (params.currentReps as number) || 0,
            targetReps: (params.targetReps as number | null) ?? null,
            exerciseName: (params.exerciseName as string) || 'REPS',
            color: (params.color as string) || '#11E3A3',
          }}
          size={60}
        />
      );
    case 'day_challenge':
      return (
        <DayChallenge
          params={{
            currentDay: (params.currentDay as number) || 1,
            totalDays: (params.totalDays as number) || 30,
            challengeName: (params.challengeName as string) || 'Challenge',
            color: (params.color as string) || '#FFD700',
          }}
          size={100}
        />
      );
    case 'calorie_burn':
      return (
        <CalorieBurn
          params={{
            calories: (params.calories as number) || 0,
            targetCalories: (params.targetCalories as number | null) ?? null,
            color: (params.color as string) || '#FF5722',
          }}
          size={80}
        />
      );
    case 'heart_rate_pulse':
      return (
        <HeartRatePulse
          params={{
            bpm: (params.bpm as number) || 72,
            isAnimating: (params.isAnimating as boolean) ?? true,
            color: (params.color as string) || '#FF1744',
          }}
          size={80}
        />
      );
    default:
      return null;
  }
}

interface PeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface PeakTag {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  taggedAt: string; // ISO string for React Navigation serialization
}

interface Peak {
  id: string;
  thumbnail: string;
  videoUrl?: string;
  hlsUrl?: string;
  duration: number;
  user: PeakUser;
  views: number;
  likes?: number;
  repliesCount?: number;
  tagsCount?: number;
  tags?: PeakTag[];
  textOverlay?: string;
  createdAt: string; // ISO string for React Navigation serialization
  expiresAt?: string; // ISO string — used for expiration detection
  isLiked?: boolean;
  isSaved?: boolean;
  isOwnPeak?: boolean; // To show tag count only to creator
  // Challenge fields
  isChallenge?: boolean;
  challengeId?: string;
  challengeTitle?: string;
  challengeRules?: string;
  challengeEndsAt?: string;
  challengeResponseCount?: number;
  // Filter & overlay metadata
  filterId?: string;
  filterIntensity?: number;
  overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
}

type RootStackParamList = {
  PeakView: { peaks?: Peak[]; peakData?: Peak[]; peakId?: string; initialIndex?: number };
  CreatePeak: { replyTo?: string; originalPeak?: Peak; challengeId?: string; challengeTitle?: string };
  UserProfile: { userId: string };
  [key: string]: object | undefined;
};

const NOOP = () => {};

const PeakViewScreen = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const { showError, showSuccess, showWarning, showDestructiveConfirm } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PeakView'>>();

  const { peaks: peaksParam = [], peakData = [], peakId, initialIndex = 0 } = route.params || {};
  const initialPeaks = (peaksParam && peaksParam.length > 0 ? peaksParam : peakData) as Peak[];
  const [peaks, setPeaks] = useState<Peak[]>(initialPeaks);
  const [isLoadingPeak, setIsLoadingPeak] = useState(false);
  const currentUser = useUserStore((state) => state.user);
  const isBusiness = currentUser?.accountType === 'pro_business';
  const { mute, block, isMuted: isUserMuted, isBlocked } = useUserSafetyStore();

  // If navigated with only peakId (no peaks array), fetch the peak from API
  useEffect(() => {
    if (peaks.length > 0 || !peakId) return;
    let cancelled = false;
    setIsLoadingPeak(true);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(peakId)) {
      setIsLoadingPeak(false);
      return;
    }
    awsAPI.getPeak(peakId).then((p) => {
      if (cancelled) return;
      const fetched: Peak = {
        id: p.id,
        videoUrl: p.videoUrl ? toCdn(p.videoUrl) : undefined,
        hlsUrl: p.hlsUrl ? toCdn(p.hlsUrl) : undefined,
        thumbnail: toCdn(p.thumbnailUrl) || '',
        duration: p.duration || 15,
        user: {
          id: p.author?.id || p.authorId || '',
          name: resolveDisplayName(p.author, ''),
          avatar: toCdn(p.author?.avatarUrl) || '',
        },
        views: p.viewsCount || 0,
        likes: p.likesCount || 0,
        createdAt: p.createdAt || new Date().toISOString(),
        expiresAt: p.expiresAt || undefined,
        isLiked: p.isLiked || false,
        isOwnPeak: currentUser?.id != null && (p.authorId === currentUser.id || p.author?.id === currentUser.id),
      };
      setPeaks([fetched]);
    }).catch((err) => {
      if (__DEV__) console.warn('[PeakView] Failed to fetch peak by ID:', err);
      showError('Error', 'Could not load this Peak. Please try again.');
    }).finally(() => {
      if (!cancelled) setIsLoadingPeak(false);
    });
    return () => { cancelled = true; };
  }, [peakId, peaks.length, currentUser?.id, showError]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [carouselVisible, setCarouselVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [isInChain, setIsInChain] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [likedPeaks, setLikedPeaks] = useState<Set<string>>(() => {
    // Initialize from peak data (isLiked from API) + store overrides
    const initial = new Set<string>();
    const overrides = useFeedStore.getState().optimisticPeakLikes;
    peaks.forEach(p => {
      const override = overrides[p.id];
      if (override !== undefined) {
        if (override) initial.add(p.id);
      } else if ((p as { isLiked?: boolean }).isLiked) {
        initial.add(p.id);
      }
    });
    return initial;
  });
  const [savedPeaks, setSavedPeaks] = useState<Set<string>>(new Set());
  const [viewedPeaks, setViewedPeaks] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<Video | null>(null);
  const [showTagModal, setShowTagModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [peakTags, setPeakTags] = useState<Map<string, string[]>>(new Map()); // peakId -> taggedUserIds
  const [showReactions, setShowReactions] = useState(false);
  const [peakReactions, setPeakReactions] = useState<Map<string, ReactionType>>(new Map()); // peakId -> reaction
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingPeak, setReportingPeak] = useState(false);
  const [challengeResponses, setChallengeResponses] = useState<Array<{
    id: string;
    challengeId?: string;
    peakId: string;
    user?: { id: string; username: string; displayName?: string; avatarUrl?: string; isVerified?: boolean };
    peak?: { id: string; thumbnailUrl?: string; videoUrl?: string; duration?: number; viewsCount?: number };
    voteCount?: number;
    createdAt: string;
  }>>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [votedResponses, setVotedResponses] = useState<Set<string>>(new Set());

  // Content store for reporting
  const { submitPeakReport } = useContentStore();

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartParticles = useRef([...Array(6)].map(() => ({
    scale: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }))).current;
  const lastTap = useRef(0);

  // Refs for panResponder (avoids stale closure with useRef-created handler)
  const currentIndexRef = useRef(currentIndex);
  const peaksRef = useRef(peaks);
  const authorGroupRangesRef = useRef<Array<{ userId: string; start: number; end: number }>>([]);

  const currentPeak = useMemo(() => peaks[currentIndex] || ({} as Peak), [peaks, currentIndex]);
  const createdDate = useMemo(() => {
    const value = currentPeak?.createdAt || new Date().toISOString();
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }, [currentPeak]);

  useEffect(() => {
    if (!currentPeak.videoUrl) {
      videoRef.current = null;
      setProgress(0);
    }
  }, [currentPeak.videoUrl]);

  // Hardware back handler (Android) as a fail-safe
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  useEffect(() => {
    if (showOnboarding) {
      const timer = setTimeout(() => {
        setShowOnboarding(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding]);

  // Expiration detection: check every 30s if current peak has expired mid-view
  useEffect(() => {
    if (!currentPeak.expiresAt || currentPeak.isOwnPeak) return;
    const checkExpiration = () => {
      const expiresMs = new Date(currentPeak.expiresAt!).getTime();
      if (!isNaN(expiresMs) && Date.now() > expiresMs) {
        showWarning('Peak Expired', 'This peak has expired and is no longer available.');
        navigation.goBack();
      }
    };
    // Check immediately then every 30s
    checkExpiration();
    const interval = setInterval(checkExpiration, 30000);
    return () => clearInterval(interval);
  }, [currentPeak.expiresAt, currentPeak.isOwnPeak, navigation, showWarning]);

  // Keep refs in sync for panResponder closure
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { peaksRef.current = peaks; }, [peaks]);

  // Reset progress and play when peak changes
  useEffect(() => {
    setProgress(0);
    if (videoRef.current) {
      videoRef.current.setPositionAsync(0).then(() => {
        videoRef.current?.playAsync().catch((err) => {
          if (__DEV__) console.warn('[PeakView] playAsync failed:', err);
        });
      }).catch((err) => {
        if (__DEV__) console.warn('[PeakView] setPositionAsync failed:', err);
      });
    }

    // Count a view locally (once per peak in this session) and record server-side
    if (currentPeak.id && !viewedPeaks.has(currentPeak.id)) {
      setViewedPeaks(prev => new Set(prev).add(currentPeak.id));
      setPeaks(prev => prev.map((p, i) => i === currentIndex ? { ...p, views: (p.views || 0) + 1 } : p));
      // Fire-and-forget: GET /peaks/:id records the view server-side
      awsAPI.getPeak(currentPeak.id).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const animateHeart = (): void => {
    setShowHeart(true);
    heartScale.setValue(0);

    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Animate main heart
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.2,
        damping: 8,
        stiffness: 300,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        damping: 10,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 200,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeart(false);
    });

    // Animate particles
    const angles = [0, 60, 120, 180, 240, 300];
    heartParticles.forEach((particle, index) => {
      const angle = (angles[index] * Math.PI) / 180;
      const distance = 80 + Math.random() * 40;

      particle.scale.setValue(0);
      particle.translateX.setValue(0);
      particle.translateY.setValue(0);
      particle.opacity.setValue(1);

      Animated.parallel([
        Animated.timing(particle.scale, {
          toValue: 0.6 + Math.random() * 0.4,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateX, {
          toValue: Math.cos(angle) * distance,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(particle.translateY, {
          toValue: Math.sin(angle) * distance,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(particle.opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleSingleTap = (): void => {
    // Toggle play/pause and carousel visibility
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    if (videoRef.current) {
      nextPaused ? videoRef.current.pauseAsync() : videoRef.current.playAsync();
    }
    setCarouselVisible(!carouselVisible);
  };

  const handleDoubleTap = (): void => {
    if (isInChain) {
      setIsInChain(false);
    } else {
      // Like the peak (only if not already liked)
      if (!likedPeaks.has(currentPeak.id)) {
        toggleLike(); // Call API to persist the like
      }
      setCarouselVisible(true);
    }
  };

  const isLikingRef = useRef(false);
  const toggleLike = useCallback(async (): Promise<void> => {
    if (isLikingRef.current) return;
    isLikingRef.current = true;
    setLikeButtonDisabled(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isCurrentlyLiked = likedPeaks.has(currentPeak.id);

    // Optimistic update
    setLikedPeaks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentPeak.id)) {
        newSet.delete(currentPeak.id);
      } else {
        newSet.add(currentPeak.id);
        animateHeart();
      }
      return newSet;
    });

    try {
      // Single toggle endpoint: backend returns { liked: true/false }
      await awsAPI.likePeak(currentPeak.id);
      const newLiked = !isCurrentlyLiked;
      useFeedStore.getState().setPeakLikeOverride(currentPeak.id, newLiked);
      setPeaks(prev => prev.map((p, i) => i === currentIndex ? {
        ...p,
        likes: newLiked ? (p.likes || 0) + 1 : Math.max((p.likes || 1) - 1, 0),
        isLiked: newLiked,
      } : p));
    } catch (error) {
      if (__DEV__) console.warn('[Peak] Failed to toggle like:', error);
      // Detect expired peak (404)
      if (error instanceof APIError && error.statusCode === 404) {
        showWarning('Peak Expired', 'This peak has expired and is no longer available.');
        navigation.goBack();
        return;
      }
      // Rollback on error
      setLikedPeaks(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyLiked) {
          newSet.add(currentPeak.id);
        } else {
          newSet.delete(currentPeak.id);
        }
        return newSet;
      });
      // Error haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      isLikingRef.current = false;
      setLikeButtonDisabled(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPeak.id, likedPeaks]);

  const toggleSave = useCallback(async (): Promise<void> => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasSaved = savedPeaks.has(currentPeak.id);

    // Optimistic update
    setSavedPeaks(prev => {
      const newSet = new Set(prev);
      if (wasSaved) {
        newSet.delete(currentPeak.id);
      } else {
        newSet.add(currentPeak.id);
      }
      return newSet;
    });

    try {
      if (wasSaved) {
        const { error } = await unsavePost(currentPeak.id);
        if (error) {
          // Rollback
          setSavedPeaks(prev => { const s = new Set(prev); s.add(currentPeak.id); return s; });
        } else {
          showSuccess('Removed', 'Post removed from saved.');
        }
      } else {
        const { error } = await savePost(currentPeak.id);
        if (error) {
          // Rollback
          setSavedPeaks(prev => { const s = new Set(prev); s.delete(currentPeak.id); return s; });
        } else {
          showSuccess('Saved', 'Post added to your collection.');
        }
      }
    } catch {
      // Rollback on network error
      setSavedPeaks(prev => {
        const newSet = new Set(prev);
        if (wasSaved) {
          newSet.add(currentPeak.id);
        } else {
          newSet.delete(currentPeak.id);
        }
        return newSet;
      });
    }
  }, [currentPeak.id, savedPeaks, showSuccess]);

  const handleOpenTagModal = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowTagModal(true);
  }, []);

  const handleTagFriend = useCallback(async (friend: { id: string; name: string }) => {
    // Optimistic update
    setPeakTags(prev => {
      const newMap = new Map(prev);
      const currentTags = newMap.get(currentPeak.id) || [];
      if (!currentTags.includes(friend.id)) {
        newMap.set(currentPeak.id, [...currentTags, friend.id]);
      }
      return newMap;
    });

    try {
      await awsAPI.tagFriendOnPeak(currentPeak.id, friend.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (__DEV__) console.log(`[Peak] Tagged ${friend.name} on peak ${currentPeak.id}`);
    } catch (error) {
      if (__DEV__) console.warn('[Peak] Failed to tag friend:', error);
      // Detect expired peak (404)
      if (error instanceof APIError && error.statusCode === 404) {
        showWarning('Peak Expired', 'This peak has expired and is no longer available.');
        navigation.goBack();
        return;
      }
      // Rollback on error
      setPeakTags(prev => {
        const newMap = new Map(prev);
        const currentTags = newMap.get(currentPeak.id) || [];
        newMap.set(currentPeak.id, currentTags.filter(id => id !== friend.id));
        return newMap;
      });
      showError('Error', 'Failed to tag friend. Please try again.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPeak.id]);

  // Handle reactions - removed duplicate, using existing handleLongPress below

  const handleReaction = useCallback(async (reactionType: ReactionType) => {
    const previousReaction = peakReactions.get(currentPeak.id);
    const isRemovingReaction = previousReaction === reactionType;

    // Optimistic update
    setPeakReactions(prev => {
      const newMap = new Map(prev);
      if (isRemovingReaction) {
        newMap.delete(currentPeak.id);
      } else {
        newMap.set(currentPeak.id, reactionType);
      }
      return newMap;
    });
    setShowReactions(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (isRemovingReaction) {
        await awsAPI.removeReactionFromPeak(currentPeak.id);
      } else {
        await awsAPI.reactToPeak(currentPeak.id, reactionType);
      }
      if (__DEV__) console.log(`[Peak] ${isRemovingReaction ? 'Removed' : 'Added'} reaction ${reactionType} on peak ${currentPeak.id}`);
    } catch (error) {
      if (__DEV__) console.warn('[Peak] Failed to update reaction:', error);
      // Detect expired peak (404)
      if (error instanceof APIError && error.statusCode === 404) {
        showWarning('Peak Expired', 'This peak has expired and is no longer available.');
        navigation.goBack();
        return;
      }
      // Rollback on error
      setPeakReactions(prev => {
        const newMap = new Map(prev);
        if (previousReaction) {
          newMap.set(currentPeak.id, previousReaction);
        } else {
          newMap.delete(currentPeak.id);
        }
        return newMap;
      });
    }
  }, [currentPeak.id, peakReactions]);

  const formatCount = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleTap = (evt: GestureResponderEvent): void => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    const { locationX } = evt.nativeEvent;

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      handleDoubleTap();
    } else {
      setTimeout(() => {
        if (Date.now() - lastTap.current >= DOUBLE_TAP_DELAY) {
          if (locationX < width * 0.3) {
            handlePreviousPeakSameUser();
          } else if (locationX > width * 0.7) {
            handleNextPeakSameUser();
          } else {
            handleSingleTap();
          }
        }
      }, DOUBLE_TAP_DELAY);
    }

    lastTap.current = now;
  };

  const handlePreviousPeakSameUser = (): void => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNextPeakSameUser = (): void => {
    if (currentIndex < peaks.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePeakSelect = (index: number): void => {
    setCurrentIndex(index);
  };

  const handlePeakComplete = (): void => {
    if (currentIndex < peaks.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleLongPress = (): void => {
    setIsPaused(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Show reactions bar
    setShowReactions(true);
  };

  const handlePressOut = (): void => {
    if (!showMenu) {
      setIsPaused(false);
    }
  };

  const closeMenu = useCallback((): void => {
    setShowMenu(false);
    setIsPaused(false);
  }, []);

   
  const handleMenuAction = useCallback(async (action: string): Promise<void> => {
    closeMenu();
    switch (action) {
      case 'report':
        setShowReportModal(true);
        break;
      case 'not_interested':
        // Move to next peak if available
        if (currentIndex < peaks.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else if (currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        } else {
          navigation.goBack();
        }
        // Call API to persist the hide
        try {
          await awsAPI.hidePeak(currentPeak.id, 'not_interested');
          showSuccess('Got it', "We won't show you similar content.");
        } catch (error) {
          if (__DEV__) console.warn('[Peak] Failed to hide peak:', error);
        }
        break;
      case 'copy_link': {
        const copied = await copyPeakLink(currentPeak.id);
        if (copied) {
          showSuccess('Copied!', 'Link copied to clipboard');
        }
        break;
      }
      case 'share':
        setShowMenu(false);
        setShowShareModal(true);
        break;
      case 'delete':
        showDestructiveConfirm(
          'Delete Peak',
          'This peak will be permanently deleted.',
          async () => {
            try {
              await awsAPI.deletePeak(currentPeak.id);
              useFeedStore.getState().markPeakDeleted(currentPeak.id);
              const deletedIndex = currentIndex;
              const remaining = peaks.filter((_, i) => i !== deletedIndex);
              if (remaining.length === 0) {
                navigation.goBack();
              } else {
                const nextIndex = deletedIndex >= remaining.length ? remaining.length - 1 : deletedIndex;
                setPeaks(remaining);
                setCurrentIndex(nextIndex);
              }
              showSuccess('Deleted', 'Peak deleted successfully');
            } catch (error) {
              if (__DEV__) console.warn('[Peak] Failed to delete:', error);
              showError('Error', 'Failed to delete peak');
            }
          },
          'Delete'
        );
        break;
      case 'download':
        try {
          if (!currentPeak.videoUrl) {
            showError('Unavailable', 'No video available to download');
            return;
          }
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            showError('Permission required', 'Allow access to save videos');
            return;
          }
          const fileUri = FileSystem.documentDirectory + 'peak_' + currentPeak.id + '.mov';
          await FileSystem.downloadAsync(currentPeak.videoUrl, fileUri);
          await MediaLibrary.saveToLibraryAsync(fileUri);
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
          showSuccess('Saved!', 'Video saved to your camera roll');
        } catch (error) {
          if (__DEV__) console.warn('[Peak] Failed to download:', error);
          showError('Error', 'Failed to save video');
        }
        break;
    }
  // Depend on currentPeak/currentIndex so menu handlers always reference the visible peak
  }, [currentPeak, currentIndex, peaks, closeMenu, navigation, showDestructiveConfirm, showSuccess, showError]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        return Math.abs(gestureState.dy) > 20 || Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;

        if (Math.abs(dy) > Math.abs(dx)) {
          // Swipe UP - Open replies or create reply Peak (not for business)
          if (dy < -50) {
            if (currentPeak.repliesCount && currentPeak.repliesCount > 0) {
              setIsInChain(true);
            } else if (currentUser?.accountType !== 'pro_business') {
              navigation.navigate('CreatePeak', {
                replyTo: currentPeak.id,
                originalPeak: currentPeak,
              });
            }
          }
          // Swipe DOWN - Close PeakView (go back)
          else if (dy > 80) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }
        } else {
          // Swipe LEFT/RIGHT - Jump between author groups (per PEAKS.md §4.3)
          if (!isInChain) {
            const ci = currentIndexRef.current;
            const ranges = authorGroupRangesRef.current;
            const groupIdx = ranges.findIndex(g => ci >= g.start && ci <= g.end);
            if (dx > 50 && groupIdx > 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCurrentIndex(ranges[groupIdx - 1].start);
            } else if (dx < -50 && groupIdx >= 0 && groupIdx < ranges.length - 1) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCurrentIndex(ranges[groupIdx + 1].start);
            }
          }
        }
      },
    })
  ).current;

  const handleGoBack = (): void => {
    navigation.goBack();
  };

  const handleCreatePeak = (): void => {
    if (isBusiness) return;
    navigation.navigate('CreatePeak', {
      replyTo: currentPeak.id,
      originalPeak: currentPeak,
    });
  };

  const handleAcceptChallenge = (): void => {
    if (isBusiness) return;
    navigation.navigate('CreatePeak', {
      challengeId: currentPeak.challengeId,
      challengeTitle: currentPeak.challengeTitle,
    });
  };

  const handleViewResponses = useCallback(async (): Promise<void> => {
    const cId = currentPeak.challengeId;
    if (!cId) return;
    setShowResponsesModal(true);
    setResponsesLoading(true);
    try {
      const result = await awsAPI.getChallengeResponses(cId, { limit: 30, sortBy: 'popular' });
      if (result.responses) {
        setChallengeResponses(result.responses.map((r) => ({
          ...r,
          challengeId: cId,
        })));
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch challenge responses:', error);
    } finally {
      setResponsesLoading(false);
    }
  }, [currentPeak.challengeId]);

  const handleVoteResponse = useCallback(async (responseId: string, challengeId: string): Promise<void> => {
    if (!challengeId || !responseId) return;
    // Optimistic toggle
    const wasVoted = votedResponses.has(responseId);
    setVotedResponses(prev => {
      const next = new Set(prev);
      if (wasVoted) next.delete(responseId);
      else next.add(responseId);
      return next;
    });
    setChallengeResponses(prev => prev.map(r =>
      r.id === responseId
        ? { ...r, voteCount: (r.voteCount ?? 0) + (wasVoted ? -1 : 1) }
        : r
    ));
    try {
      await awsAPI.voteChallengeResponse(challengeId, responseId);
    } catch (error) {
      // Revert on failure
      setVotedResponses(prev => {
        const next = new Set(prev);
        if (wasVoted) next.add(responseId);
        else next.delete(responseId);
        return next;
      });
      setChallengeResponses(prev => prev.map(r =>
        r.id === responseId
          ? { ...r, voteCount: (r.voteCount ?? 0) + (wasVoted ? 1 : -1) }
          : r
      ));
      if (__DEV__) console.warn('Failed to vote on response:', error);
    }
  }, [votedResponses]);

  const handleResponsePress = useCallback((peakId: string, userId: string, displayName: string, avatarUrl: string, thumbnailUrl: string, videoUrl: string) => {
    setShowResponsesModal(false);
    const toCdnLocal = (url?: string | null): string => {
      if (!url) return '';
      return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
    };
    const resolvedVideoUrl = toCdnLocal(videoUrl) || undefined;
    navigation.navigate('PeakView', {
      peaks: [{
        id: peakId,
        thumbnail: toCdnLocal(thumbnailUrl),
        videoUrl: resolvedVideoUrl,
        duration: 0,
        user: { id: userId, name: displayName, avatar: toCdnLocal(avatarUrl) },
        views: 0,
        createdAt: new Date().toISOString(),
      }],
      initialIndex: 0,
    });
  }, [navigation]);

  const handleReportPeak = useCallback(async (reason: string) => {
    if (reportingPeak) return;
    setReportingPeak(true);
    try {
      const result = await submitPeakReport(currentPeak.id, reason);
      setShowReportModal(false);
      if (result.alreadyReported) {
        showError('Already Reported', 'You have already reported this peak.');
      } else if (result.success) {
        showSuccess('Reported', 'Thank you for your report. We will review this content.');
      } else {
        showError('Error', result.message || 'Failed to submit report.');
      }
    } catch (error) {
      if (__DEV__) console.warn('[Peak] Failed to report:', error);
      showError('Error', 'Failed to submit report. Please try again.');
    } finally {
      setReportingPeak(false);
    }
  }, [currentPeak.id, reportingPeak, submitPeakReport, showError, showSuccess]);

  const isLiked = likedPeaks.has(currentPeak.id);
  const isSaved = savedPeaks.has(currentPeak.id);
  const [likeButtonDisabled, setLikeButtonDisabled] = useState(false);
  const likesCount = currentPeak.likes ?? 0;
  const existingTags = peakTags.get(currentPeak.id) || [];
  const isOwnPeak = currentPeak.isOwnPeak || (currentUser?.id != null && currentPeak.user?.id === currentUser.id);

  // Get unique users from peaks for the avatar carousel
  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    return peaks.filter(peak => {
      if (seen.has(peak.user.id)) return false;
      seen.add(peak.user.id);
      return true;
    }).map(peak => peak.user);
  }, [peaks]);

  // Compute author group ranges for story navigation (contiguous same-author peaks)
  const authorGroupRanges = useMemo(() => {
    const ranges: Array<{ userId: string; start: number; end: number }> = [];
    let i = 0;
    while (i < peaks.length) {
      const userId = peaks[i].user.id;
      const start = i;
      while (i < peaks.length && peaks[i].user.id === userId) i++;
      ranges.push({ userId, start, end: i - 1 });
    }
    return ranges;
  }, [peaks]);

  useEffect(() => { authorGroupRangesRef.current = authorGroupRanges; }, [authorGroupRanges]);

  // Find which user index is currently selected
  const currentUserIndex = uniqueUsers.findIndex(u => u.id === currentPeak.user?.id);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const placeholder = useMemo(() => require('../../../assets/images/bg.png'), []);

  // Memoized insets-dependent styles
  const topHeaderPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 8 }), [insets.top]);
  const progressSegmentsTopStyle = useMemo(() => ({ top: insets.top + 70 }), [insets.top]);
  const filterBadgeTopStyle = useMemo(() => ({ top: insets.top + 82 }), [insets.top]);
  const actionButtonsBottomStyle = useMemo(() => ({ bottom: insets.bottom + 100 }), [insets.bottom]);
  const bottomInfoPaddingStyle = useMemo(() => ({ paddingBottom: insets.bottom + 16 }), [insets.bottom]);
  const chainHeaderPaddingStyle = useMemo(() => ({ paddingTop: insets.top + 10 }), [insets.top]);

  // Extracted handlers for modal open/close
  const handleShowMenu = useCallback(() => setShowMenu(true), []);
  const handleCloseTagModal = useCallback(() => setShowTagModal(false), []);
  const handleCloseReactions = useCallback(() => {
    setShowReactions(false);
    setIsPaused(false);
  }, []);
  const handleCloseShareModal = useCallback(() => setShowShareModal(false), []);
  const handleCloseResponsesModal = useCallback(() => setShowResponsesModal(false), []);
  const handleCloseReportModal = useCallback(() => setShowReportModal(false), []);

  // Menu action handlers
  const handleShareAction = useCallback(() => handleMenuAction('share'), [handleMenuAction]);
  const handleMenuCopyLink = useCallback(() => handleMenuAction('copy_link'), [handleMenuAction]);
  const handleMenuDownload = useCallback(() => handleMenuAction('download'), [handleMenuAction]);
  const handleMenuDelete = useCallback(() => handleMenuAction('delete'), [handleMenuAction]);
  const handleMenuNotInterested = useCallback(() => handleMenuAction('not_interested'), [handleMenuAction]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleMenuReport = useCallback(() => handleMenuAction('report'), []);

  // Mute / Block handlers
  const [muteLoading, setMuteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const handleMuteUser = useCallback(() => {
    if (muteLoading) return;
    const userId = currentPeak.user?.id;
    if (!userId) return;
    if (isUserMuted(userId)) {
      setShowMenu(false);
      showError('Already Muted', 'This user is already muted.');
      return;
    }
    setShowMenu(false);
    showDestructiveConfirm(
      'Mute User',
      `Mute ${currentPeak.user?.name}? You won't see their posts anymore.`,
      async () => {
        setMuteLoading(true);
        try {
          const { error } = await mute(userId);
          if (error) {
            showError('Error', 'Could not mute this user.');
          } else {
            showSuccess('User Muted', 'You will no longer see their posts.');
          }
        } finally {
          setMuteLoading(false);
        }
      }
    );
  }, [muteLoading, currentPeak.user?.id, currentPeak.user?.name, isUserMuted, mute, showDestructiveConfirm, showSuccess, showError]);

  const handleBlockUser = useCallback(() => {
    if (blockLoading) return;
    const userId = currentPeak.user?.id;
    if (!userId) return;
    if (isBlocked(userId)) {
      setShowMenu(false);
      showError('Already Blocked', 'This user is already blocked.');
      return;
    }
    setShowMenu(false);
    showDestructiveConfirm(
      'Block User',
      `Block ${currentPeak.user?.name}? You will no longer see their posts and they won't be able to interact with you.`,
      async () => {
        setBlockLoading(true);
        try {
          const { error } = await block(userId);
          if (error) {
            showError('Error', 'Could not block this user.');
          } else {
            showSuccess('User Blocked', 'You will no longer see their posts.');
          }
        } finally {
          setBlockLoading(false);
        }
      }
    );
  }, [blockLoading, currentPeak.user?.id, currentPeak.user?.name, isBlocked, block, showDestructiveConfirm, showSuccess, showError]);

  const handleNavigateToUser = useCallback(() => {
    if (currentPeak.user?.id) {
      navigation.navigate('UserProfile', { userId: currentPeak.user.id });
    }
  }, [currentPeak.user?.id, navigation]);

  // Memoized render functions for FlatLists
  const renderChallengeResponse = useCallback(({ item }: { item: ChallengeResponseItemProps['item'] }) => (
    <ChallengeResponseItem
      item={item}
      onPress={handleResponsePress}
      onVote={handleVoteResponse}
      votedResponses={votedResponses}
      colors={colors}
      styles={styles}
    />
  ), [handleResponsePress, handleVoteResponse, votedResponses, colors, styles]);



  const onVideoStatus = useCallback((status: AVPlaybackStatus) => {
    const s = status as AVPlaybackStatusSuccess;
    if (!s.isLoaded) return;
    if (s.positionMillis && s.durationMillis) {
      const pct = Math.min(100, Math.max(0, (s.positionMillis / s.durationMillis) * 100));
      setProgress(pct);
    }
    if (s.didJustFinish) {
      // Advance to next peak if available
      setCurrentIndex(prev => {
        if (prev < peaks.length - 1) {
          return prev + 1;
        }
        setIsPaused(true);
        videoRef.current?.pauseAsync().catch((err) => {
          if (__DEV__) console.warn('[PeakView] pauseAsync failed:', err);
        });
        return prev;
      });
    }
  }, [peaks.length]);

  // Loading state when fetching peak by ID
  if (isLoadingPeak && peaks.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // No peaks available (fetch failed or empty params)
  if (peaks.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar hidden />
        <Ionicons name="videocam-off-outline" size={48} color={colors.gray} />
        <Text style={styles.emptyStateText}>Peak not available</Text>
        <TouchableOpacity onPress={handleGoBack} style={styles.goBackButton}>
          <Text style={styles.goBackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <TouchableWithoutFeedback
        onPress={handleTap}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        delayLongPress={300}
      >
        <View style={styles.mediaContainer} {...panResponder.panHandlers}>
          {(currentPeak.hlsUrl || currentPeak.videoUrl) ? (
            <Video
              ref={(r) => { videoRef.current = r; }}
              source={{ uri: getVideoPlaybackUrl(currentPeak.hlsUrl, currentPeak.videoUrl) || '' }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isMuted={false}
              onPlaybackStatusUpdate={onVideoStatus}
              posterSource={{ uri: normalizeCdnUrl(currentPeak.thumbnail) || undefined }}
              usePoster
            />
          ) : (
            <OptimizedImage
              source={currentPeak.thumbnail || placeholder}
              style={styles.media}
            />
          )}

          {/* Filter color overlay — approximates GPU shader effect on video */}
          {currentPeak.filterId && FILTER_COLOR_MAP[currentPeak.filterId] && (
            <LinearGradient
              colors={FILTER_COLOR_MAP[currentPeak.filterId].colors}
              start={FILTER_COLOR_MAP[currentPeak.filterId].start}
              end={FILTER_COLOR_MAP[currentPeak.filterId].end}
              style={[StyleSheet.absoluteFill, { opacity: currentPeak.filterIntensity ?? 1 }]}
              pointerEvents="none"
            />
          )}

          {/* Overlay widgets rendered at stored positions */}
          {currentPeak.overlays && currentPeak.overlays.length > 0 && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {currentPeak.overlays.map((overlay) => (
                <View
                  key={overlay.id}
                  style={{
                    position: 'absolute' as const,
                    left: overlay.position.x * width,
                    top: overlay.position.y * screenHeight,
                    transform: [
                      { scale: overlay.position.scale || 1 },
                      { rotate: `${overlay.position.rotation || 0}deg` },
                    ],
                  }}
                >
                  {renderOverlayWidget(overlay.type, overlay.params)}
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Back Button — always visible so user can exit */}
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={handleGoBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <View style={styles.backButtonBg}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </View>
      </TouchableOpacity>

      {/* Top Header with Avatar Carousel */}
      {carouselVisible && (
        <View style={[styles.topHeader, topHeaderPaddingStyle]}>
          {/* Spacer for back button */}
          <View style={{ width: 40 }} />

          {/* Circular Avatar Carousel */}
          <View style={styles.avatarCarousel}>
            {uniqueUsers.map((user, index) => {
              const isSelected = index === currentUserIndex;
              return (
                <TouchableOpacity
                  key={user.id}
                  style={[
                    styles.avatarItem,
                    isSelected && styles.avatarItemSelected,
                  ]}
                  onPress={() => {
                    // Find first peak of this user
                    const peakIndex = peaks.findIndex(p => p.user.id === user.id);
                    if (peakIndex !== -1) setCurrentIndex(peakIndex);
                  }}
                >
                  {isSelected ? (
                    <LinearGradient
                      colors={['#0EBF8A', '#00B5C1', '#0081BE']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarRingGradient}
                    >
                      <AvatarImage source={user.avatar} size={44} style={styles.avatarImageSelected} />
                    </LinearGradient>
                  ) : (
                    <View style={styles.avatarRingInactive}>
                      <AvatarImage source={user.avatar} size={38} style={styles.avatarImageInactive} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Add Button */}
          {!isBusiness && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleCreatePeak}
          >
            <Ionicons name="add" size={26} color={colors.white} />
          </TouchableOpacity>
          )}
        </View>
      )}

      {/* Peak Progress Segments - Below avatars */}
      {carouselVisible && (
        <View style={[styles.progressSegmentsContainer, progressSegmentsTopStyle]}>
          {peaks.filter(p => p.user.id === currentPeak.user?.id).map((_, idx) => {
            const userPeaks = peaks.filter(p => p.user.id === currentPeak.user?.id);
            const currentUserPeakIndex = userPeaks.findIndex(p => p.id === currentPeak.id);
            const isCurrentSegment = idx === currentUserPeakIndex;
            const isPastSegment = idx < currentUserPeakIndex;
            return (
              <View key={idx} style={styles.progressSegment}>
                <View style={[
                  styles.progressSegmentFill,
                  isPastSegment && styles.progressSegmentComplete,
                  isCurrentSegment && { width: `${progress}%` },
                ]} />
              </View>
            );
          })}
        </View>
      )}

      <PeakCarousel
        peaks={peaks}
        currentIndex={currentIndex}
        onPeakSelect={handlePeakSelect}
        currentPeakDuration={currentPeak.duration || 10}
        isPaused={isPaused}
        onPeakComplete={handlePeakComplete}
        visible={false}
      />

      {/* Filter badge */}
      {carouselVisible && currentPeak.filterId && (
        <View style={[styles.filterBadge, filterBadgeTopStyle]}>
          <Ionicons name="color-wand" size={12} color={colors.primary} />
          <Text style={styles.filterBadgeText}>{currentPeak.filterId.replace(/_/g, ' ')}</Text>
        </View>
      )}

      {/* Overlay indicators */}
      {carouselVisible && currentPeak.overlays && currentPeak.overlays.length > 0 && (
        <View style={[styles.overlayIndicators, { top: insets.top + (currentPeak.filterId ? 110 : 82) }]}>
          {currentPeak.overlays.map((overlay) => (
            <View key={overlay.id} style={styles.overlayIndicator}>
              <Ionicons
                name={
                  overlay.type === 'workout_timer' ? 'timer-outline' :
                  overlay.type === 'rep_counter' ? 'fitness-outline' :
                  overlay.type === 'day_challenge' ? 'calendar-outline' :
                  overlay.type === 'calorie_burn' ? 'flame-outline' :
                  overlay.type === 'heart_rate_pulse' ? 'heart-outline' :
                  'layers-outline'
                }
                size={14}
                color={colors.white}
              />
            </View>
          ))}
        </View>
      )}

      {/* Vertical Action Buttons - Right Side */}
      {carouselVisible && (
        <View style={[styles.actionButtonsContainer, actionButtonsBottomStyle]}>
          {/* Like Button */}
          <TouchableOpacity
            style={[styles.actionButton, likeButtonDisabled && { opacity: 0.5 }]}
            onPress={toggleLike}
            disabled={likeButtonDisabled}
          >
            <View style={[styles.actionIconContainer, isLiked && styles.actionIconActive]}>
              <SmuppyHeartIcon
                size={26}
                color={isLiked ? colors.heartRed : colors.white}
                filled={isLiked}
              />
            </View>
            <Text style={styles.actionCount}>{formatCount(likesCount)}</Text>
          </TouchableOpacity>

          {/* Share Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleShareAction}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="paper-plane-outline" size={24} color={colors.white} />
            </View>
          </TouchableOpacity>

          {/* Tag Friend Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenTagModal}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="person-add-outline" size={22} color={colors.white} />
            </View>
            {((currentPeak.tagsCount || 0) + existingTags.length) > 0 && (
              <Text style={styles.actionCount}>
                {(currentPeak.tagsCount || 0) + existingTags.length}
              </Text>
            )}
          </TouchableOpacity>

          {/* Save Button */}
          <TouchableOpacity style={styles.actionButton} onPress={toggleSave}>
            <View style={styles.actionIconContainer}>
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={24}
                color={isSaved ? colors.primary : colors.white}
              />
            </View>
          </TouchableOpacity>

          {/* More Options */}
          <TouchableOpacity style={styles.actionButton} onPress={handleShowMenu}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Info - User Info & Progress Bar */}
      {carouselVisible && (
        <View style={[styles.bottomInfo, bottomInfoPaddingStyle]}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={handleNavigateToUser}
          >
            <View style={styles.userTextInfo}>
              <Text style={styles.userName}>{currentPeak.user?.name}</Text>
              <Text style={styles.viewsText}>
                {formatCount(currentPeak.views || 0)} views
              </Text>
            </View>
          </TouchableOpacity>

          {currentPeak.textOverlay && (
            <Text style={styles.captionText}>{currentPeak.textOverlay}</Text>
          )}

          {/* Challenge Info */}
          {currentPeak.isChallenge && (
            <View style={styles.challengeBanner}>
              <View style={styles.challengeBannerHeader}>
                <Ionicons name="trophy" size={16} color="#FFD700" />
                <Text style={styles.challengeBannerTitle}>
                  {currentPeak.challengeTitle || 'Challenge'}
                </Text>
              </View>
              {currentPeak.challengeRules ? (
                <Text style={styles.challengeBannerRules} numberOfLines={2}>
                  {currentPeak.challengeRules}
                </Text>
              ) : null}
              <View style={styles.challengeMetaRow}>
                {currentPeak.challengeResponseCount != null && (
                  <TouchableOpacity onPress={handleViewResponses} activeOpacity={0.7}>
                    <Text style={[styles.challengeMetaText, styles.challengeMetaLink]}>
                      {currentPeak.challengeResponseCount} responses
                    </Text>
                  </TouchableOpacity>
                )}
                {currentPeak.challengeEndsAt ? (
                  <Text style={styles.challengeMetaText}>
                    {new Date(currentPeak.challengeEndsAt) > new Date()
                      ? `Ends ${new Date(currentPeak.challengeEndsAt).toLocaleDateString()}`
                      : 'Ended'}
                  </Text>
                ) : null}
              </View>
              {!isBusiness && (!currentPeak.challengeEndsAt || new Date(currentPeak.challengeEndsAt) > new Date()) && (
                <TouchableOpacity
                  style={styles.acceptChallengeButton}
                  onPress={handleAcceptChallenge}
                >
                  <Ionicons name="flame" size={16} color={colors.dark} />
                  <Text style={styles.acceptChallengeText}>Accept Challenge</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

      {/* Progress Bar at Bottom + Reply CTA */}
      <View style={styles.bottomBar}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
        {!isBusiness && (
        <TouchableOpacity style={styles.replyButton} onPress={handleCreatePeak}>
          <Ionicons name="return-down-forward" size={18} color={colors.white} />
          <Text style={styles.replyButtonText}>Reply with your Peak</Text>
        </TouchableOpacity>
        )}
      </View>
        </View>
      )}

      {/* Heart Animation with Particles */}
      {showHeart && (
        <View style={styles.heartAnimationContainer}>
          <Animated.View
            style={[
              styles.heartContainer,
              {
                transform: [{ scale: heartScale }],
                opacity: heartScale,
              }
            ]}
          >
            <SmuppyHeartIcon size={100} color={colors.heartRed} filled />
          </Animated.View>

          {/* Particles */}
          {heartParticles.map((particle, index) => (
            <Animated.View
              key={index}
              style={[
                styles.heartParticle,
                {
                  transform: [
                    { scale: particle.scale },
                    { translateX: particle.translateX },
                    { translateY: particle.translateY },
                  ],
                  opacity: particle.opacity,
                }
              ]}
            >
              <SmuppyHeartIcon size={24} color={colors.heartRed} filled />
            </Animated.View>
          ))}
        </View>
      )}

      {isInChain && (
        <View style={styles.chainOverlay}>
          <View style={[styles.chainHeader, chainHeaderPaddingStyle]}>
            <Text style={styles.chainTitle}>Replies</Text>
            <Text style={styles.chainHint}>Double tap to go back</Text>
          </View>
        </View>
      )}

      {showOnboarding && (
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingContent}>
            <Text style={styles.onboardingText}>
              Swipe UP to see replies{'\n'}or accept the challenge! 🔥
            </Text>
          </View>
        </View>
      )}

      {isPaused && !showMenu && (
        <View style={styles.pauseInfo}>
          <Text style={styles.pauseUserName}>{currentPeak.user?.name}</Text>
          <Text style={styles.pauseDate}>
            {createdDate}
          </Text>
        </View>
      )}

      {/* Long Press Menu Modal */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHandle} />
            </View>

            {/* Common actions */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShareAction}
            >
              <Ionicons name="paper-plane-outline" size={24} color={isDark ? colors.white : colors.dark} />
              <Text style={styles.menuItemText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleMenuCopyLink}
            >
              <Ionicons name="link-outline" size={24} color={isDark ? colors.white : colors.dark} />
              <Text style={styles.menuItemText}>Copy link</Text>
            </TouchableOpacity>

            {isOwnPeak ? (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleMenuDownload}
                >
                  <Ionicons name="download-outline" size={24} color={isDark ? colors.white : colors.dark} />
                  <Text style={styles.menuItemText}>Save to phone</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={handleMenuDelete}
                >
                  <Ionicons name="trash-outline" size={24} color="#FF453A" />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleMenuNotInterested}
                >
                  <Ionicons name="eye-off-outline" size={24} color={isDark ? colors.white : colors.dark} />
                  <Text style={styles.menuItemText}>Not interested</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleMuteUser}
                  disabled={muteLoading}
                >
                  <Ionicons name="volume-mute-outline" size={24} color={isDark ? colors.white : colors.dark} />
                  <Text style={styles.menuItemText}>Mute user</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={handleBlockUser}
                  disabled={blockLoading}
                >
                  <Ionicons name="ban-outline" size={24} color={isDark ? colors.white : colors.dark} />
                  <Text style={styles.menuItemText}>Block user</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuItem, styles.menuItemDanger]}
                  onPress={handleMenuReport}
                >
                  <Ionicons name="flag-outline" size={24} color="#FF453A" />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.menuCancelButton}
              onPress={closeMenu}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Tag Friend Modal */}
      <TagFriendModal
        visible={showTagModal}
        onClose={handleCloseTagModal}
        onTagFriend={handleTagFriend}
        peakId={currentPeak.id}
        existingTags={existingTags}
      />

      {/* In-App Share Modal */}
      <SharePostModal
        visible={showShareModal}
        content={{
          id: currentPeak.id,
          type: 'peak',
          title: currentPeak.user?.name || '',
          subtitle: currentPeak.textOverlay || undefined,
          image: currentPeak.thumbnail || currentPeak.videoUrl || null,
          avatar: currentPeak.user?.avatar || null,
        }}
        onClose={handleCloseShareModal}
      />

      {/* Smuppy Reactions Bar */}
      <PeakReactions
        visible={showReactions}
        onReact={handleReaction}
        onClose={handleCloseReactions}
        currentReaction={peakReactions.get(currentPeak.id) || null}
      />

      {/* Challenge Responses Modal */}
      <Modal
        visible={showResponsesModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseResponsesModal}
      >
        <Pressable style={styles.responsesOverlay} onPress={handleCloseResponsesModal}>
          <Pressable style={styles.responsesContainer} onPress={NOOP}>
            <View style={styles.responsesHeader}>
              <View style={styles.menuHandle} />
              <View style={styles.responsesTitleRow}>
                <Ionicons name="trophy" size={18} color="#FFD700" />
                <Text style={styles.responsesTitle}>Challenge Responses</Text>
              </View>
            </View>
            {responsesLoading ? (
              <View style={styles.responsesLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : challengeResponses.length === 0 ? (
              <View style={styles.responsesEmpty}>
                <Ionicons name="videocam-outline" size={40} color={colors.gray} />
                <Text style={styles.responsesEmptyText}>No responses yet</Text>
                <Text style={styles.responsesEmptySubtext}>Be the first to accept this challenge!</Text>
              </View>
            ) : (
              <FlatList
                data={challengeResponses}
                keyExtractor={(item) => item.id}
                style={styles.responsesList}
                renderItem={renderChallengeResponse}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report Reason Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseReportModal}
      >
        <Pressable style={styles.responsesOverlay} onPress={handleCloseReportModal}>
          <Pressable style={styles.responsesContainer} onPress={NOOP}>
            <View style={styles.responsesHeader}>
              <View style={styles.menuHandle} />
              <View style={styles.responsesTitleRow}>
                <Ionicons name="flag" size={18} color="#FF453A" />
                <Text style={styles.responsesTitle}>Report Peak</Text>
              </View>
              <Text style={styles.reportSubtitle}>Why are you reporting this content?</Text>
            </View>
            {reportingPeak ? (
              <View style={styles.responsesLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.responsesEmptySubtext, styles.reportSubmittingMargin]}>Submitting report...</Text>
              </View>
            ) : (
              <View style={styles.reportReasonList}>
                {[
                  { key: 'inappropriate', label: 'Inappropriate content', icon: 'alert-circle-outline' as const },
                  { key: 'spam', label: 'Spam or misleading', icon: 'megaphone-outline' as const },
                  { key: 'harassment', label: 'Harassment or bullying', icon: 'hand-left-outline' as const },
                  { key: 'violence', label: 'Violence or dangerous acts', icon: 'warning-outline' as const },
                  { key: 'misinformation', label: 'Misinformation', icon: 'information-circle-outline' as const },
                  { key: 'copyright', label: 'Copyright infringement', icon: 'copy-outline' as const },
                  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' as const },
                ].map((reason) => (
                  <TouchableOpacity
                    key={reason.key}
                    style={styles.reportReasonItem}
                    onPress={() => handleReportPeak(reason.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={reason.icon} size={22} color={isDark ? colors.white : colors.dark} />
                    <Text style={styles.reportReasonText}>{reason.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.gray} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.menuCancelButton}
              onPress={handleCloseReportModal}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.gray,
    marginTop: 12,
    fontSize: 16,
  },
  goBackButton: {
    marginTop: 16,
  },
  goBackText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  mediaContainer: {
    flex: 1,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  // Top Header with Avatar Carousel
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 100,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 200,
  },
  backButtonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Avatar Carousel
  avatarCarousel: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  avatarItem: {
    alignItems: 'center',
  },
  avatarItemSelected: {
    transform: [{ scale: 1.1 }],
  },
  avatarRingGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImageSelected: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.dark,
  },
  avatarRingInactive: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImageInactive: {
    width: 38,
    height: 38,
    borderRadius: 19,
    opacity: 0.5,
  },
  // Progress Segments (multiple peaks per user)
  progressSegmentsContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 4,
    zIndex: 200,
  },
  progressSegment: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressSegmentFill: {
    height: '100%',
    backgroundColor: colors.white,
    borderRadius: 1,
  },
  progressSegmentComplete: {
    width: '100%',
  },
  // Progress Bar Background (reusable)
  progressBarBackground: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  // Vertical Action Buttons - Right Side (No circles, just icons)
  actionButtonsContainer: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 24,
  },
  actionIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  actionIconActive: {
    // No background, just icon color change
  },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Bottom Info
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 70,
    paddingHorizontal: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  userTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewsText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  captionText: {
    fontSize: 14,
    color: colors.white,
    marginBottom: 12,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  challengeBanner: {
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.25)',
  },
  challengeBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  challengeBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
  },
  challengeBannerRules: {
    fontSize: 13,
    color: colors.white,
    opacity: 0.8,
    marginBottom: 8,
    lineHeight: 18,
  },
  acceptChallengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: 'column',
    gap: 12,
  },
  replyButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
  },
  replyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  filterBadge: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    zIndex: 90,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'capitalize',
  },
  overlayIndicators: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    gap: 6,
    zIndex: 90,
  },
  overlayIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  challengeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  challengeMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  acceptChallengeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.dark,
  },
  // Heart Animation
  heartAnimationContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -50,
    marginLeft: -50,
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartParticle: {
    position: 'absolute',
  },
  // Chain Overlay
  chainOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  chainHeader: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  chainTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  chainHint: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 4,
  },
  // Onboarding
  onboardingOverlay: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    right: 20,
  },
  onboardingContent: {
    backgroundColor: 'rgba(17, 227, 163, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
  },
  onboardingText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Pause Info
  pauseInfo: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 16,
    marginTop: -50,
  },
  pauseUserName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 4,
  },
  pauseDate: {
    fontSize: 14,
    color: colors.gray,
  },
  // Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: isDark ? '#1C1C1E' : colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHeader: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: isDark ? '#3A3A3C' : colors.gray300,
    borderRadius: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 16,
  },
  menuItemText: {
    fontSize: 17,
    color: isDark ? colors.white : colors.dark,
    fontWeight: '500',
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: isDark ? '#2C2C2E' : colors.grayBorder,
    marginTop: 8,
    paddingTop: 24,
  },
  menuItemTextDanger: {
    color: '#FF453A',
  },
  menuCancelButton: {
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: isDark ? '#2C2C2E' : colors.gray100,
    borderRadius: 14,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: isDark ? colors.white : colors.dark,
  },
  // Challenge Responses Modal
  responsesOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  responsesContainer: {
    backgroundColor: isDark ? '#1C1C1E' : colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  responsesHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2C2C2E' : colors.grayBorder,
  },
  responsesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  responsesTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  responsesLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  responsesEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  responsesEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: isDark ? colors.white : colors.dark,
  },
  responsesEmptySubtext: {
    fontSize: 14,
    color: colors.gray,
  },
  responsesList: {
    maxHeight: 400,
  },
  responseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2C2C2E' : colors.grayBorder,
  },
  responseThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: isDark ? '#2C2C2E' : colors.gray100,
  },
  responseInfo: {
    flex: 1,
    gap: 4,
  },
  responseUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responseAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  responseUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: isDark ? colors.white : colors.dark,
    flex: 1,
  },
  responseDate: {
    fontSize: 12,
    color: colors.gray,
  },
  responseActions: {
    alignItems: 'center',
    gap: 8,
  },
  voteButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
    marginTop: 2,
  },
  challengeMetaLink: {
    textDecorationLine: 'underline',
  },
  reportSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 8,
  },
  reportReasonList: {
    paddingVertical: 8,
  },
  reportReasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  reportReasonText: {
    flex: 1,
    fontSize: 16,
    color: isDark ? colors.white : colors.dark,
    fontWeight: '500',
  },
  reportSubmittingMargin: {
    marginTop: 12,
  },
});

export default PeakViewScreen;
