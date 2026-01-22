import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StatusBar,
  Image,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import PeakCarousel from '../../components/peaks/PeakCarousel';
import TagFriendModal from '../../components/TagFriendModal';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import PeakReactions, { ReactionType } from '../../components/PeakReactions';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { copyPeakLink, sharePeak } from '../../utils/share';

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
  taggedAt: Date;
}

interface Peak {
  id: string;
  thumbnail: string;
  duration: number;
  user: PeakUser;
  views: number;
  likes?: number;
  repliesCount?: number;
  tagsCount?: number;
  tags?: PeakTag[];
  textOverlay?: string;
  createdAt: Date;
  isLiked?: boolean;
  isSaved?: boolean;
  isOwnPeak?: boolean; // To show tag count only to creator
}

type RootStackParamList = {
  PeakView: { peaks: Peak[]; initialIndex: number };
  CreatePeak: { replyTo: string; originalPeak: Peak };
  UserProfile: { userId: string };
  [key: string]: object | undefined;
};

const PeakViewScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PeakView'>>();

  const { peaks = [], initialIndex = 0 } = route.params || {};

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [carouselVisible, setCarouselVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [isInChain, setIsInChain] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [likedPeaks, setLikedPeaks] = useState<Set<string>>(new Set());
  const [savedPeaks, setSavedPeaks] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [showTagModal, setShowTagModal] = useState(false);
  const [peakTags, setPeakTags] = useState<Map<string, string[]>>(new Map()); // peakId -> taggedUserIds
  const [showReactions, setShowReactions] = useState(false);
  const [peakReactions, setPeakReactions] = useState<Map<string, ReactionType>>(new Map()); // peakId -> reaction

  const heartScale = useRef(new Animated.Value(0)).current;
  const heartParticles = useRef([...Array(6)].map(() => ({
    scale: new Animated.Value(0),
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(0),
  }))).current;
  const lastTap = useRef(0);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  const currentPeak = peaks[currentIndex] || {} as Peak;

  useEffect(() => {
    if (showOnboarding) {
      const timer = setTimeout(() => {
        setShowOnboarding(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding]);

  // Progress bar effect
  useEffect(() => {
    if (!isPaused && !showMenu && currentPeak.duration) {
      setProgress(0);
      const duration = currentPeak.duration * 1000;
      const interval = 50;
      const step = (interval / duration) * 100;

      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval.current!);
            return 100;
          }
          return prev + step;
        });
      }, interval);

      return () => {
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
        }
      };
    }
  }, [currentIndex, isPaused, showMenu, currentPeak.duration]);

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
    setCarouselVisible(!carouselVisible);
  };

  const handleDoubleTap = (): void => {
    if (isInChain) {
      setIsInChain(false);
    } else {
      // Like the peak
      if (!likedPeaks.has(currentPeak.id)) {
        setLikedPeaks(prev => new Set(prev).add(currentPeak.id));
      }
      animateHeart();
      setCarouselVisible(true);
    }
  };

  const toggleLike = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  }, [currentPeak.id]);

  const toggleSave = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavedPeaks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentPeak.id)) {
        newSet.delete(currentPeak.id);
      } else {
        newSet.add(currentPeak.id);
      }
      return newSet;
    });
  }, [currentPeak.id]);

  const handleOpenTagModal = useCallback((): void => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowTagModal(true);
  }, []);

  const handleTagFriend = useCallback((friend: { id: string; name: string }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPeakTags(prev => {
      const newMap = new Map(prev);
      const currentTags = newMap.get(currentPeak.id) || [];
      if (!currentTags.includes(friend.id)) {
        newMap.set(currentPeak.id, [...currentTags, friend.id]);
      }
      return newMap;
    });
    // TODO: Send tag notification to the friend via API
  }, [currentPeak.id]);

  // Handle reactions - removed duplicate, using existing handleLongPress below

  const handleReaction = useCallback((reactionType: ReactionType) => {
    setPeakReactions(prev => {
      const newMap = new Map(prev);
      const currentReaction = newMap.get(currentPeak.id);

      // Toggle off if same reaction
      if (currentReaction === reactionType) {
        newMap.delete(currentPeak.id);
      } else {
        newMap.set(currentPeak.id, reactionType);
      }
      return newMap;
    });
    setShowReactions(false);
    // TODO: Send reaction to API
  }, [currentPeak.id]);

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
        Alert.alert(
          'Report Peak',
          'Are you sure you want to report this Peak?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Report',
              style: 'destructive',
              onPress: () => {
                // TODO: Implement report API call
                Alert.alert('Reported', 'Thank you for your report. We will review this content.');
              },
            },
          ]
        );
        break;
      case 'not_interested':
        // TODO: Implement not interested - hide from feed
        Alert.alert('Got it', "We won't show you similar content.");
        break;
      case 'copy_link':
        const copied = await copyPeakLink(currentPeak.id);
        if (copied) {
          Alert.alert('Copied!', 'Link copied to clipboard');
        }
        break;
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
          // Swipe UP - Open replies or create reply Peak
          if (dy < -50) {
            if (currentPeak.repliesCount && currentPeak.repliesCount > 0) {
              setIsInChain(true);
            } else {
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
    navigation.navigate('CreatePeak', {
      replyTo: currentPeak.id,
      originalPeak: currentPeak,
    });
  };

  const isLiked = likedPeaks.has(currentPeak.id);
  const isSaved = savedPeaks.has(currentPeak.id);
  const likesCount = (currentPeak.likes || 0) + (isLiked ? 1 : 0);
  const repliesCount = currentPeak.repliesCount || 0;
  const existingTags = peakTags.get(currentPeak.id) || [];
  const tagsCount = (currentPeak.tagsCount || 0) + existingTags.length;
  const isOwnPeak = currentPeak.isOwnPeak || false;

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
          <Image
            source={{ uri: currentPeak.thumbnail }}
            style={styles.media}
            resizeMode="cover"
          />
        </View>
      </TouchableWithoutFeedback>

      {/* Progress Bar - Always visible at top */}
      <View style={[styles.progressBarContainer, { top: insets.top + 8 }]}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <PeakCarousel
        peaks={peaks}
        currentIndex={currentIndex}
        onPeakSelect={handlePeakSelect}
        currentPeakDuration={currentPeak.duration || 10}
        isPaused={isPaused}
        onPeakComplete={handlePeakComplete}
        visible={carouselVisible && !isInChain}
      />

      {/* Header */}
      {carouselVisible && (
        <View style={[styles.header, { top: insets.top + 20 }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleGoBack}
          >
            <Ionicons name="chevron-back" size={28} color={COLORS.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleCreatePeak}
          >
            <Ionicons name="add" size={28} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Vertical Action Buttons - Right Side (TikTok Style) */}
      {carouselVisible && (
        <View style={[styles.actionButtonsContainer, { bottom: insets.bottom + 140 }]}>
          {/* Like Button */}
          <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
            <View style={[styles.actionIconContainer, isLiked && styles.actionIconActive]}>
              <SmuppyHeartIcon
                size={32}
                color={isLiked ? COLORS.primary : COLORS.white}
                filled={isLiked}
              />
            </View>
            <Text style={styles.actionCount}>{formatCount(likesCount)}</Text>
          </TouchableOpacity>

          {/* Reply Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleCreatePeak}>
            <View style={styles.actionIconContainer}>
              <Ionicons name="chatbubble-outline" size={28} color={COLORS.white} />
            </View>
            <Text style={styles.actionCount}>{formatCount(repliesCount)}</Text>
          </TouchableOpacity>

          {/* Tag Button */}
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenTagModal}>
            <View style={[styles.actionIconContainer, styles.tagIconContainer]}>
              <Ionicons name="pricetag-outline" size={26} color={COLORS.white} />
            </View>
            {/* Only show tag count to creator */}
            {isOwnPeak && tagsCount > 0 && (
              <Text style={styles.actionCount}>{formatCount(tagsCount)}</Text>
            )}
          </TouchableOpacity>

          {/* Save Button */}
          <TouchableOpacity style={styles.actionButton} onPress={toggleSave}>
            <View style={styles.actionIconContainer}>
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={28}
                color={isSaved ? COLORS.primary : COLORS.white}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Info - User Info & Text */}
      {carouselVisible && (
        <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: currentPeak.user?.id })}
          >
            <LinearGradient
              colors={['#0EBF8A', '#00B5C1', '#0081BE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarGradient}
            >
              <Image
                source={{ uri: currentPeak.user?.avatar }}
                style={styles.avatar}
              />
            </LinearGradient>
            <View style={styles.userTextInfo}>
              <Text style={styles.userName}>{currentPeak.user?.name}</Text>
              <Text style={styles.viewsText}>
                <Ionicons name="eye" size={12} color={COLORS.gray} /> {formatCount(currentPeak.views || 0)} vues
              </Text>
            </View>
          </TouchableOpacity>

          {currentPeak.textOverlay && (
            <View style={styles.ctaContainer}>
              <Text style={styles.ctaText}>{currentPeak.textOverlay}</Text>
            </View>
          )}

          {repliesCount > 0 && (
            <TouchableOpacity
              style={styles.repliesIndicator}
              onPress={() => setIsInChain(true)}
            >
              <Ionicons name="link" size={16} color={COLORS.primary} />
              <Text style={styles.repliesText}>
                {repliesCount} réponses
              </Text>
              <Text style={styles.swipeHint}>Swipe ↑</Text>
            </TouchableOpacity>
          )}
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
            <SmuppyHeartIcon size={100} color={COLORS.primary} filled />
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
              <SmuppyHeartIcon size={24} color={COLORS.primary} filled />
            </Animated.View>
          ))}
        </View>
      )}

      {isInChain && (
        <View style={styles.chainOverlay}>
          <View style={[styles.chainHeader, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.chainTitle}>Réponses</Text>
            <Text style={styles.chainHint}>Double tap pour revenir</Text>
          </View>
        </View>
      )}

      {showOnboarding && (
        <View style={styles.onboardingOverlay}>
          <View style={styles.onboardingContent}>
            <Text style={styles.onboardingText}>
              Swipe UP pour voir les réponses{'\n'}ou relever le défi ! 🔥
            </Text>
          </View>
        </View>
      )}

      {isPaused && !showMenu && (
        <View style={styles.pauseInfo}>
          <Text style={styles.pauseUserName}>{currentPeak.user?.name}</Text>
          <Text style={styles.pauseDate}>
            {new Date(currentPeak.createdAt).toLocaleDateString()}
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
              <Ionicons name="eye-off-outline" size={24} color={COLORS.white} />
              <Text style={styles.menuItemText}>Pas intéressé</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => handleMenuAction('report')}
            >
              <Ionicons name="flag-outline" size={24} color="#FF453A" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Signaler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancelButton}
              onPress={closeMenu}
            >
              <Text style={styles.menuCancelText}>Annuler</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  mediaContainer: {
    flex: 1,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  // Progress Bar - Top
  progressBarContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 200,
  },
  progressBarBackground: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 1.5,
  },
  // Header
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Vertical Action Buttons - Right Side
  actionButtonsContainer: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    zIndex: 100,
  },
  actionButton: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  actionIconActive: {
    backgroundColor: 'rgba(17, 227, 163, 0.2)',
  },
  tagIconContainer: {
    borderWidth: 1,
    borderColor: 'rgba(14, 191, 138, 0.3)',
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Bottom Info
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 80,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarGradient: {
    width: 46,
    height: 46,
    borderRadius: 23,
    padding: 2,
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: COLORS.dark,
  },
  userTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  viewsText: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  ctaContainer: {
    backgroundColor: 'rgba(17, 227, 163, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 12,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  repliesIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repliesText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  swipeHint: {
    fontSize: 12,
    color: COLORS.gray,
    marginLeft: 8,
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
    color: COLORS.white,
  },
  chainHint: {
    fontSize: 13,
    color: COLORS.gray,
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
    color: COLORS.dark,
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
    color: COLORS.white,
    marginBottom: 4,
  },
  pauseDate: {
    fontSize: 14,
    color: COLORS.gray,
  },
  // Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: '#1C1C1E',
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
    backgroundColor: '#3A3A3C',
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
    color: COLORS.white,
    fontWeight: '500',
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
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
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default PeakViewScreen;
