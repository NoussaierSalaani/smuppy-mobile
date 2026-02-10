import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, GRADIENTS } from '../config/theme';

const SWIPE_THRESHOLD = 100; // Distance to trigger Peaks
const MAX_DRAG = 150; // Maximum drag distance

interface SwipeToPeaksProps {
  children: React.ReactNode;
  onOpenPeaks: () => void;
  enabled?: boolean;
}

/**
 * SwipeToPeaks - Smuppy's unique gesture to open Peaks
 * Swipe down from top of screen to reveal Peaks
 * Features a custom indicator animation
 */
export default function SwipeToPeaks({
  children,
  onOpenPeaks,
  enabled = true,
}: SwipeToPeaksProps) {
  const dragY = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const indicatorScale = useRef(new Animated.Value(0.8)).current;
  const [, setIsDragging] = useState(false);
  const [canTrigger, setCanTrigger] = useState(false);

  // Interpolations
  const translateY = dragY.interpolate({
    inputRange: [0, MAX_DRAG],
    outputRange: [0, MAX_DRAG],
    extrapolate: 'clamp',
  });

  const indicatorTranslateY = dragY.interpolate({
    inputRange: [0, SWIPE_THRESHOLD, MAX_DRAG],
    outputRange: [-60, 20, 40],
    extrapolate: 'clamp',
  });

  // Progress bar width in pixels (container is 40px wide)
  const PROGRESS_BAR_WIDTH = 40;
  const progressWidth = dragY.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, PROGRESS_BAR_WIDTH],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate if swiping down from near top of the scroll
        // and the gesture is more vertical than horizontal
        const { dy, dx } = gestureState;
        const isVerticalSwipe = Math.abs(dy) > Math.abs(dx);
        const isSwipeDown = dy > 10;
        return enabled && isVerticalSwipe && isSwipeDown;
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
        Animated.parallel([
          Animated.timing(indicatorOpacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false, // Must match other dragY-based animations
          }),
          Animated.spring(indicatorScale, {
            toValue: 1,
            friction: 6,
            useNativeDriver: false, // Must match other dragY-based animations
          }),
        ]).start();
      },
      onPanResponderMove: (_, gestureState) => {
        const { dy } = gestureState;
        if (dy > 0) {
          const clampedDy = Math.min(dy, MAX_DRAG);
          dragY.setValue(clampedDy);

          // Check if threshold reached
          if (dy >= SWIPE_THRESHOLD && !canTrigger) {
            setCanTrigger(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else if (dy < SWIPE_THRESHOLD && canTrigger) {
            setCanTrigger(false);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy } = gestureState;
        setIsDragging(false);
        setCanTrigger(false);

        if (dy >= SWIPE_THRESHOLD) {
          // Trigger Peaks
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onOpenPeaks();
        }

        // Animate back
        Animated.parallel([
          Animated.spring(dragY, {
            toValue: 0,
            friction: 7,
            tension: 40,
            useNativeDriver: false,
          }),
          Animated.timing(indicatorOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }),
          Animated.timing(indicatorScale, {
            toValue: 0.8,
            duration: 200,
            useNativeDriver: false,
          }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        setCanTrigger(false);
        Animated.parallel([
          Animated.spring(dragY, {
            toValue: 0,
            friction: 7,
            useNativeDriver: false,
          }),
          Animated.timing(indicatorOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }),
        ]).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Peaks Indicator */}
      <Animated.View
        style={[
          styles.indicatorContainer,
          {
            transform: [
              { translateY: indicatorTranslateY },
              { scale: indicatorScale },
            ],
            opacity: indicatorOpacity,
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={canTrigger ? ['#00C853', '#64DD17'] : GRADIENTS.primary}
          style={styles.indicator}
        >
          <Ionicons
            name={canTrigger ? 'flash' : 'chevron-down'}
            size={20}
            color={COLORS.white}
          />
          <Text style={styles.indicatorText}>
            {canTrigger ? 'Release for Peaks!' : 'Swipe for Peaks'}
          </Text>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                { width: progressWidth },
                canTrigger && styles.progressBarActive,
              ]}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Main content with pan responder */}
      <Animated.View
        style={[
          styles.content,
          { transform: [{ translateY }] },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  indicatorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  indicatorText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: COLORS.white,
  },
  progressContainer: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  progressBarActive: {
    backgroundColor: COLORS.success,
  },
});
