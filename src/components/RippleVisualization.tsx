/**
 * RippleVisualization — Animated concentric rings on profile avatar
 *
 * Rings expand/fade based on ripple score. No public counter.
 * Wraps children (avatar) with the ripple effect.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useRipple } from '../hooks/useRipple';

interface RippleVisualizationProps {
  size: number;
  children: React.ReactNode;
}

const MAX_RINGS = 5;
const RING_OVERFLOW = 60; // Extra space for ring animations to render without clipping

const RippleVisualization: React.FC<RippleVisualizationProps> = ({ size, children }) => {
  const { rippleLevel, animationIntensity, enabled } = useRipple();

  // Create animated values for each ring
  const ringAnims = useRef(
    Array.from({ length: MAX_RINGS }, () => ({
      scale: new Animated.Value(1),
      opacity: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (!enabled) return;

    const activeRings = rippleLevel.maxRings;
    const animations: Animated.CompositeAnimation[] = [];

    for (let i = 0; i < MAX_RINGS; i++) {
      if (i < activeRings) {
        // Animate this ring: pulse outward then fade
        const delay = i * 600; // Stagger rings
        const ringAnim = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
              Animated.timing(ringAnims[i].scale, {
                toValue: 1.2 + i * 0.15,
                duration: 2000 + i * 300,
                useNativeDriver: true,
              }),
              Animated.sequence([
                Animated.timing(ringAnims[i].opacity, {
                  toValue: 0.3 * animationIntensity,
                  duration: 800,
                  useNativeDriver: true,
                }),
                Animated.timing(ringAnims[i].opacity, {
                  toValue: 0,
                  duration: 1200 + i * 300,
                  useNativeDriver: true,
                }),
              ]),
            ]),
            // Reset
            Animated.parallel([
              Animated.timing(ringAnims[i].scale, {
                toValue: 1,
                duration: 0,
                useNativeDriver: true,
              }),
              Animated.timing(ringAnims[i].opacity, {
                toValue: 0,
                duration: 0,
                useNativeDriver: true,
              }),
            ]),
          ]),
        );
        animations.push(ringAnim);
        ringAnim.start();
      } else {
        // Hide inactive rings
        ringAnims[i].opacity.setValue(0);
        ringAnims[i].scale.setValue(1);
      }
    }

    return () => {
      animations.forEach((a) => a.stop());
    };
  }, [enabled, rippleLevel.maxRings, animationIntensity, ringAnims]);

  if (!enabled) {
    return <>{children}</>;
  }

  const ringColor = rippleLevel.color;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Rings layer — larger than avatar, absolutely positioned and centered.
          Uses explicit size instead of overflow:visible for iOS device compatibility. */}
      <View
        style={[styles.ringsLayer, { width: size + RING_OVERFLOW, height: size + RING_OVERFLOW }]}
        pointerEvents="none"
      >
        {ringAnims.map((anim, i) => (
          <Animated.View
            key={`ring-${i}`}
            style={[
              styles.ring,
              {
                width: size + 8 + i * 12,
                height: size + 8 + i * 12,
                borderRadius: (size + 8 + i * 12) / 2,
                borderColor: ringColor,
                transform: [{ scale: anim.scale }],
                opacity: anim.opacity,
              },
            ]}
          />
        ))}
      </View>

      {/* Avatar content */}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
});

export default React.memo(RippleVisualization);
