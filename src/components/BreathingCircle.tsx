/**
 * BreathingCircle — Shared breathing animation component
 *
 * 4s inhale / 4s exhale cycle using Animated API.
 * Used by VibeGuardianOverlay.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface BreathingCircleProps {
  size?: number;
  color?: string;
  showLabel?: boolean;
}

const INHALE_DURATION = 4000;
const EXHALE_DURATION = 4000;

const BreathingCircle: React.FC<BreathingCircleProps> = ({
  size = 120,
  color,
  showLabel = true,
}) => {
  const { colors } = useTheme();
  const breathColor = color || colors.primary;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0.4)).current;
  const phaseRef = useRef<'inhale' | 'exhale'>('inhale');
  const labelAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        // Inhale — expand
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: INHALE_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.8,
            duration: INHALE_DURATION,
            useNativeDriver: true,
          }),
        ]),
        // Exhale — contract
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0.6,
            duration: EXHALE_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.4,
            duration: EXHALE_DURATION,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    breathe.start();

    // Phase label toggle
    const labelInterval = setInterval(() => {
      phaseRef.current = phaseRef.current === 'inhale' ? 'exhale' : 'inhale';
      // Quick fade for label change
      Animated.sequence([
        Animated.timing(labelAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(labelAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }, INHALE_DURATION);

    return () => {
      breathe.stop();
      clearInterval(labelInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.outerRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: breathColor + '30',
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          },
        ]}
      />

      {/* Main circle */}
      <Animated.View
        style={[
          styles.circle,
          {
            width: size * 0.75,
            height: size * 0.75,
            borderRadius: (size * 0.75) / 2,
            backgroundColor: breathColor + '25',
            borderColor: breathColor + '60',
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Inner dot */}
        <View
          style={[
            styles.innerDot,
            {
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: (size * 0.2) / 2,
              backgroundColor: breathColor,
            },
          ]}
        />
      </Animated.View>

      {/* Breathing label */}
      {showLabel && (
        <Animated.Text
          style={[
            styles.label,
            { color: breathColor, opacity: labelAnim, top: size + 16 },
          ]}
        >
          Breathe
        </Animated.Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  innerDot: {
    // Styled via props
  },
  label: {
    position: 'absolute',
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default React.memo(BreathingCircle);
