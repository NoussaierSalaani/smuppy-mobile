import React, { useRef, useCallback, useState, useEffect, memo } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import SmuppyHeartIcon from './icons/SmuppyHeartIcon';

type DoubleTapLikeProps = Readonly<{
  children: React.ReactNode;
  onDoubleTap: () => void;
  onSingleTap?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  showAnimation?: boolean;
}>;


/**
 * DoubleTapLike - Smuppy's unique double-tap to like gesture
 * Uses react-native-gesture-handler for proper gesture composition:
 * - Double-tap works alongside horizontal ScrollView swiping (carousels)
 * - Haptic feedback (Success notification)
 * - Animated heart burst effect (main heart + 6 mini hearts exploding)
 */
const DoubleTapLike = memo(function DoubleTapLike({
  children,
  onDoubleTap,
  onSingleTap,
  disabled = false,
  style,
  showAnimation = true,
}: DoubleTapLikeProps) {
  const { colors } = useTheme();
  const [showHeart, setShowHeart] = useState(false);

  // Store callbacks in refs so gestures always see latest values
  const onDoubleTapRef = useRef(onDoubleTap);
  const onSingleTapRef = useRef(onSingleTap);
  const showAnimationRef = useRef(showAnimation);
  const disabledRef = useRef(disabled);

  useEffect(() => { onDoubleTapRef.current = onDoubleTap; }, [onDoubleTap]);
  useEffect(() => { onSingleTapRef.current = onSingleTap; }, [onSingleTap]);
  useEffect(() => { showAnimationRef.current = showAnimation; }, [showAnimation]);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  // Animation values for the heart burst
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  // Multiple mini hearts for the burst effect
  const miniHearts = useRef([
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
    { x: new Animated.Value(0), y: new Animated.Value(0), scale: new Animated.Value(0), opacity: new Animated.Value(0) },
  ]).current;

  const triggerHeartAnimation = useCallback(() => {
    // Reset values
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    miniHearts.forEach(heart => {
      heart.x.setValue(0);
      heart.y.setValue(0);
      heart.scale.setValue(0);
      heart.opacity.setValue(1);
    });

    setShowHeart(true);

    // Haptic feedback - Smuppy signature vibration
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Main heart animation - bounce in then out
    Animated.sequence([
      Animated.spring(heartScale, {
        toValue: 1.2,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(heartScale, {
          toValue: 1.5,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(heartOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => setShowHeart(false));

    // Mini hearts burst animation - Smuppy signature
    const angles = [0, 60, 120, 180, 240, 300]; // Evenly distributed
    miniHearts.forEach((heart, index) => {
      const angle = (angles[index] * Math.PI) / 180;
      const distance = 60 + Math.random() * 30; // NOSONAR
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance;

      Animated.parallel([
        Animated.sequence([
          Animated.delay(50 + index * 30),
          Animated.spring(heart.scale, {
            toValue: 0.6 + Math.random() * 0.4, // NOSONAR
            friction: 5,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(50 + index * 30),
          Animated.timing(heart.x, {
            toValue: targetX,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(50 + index * 30),
          Animated.timing(heart.y, {
            toValue: targetY - 20, // Float up slightly
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(200 + index * 30),
          Animated.timing(heart.opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    });
  }, [heartScale, heartOpacity, miniHearts]);

  // JS-thread handlers dispatched from worklets
  const handleDoubleTapJS = useCallback(() => {
    if (disabledRef.current) return;
    if (showAnimationRef.current) {
      triggerHeartAnimation();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDoubleTapRef.current();
  }, [triggerHeartAnimation]);

  const handleSingleTapJS = useCallback(() => {
    if (disabledRef.current) return;
    onSingleTapRef.current?.();
  }, []);

  // RNGH v2 gesture: double-tap (2 taps within 300ms)
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd(() => {
      'worklet';
      runOnJS(handleDoubleTapJS)();
    });

  // Single-tap: fires only if double-tap doesn't activate
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(300)
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      'worklet';
      runOnJS(handleSingleTapJS)();
    });

  // Compose: double-tap has priority; single-tap waits for it to fail
  const composedGesture = Gesture.Exclusive(doubleTap, singleTap);

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={style}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Post content"
        accessibilityHint="Double-tap to like this post"
      >
        {children}

        {/* Heart Animation Overlay */}
        {showHeart && (
          <View style={styles.heartContainer} pointerEvents="none">
            {/* Main Heart */}
            <Animated.View
              style={[
                styles.mainHeart,
                {
                  transform: [{ scale: heartScale }],
                  opacity: heartOpacity,
                },
              ]}
            >
              <SmuppyHeartIcon size={80} color={colors.heartRed} filled />
            </Animated.View>

            {/* Mini Hearts Burst */}
            {miniHearts.map((heart, index) => (
              <Animated.View
                key={index}
                style={[
                  styles.miniHeart,
                  {
                    transform: [
                      { translateX: heart.x },
                      { translateY: heart.y },
                      { scale: heart.scale },
                    ],
                    opacity: heart.opacity,
                  },
                ]}
              >
                <SmuppyHeartIcon
                  size={24}
                  color={index % 2 === 0 ? colors.heartRed : '#FF8FAB'}
                  filled
                />
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    </GestureDetector>
  );
});

export default DoubleTapLike;

const styles = StyleSheet.create({
  heartContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  mainHeart: {
    position: 'absolute',
  },
  miniHeart: {
    position: 'absolute',
  },
});
