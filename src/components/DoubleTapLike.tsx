import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  StyleProp,
  ViewStyle,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../config/theme';
import SmuppyHeartIcon from './icons/SmuppyHeartIcon';

interface DoubleTapLikeProps {
  children: React.ReactNode;
  onDoubleTap: () => void;
  onSingleTap?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  showAnimation?: boolean;
}

/**
 * DoubleTapLike - Smuppy's unique double-tap to like gesture
 * Features:
 * - Double-tap detection
 * - Haptic feedback
 * - Animated heart burst effect (Smuppy style - multiple hearts exploding)
 */
export default function DoubleTapLike({
  children,
  onDoubleTap,
  onSingleTap,
  disabled = false,
  style,
  showAnimation = true,
}: DoubleTapLikeProps) {
  const lastTap = useRef<number>(0);
  const singleTapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHeart, setShowHeart] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (singleTapTimeout.current) {
        clearTimeout(singleTapTimeout.current);
      }
    };
  }, []);

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
      const distance = 60 + Math.random() * 30;
      const targetX = Math.cos(angle) * distance;
      const targetY = Math.sin(angle) * distance;

      Animated.parallel([
        Animated.sequence([
          Animated.delay(50 + index * 30),
          Animated.spring(heart.scale, {
            toValue: 0.6 + Math.random() * 0.4,
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

  const handlePress = useCallback(() => {
    if (disabled) return;

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    // Clear any pending single tap
    if (singleTapTimeout.current) {
      clearTimeout(singleTapTimeout.current);
      singleTapTimeout.current = null;
    }

    if (now - lastTap.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      if (showAnimation) {
        triggerHeartAnimation();
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      onDoubleTap();
      lastTap.current = 0;
    } else {
      // First tap - wait for potential second tap
      lastTap.current = now;
      // Schedule single tap callback
      if (onSingleTap) {
        singleTapTimeout.current = setTimeout(() => {
          if (lastTap.current === now) {
            onSingleTap();
          }
          singleTapTimeout.current = null;
        }, DOUBLE_TAP_DELAY);
      }
    }
  }, [disabled, onDoubleTap, onSingleTap, showAnimation, triggerHeartAnimation]);

  return (
    <Pressable onPress={handlePress} style={style}>
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
            <SmuppyHeartIcon size={80} color={COLORS.primary} filled />
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
                color={index % 2 === 0 ? COLORS.primary : '#FF8FAB'}
                filled
              />
            </Animated.View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

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
