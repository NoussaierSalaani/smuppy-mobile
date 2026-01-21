import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PeakCarousel from '../../components/peaks/PeakCarousel';
import { DARK_COLORS as COLORS } from '../../config/theme';

const { width } = Dimensions.get('window');

interface PeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface Peak {
  id: string;
  thumbnail: string;
  duration: number;
  user: PeakUser;
  views: number;
  repliesCount?: number;
  textOverlay?: string;
  createdAt: Date;
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

  const heartScale = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  const currentPeak = peaks[currentIndex] || {} as Peak;

  useEffect(() => {
    if (showOnboarding) {
      const timer = setTimeout(() => {
        setShowOnboarding(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showOnboarding]);

  const animateHeart = (): void => {
    setShowHeart(true);
    heartScale.setValue(0);

    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1,
        damping: 10,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 300,
        delay: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowHeart(false);
    });
  };

  const handleSingleTap = (): void => {
    setCarouselVisible(!carouselVisible);
  };

  const handleDoubleTap = (): void => {
    if (isInChain) {
      setIsInChain(false);
    } else {
      animateHeart();
      setCarouselVisible(true);
    }
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
  };

  const handlePressOut = (): void => {
    setIsPaused(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        return Math.abs(gestureState.dy) > 20 || Math.abs(gestureState.dx) > 20;
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;

        if (Math.abs(dy) > Math.abs(dx)) {
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
        } else {
          if (!isInChain) {
            if (dx > 50 && currentIndex > 0) {
              setCurrentIndex(currentIndex - 1);
            } else if (dx < -50 && currentIndex < peaks.length - 1) {
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

          {!carouselVisible && (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: '50%' }]} />
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      <PeakCarousel
        peaks={peaks}
        currentIndex={currentIndex}
        onPeakSelect={handlePeakSelect}
        currentPeakDuration={currentPeak.duration || 10}
        isPaused={isPaused}
        onPeakComplete={handlePeakComplete}
        visible={carouselVisible && !isInChain}
      />

      {carouselVisible && (
        <View style={[styles.header, { top: insets.top + 10 }]}>
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

      {carouselVisible && (
        <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: currentPeak.user?.id })}
          >
            <Image
              source={{ uri: currentPeak.user?.avatar }}
              style={styles.avatar}
            />
            <Text style={styles.userName}>{currentPeak.user?.name}</Text>
          </TouchableOpacity>

          {currentPeak.textOverlay && (
            <View style={styles.ctaContainer}>
              <Text style={styles.ctaText}>{currentPeak.textOverlay}</Text>
            </View>
          )}

          {currentPeak.repliesCount && currentPeak.repliesCount > 0 && (
            <TouchableOpacity
              style={styles.repliesIndicator}
              onPress={() => setIsInChain(true)}
            >
              <Ionicons name="link" size={16} color={COLORS.primary} />
              <Text style={styles.repliesText}>
                {currentPeak.repliesCount} réponses
              </Text>
              <Text style={styles.swipeHint}>Swipe ↑</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showHeart && (
        <Animated.View
          style={[
            styles.heartContainer,
            {
              transform: [{ scale: heartScale }],
              opacity: heartScale,
            }
          ]}
        >
          <Ionicons name="heart" size={100} color={COLORS.primary} />
        </Animated.View>
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

      {isPaused && (
        <View style={styles.pauseInfo}>
          <Text style={styles.pauseUserName}>{currentPeak.user?.name}</Text>
          <Text style={styles.pauseDate}>
            {new Date(currentPeak.createdAt).toLocaleDateString()}
          </Text>
        </View>
      )}
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
  progressBarContainer: {
    position: 'absolute',
    bottom: 4,
    left: 16,
    right: 16,
  },
  progressBar: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
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
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
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
  heartContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -50,
    marginLeft: -50,
  },
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
  pauseInfo: {
    position: 'absolute',
    top: '50%',
    left: 20,
    right: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 16,
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
});

export default PeakViewScreen;
