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
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode, AVPlaybackStatus, AVPlaybackStatusSuccess } from 'expo-av';
import * as Haptics from 'expo-haptics';
import OptimizedImage from '../../components/OptimizedImage';
import PeakCarousel from '../../components/peaks/PeakCarousel';
import TagFriendModal from '../../components/TagFriendModal';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import PeakReactions, { ReactionType } from '../../components/PeakReactions';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { copyPeakLink, sharePeak } from '../../utils/share';
import { reportPost, savePost, unsavePost } from '../../services/database';
import { useContentStore, useUserStore, useFeedStore } from '../../stores';
import { awsAPI } from '../../services/aws-api';

const { width } = Dimensions.get('window');

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
  duration: number;
  user: PeakUser;
  views: number;
  likes?: number;
  repliesCount?: number;
  tagsCount?: number;
  tags?: PeakTag[];
  textOverlay?: string;
  createdAt: string; // ISO string for React Navigation serialization
  isLiked?: boolean;
  isSaved?: boolean;
  isOwnPeak?: boolean; // To show tag count only to creator
  // Challenge fields
  isChallenge?: boolean;
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

const PeakViewScreen = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PeakView'>>();

  const { peaks: peaksParam = [], peakData = [], initialIndex = 0 } = route.params || {};
  const peaks = (peaksParam && peaksParam.length > 0 ? peaksParam : peakData) as Peak[];
  const currentUser = useUserStore((state) => state.user);
  const isBusiness = currentUser?.accountType === 'pro_business';

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
  const [_videoDuration, setVideoDuration] = useState(0);
  const [showTagModal, setShowTagModal] = useState(false);
  const [peakTags, setPeakTags] = useState<Map<string, string[]>>(new Map()); // peakId -> taggedUserIds
  const [showReactions, setShowReactions] = useState(false);
  const [peakReactions, setPeakReactions] = useState<Map<string, ReactionType>>(new Map()); // peakId -> reaction
  const [_hiddenPeaks, setHiddenPeaks] = useState<Set<string>>(new Set()); // Not interested peaks

  // Content store for reporting
  const { submitPostReport } = useContentStore();

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartParticles = useRef([...Array(6)].map(() => ({
    scale: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }))).current;
  const lastTap = useRef(0);
  const _progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPeak = useMemo(() => peaks[currentIndex] || ({} as Peak), [peaks, currentIndex]);
  const createdDate = useMemo(() => {
    const value = currentPeak?.createdAt || new Date().toISOString();
    const d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  }, [currentPeak]);

  useEffect(() => {
    if (!currentPeak.videoUrl) {
      videoRef.current = null;
      setVideoDuration(0);
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

  // Reset progress and play when peak changes
  useEffect(() => {
    setProgress(0);
    setVideoDuration(0);
    if (videoRef.current) {
      videoRef.current.setPositionAsync(0).then(() => {
        videoRef.current?.playAsync().catch(() => {});
      }).catch(() => {});
    }

    // Count a view locally (once per peak in this session)
    if (currentPeak.id && !viewedPeaks.has(currentPeak.id)) {
      setViewedPeaks(prev => new Set(prev).add(currentPeak.id));
      peaks[currentIndex] = { ...currentPeak, views: (currentPeak.views || 0) + 1 };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Reset progress when changing peak
  useEffect(() => {
    setProgress(0);
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

  const toggleLike = useCallback(async (): Promise<void> => {
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
      if (isCurrentlyLiked) {
        await awsAPI.unlikePeak(currentPeak.id);
        useFeedStore.getState().setPeakLikeOverride(currentPeak.id, false);
        // Sync current peak likes
        const updatedLikes = Math.max((currentPeak.likes || 1) - 1, 0);
        peaks[currentIndex] = { ...currentPeak, likes: updatedLikes, isLiked: false };
      } else {
        await awsAPI.likePeak(currentPeak.id);
        useFeedStore.getState().setPeakLikeOverride(currentPeak.id, true);
        const updatedLikes = (currentPeak.likes || 0) + 1;
        peaks[currentIndex] = { ...currentPeak, likes: updatedLikes, isLiked: true };
      }
    } catch (error) {
      if (__DEV__) console.warn('[Peak] Failed to toggle like:', error);
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

  const closeMenu = (): void => {
    setShowMenu(false);
    setIsPaused(false);
  };

  const handleMenuAction = async (action: string): Promise<void> => {
    closeMenu();
    switch (action) {
      case 'report':
        showDestructiveConfirm(
          'Report Peak',
          'Are you sure you want to report this Peak?',
          async () => {
            try {
              await submitPostReport(currentPeak.id, 'inappropriate', 'Reported from Peak view');
              await reportPost(currentPeak.id, 'inappropriate', 'Reported from Peak view');
              showSuccess('Reported', 'Thank you for your report. We will review this content.');
            } catch (error) {
              if (__DEV__) console.warn('[Peak] Failed to report:', error);
              showError('Error', 'Failed to submit report. Please try again.');
            }
          },
          'Report'
        );
        break;
      case 'not_interested':
        // Hide peak from feed - optimistic update
        setHiddenPeaks(prev => new Set(prev).add(currentPeak.id));
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
          // Rollback on error
          setHiddenPeaks(prev => {
            const newSet = new Set(prev);
            newSet.delete(currentPeak.id);
            return newSet;
          });
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
        await sharePeak(
          currentPeak.id,
          currentPeak.user.name,
          currentPeak.user.name.toLowerCase().replace(/\s/g, '')
        );
        break;
    }
  };

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
            } else if (!isBusiness) {
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
          // Swipe LEFT/RIGHT - Navigate between Peaks
          if (!isInChain) {
            if (dx > 50 && currentIndex > 0) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCurrentIndex(currentIndex - 1);
            } else if (dx < -50 && currentIndex < peaks.length - 1) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCurrentIndex(currentIndex + 1);
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
      challengeId: currentPeak.id,
      challengeTitle: currentPeak.challengeTitle,
    });
  };

  const isLiked = likedPeaks.has(currentPeak.id);
  const isSaved = savedPeaks.has(currentPeak.id);
  const likesCount = currentPeak.likes ?? 0;
  const repliesCount = currentPeak.repliesCount || 0;
  const existingTags = peakTags.get(currentPeak.id) || [];
  const _tagsCount = (currentPeak.tagsCount || 0) + existingTags.length;
  const _isOwnPeak = currentPeak.isOwnPeak || false;

  // Get unique users from peaks for the avatar carousel
  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    return peaks.filter(peak => {
      if (seen.has(peak.user.id)) return false;
      seen.add(peak.user.id);
      return true;
    }).map(peak => peak.user);
  }, [peaks]);

  // Find which user index is currently selected
  const currentUserIndex = uniqueUsers.findIndex(u => u.id === currentPeak.user?.id);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const placeholder = useMemo(() => require('../../../assets/images/bg.png'), []);

  const onVideoStatus = (status: AVPlaybackStatus) => {
    const s = status as AVPlaybackStatusSuccess;
    if (!s.isLoaded) return;
    if (s.durationMillis) setVideoDuration(s.durationMillis);
    if (s.positionMillis && s.durationMillis) {
      const pct = Math.min(100, Math.max(0, (s.positionMillis / s.durationMillis) * 100));
      setProgress(pct);
    }
    if (s.didJustFinish) {
      // Advance to next peak if available
      if (currentIndex < peaks.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setIsPaused(true);
        videoRef.current?.pauseAsync().catch(() => {});
      }
    }
  };

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
          {currentPeak.videoUrl ? (
            <Video
              ref={(r) => { videoRef.current = r; }}
              source={{ uri: currentPeak.videoUrl }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted={false}
              onPlaybackStatusUpdate={onVideoStatus}
              posterSource={{ uri: currentPeak.thumbnail || undefined }}
              usePoster
            />
          ) : (
            <OptimizedImage
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              source={currentPeak.thumbnail || (placeholder as any)}
              style={styles.media}
            />
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Top Header with Avatar Carousel */}
      {carouselVisible && (
        <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
          >
            <Ionicons name="chevron-back" size={26} color={colors.white} />
          </TouchableOpacity>

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

          {/* Add Button - hidden for business */}
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
        <View style={[styles.progressSegmentsContainer, { top: insets.top + 70 }]}>
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
        <View style={[styles.filterBadge, { top: insets.top + 82 }]}>
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
        <View style={[styles.actionButtonsContainer, { bottom: insets.bottom + 100 }]}>
          {/* Like Button */}
          <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
            <View style={[styles.actionIconContainer, isLiked && styles.actionIconActive]}>
              <SmuppyHeartIcon
                size={26}
                color={isLiked ? colors.heartRed : colors.white}
                filled={isLiked}
              />
            </View>
            <Text style={styles.actionCount}>{formatCount(likesCount)}</Text>
          </TouchableOpacity>

          {/* Comments/Reply Button - hidden for business */}
          {!isBusiness && (
            <TouchableOpacity style={styles.actionButton} onPress={handleCreatePeak}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="chatbubble-outline" size={24} color={colors.white} />
              </View>
              <Text style={styles.actionCount}>{formatCount(repliesCount)}</Text>
            </TouchableOpacity>
          )}

          {/* Share Button */}
          <TouchableOpacity style={styles.actionButton} onPress={() => handleMenuAction('share')}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="paper-plane-outline" size={24} color={colors.white} />
            </View>
          </TouchableOpacity>

          {/* Tag Friend Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenTagModal}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="person-add-outline" size={22} color={colors.white} />
            </View>
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
          <TouchableOpacity style={styles.actionButton} onPress={() => setShowMenu(true)}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.white} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Info - User Info & Progress Bar */}
      {carouselVisible && (
        <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: currentPeak.user?.id })}
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
                  <Text style={styles.challengeMetaText}>
                    {currentPeak.challengeResponseCount} responses
                  </Text>
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
          <View style={[styles.chainHeader, { paddingTop: insets.top + 10 }]}>
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

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleMenuAction('not_interested')}
            >
              <Ionicons name="eye-off-outline" size={24} color={isDark ? colors.white : colors.dark} />
              <Text style={styles.menuItemText}>Not interested</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => handleMenuAction('report')}
            >
              <Ionicons name="flag-outline" size={24} color="#FF453A" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
            </TouchableOpacity>

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
        onClose={() => setShowTagModal(false)}
        onTagFriend={handleTagFriend}
        peakId={currentPeak.id}
        existingTags={existingTags}
      />

      {/* Smuppy Reactions Bar */}
      <PeakReactions
        visible={showReactions}
        onReact={handleReaction}
        onClose={() => {
          setShowReactions(false);
          setIsPaused(false);
        }}
        currentReaction={peakReactions.get(currentPeak.id) || null}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
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
    width: 40,
    height: 40,
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
  bottomProgressBar: {
    marginTop: 12,
    marginBottom: 8,
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
});

export default PeakViewScreen;
