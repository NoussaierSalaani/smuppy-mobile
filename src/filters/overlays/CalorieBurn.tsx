/**
 * Calorie Burn Overlay
 * Animated calorie counter with fire effect
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { CalorieBurnParams } from '../types';

type CalorieBurnProps = Readonly<{
  params: CalorieBurnParams;
  size?: number;
}>;


export function CalorieBurn({ params, size = 100 }: CalorieBurnProps) {
  const { calories, targetCalories, color } = params;
  const prevCalories = useRef(calories);

  // Animation values
  const displayValue = useSharedValue(prevCalories.current);
  const flameScale = useSharedValue(1);
  const flamePulse = useSharedValue(0);

  // Progress
  const progress = targetCalories ? calories / targetCalories : 0;
  const isComplete = targetCalories && calories >= targetCalories;

  // Animate number counting
  useEffect(() => {
    displayValue.value = withTiming(calories, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });

    // Pop effect on calorie increase
    if (calories > prevCalories.current) {
      flameScale.value = withSequence(
        withSpring(1.2, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 200 })
      );
    }

    prevCalories.current = calories;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calories]);

  // Continuous flame animation
  useEffect(() => {
    flamePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated styles
  const flameStyle = useAnimatedStyle(() => {
    const scale = interpolate(flamePulse.value, [0, 1], [1, 1.15]);
    return {
      transform: [
        { scale: flameScale.value * scale },
      ],
    };
  });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value }],
  }));

  // Format calorie display
  const formatCalories = (value: number): string => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return Math.round(value).toString();
  };

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Flame icon */}
      <Animated.View style={[styles.flameContainer, flameStyle]}>
        <Text style={[styles.flameEmoji, { fontSize: size * 0.4 }]}>
          🔥
        </Text>
      </Animated.View>

      {/* Calorie count */}
      <View style={styles.valueContainer}>
        <Text
          style={[
            styles.calorieValue,
            {
              fontSize: size * 0.35,
              color: isComplete ? '#00E676' : color,
            },
          ]}
        >
          {formatCalories(calories)}
        </Text>
        <Text
          style={[
            styles.calorieLabel,
            { fontSize: size * 0.12 },
          ]}
        >
          CAL
        </Text>
      </View>

      {/* Target progress */}
      {targetCalories && (
        <View style={styles.targetContainer}>
          <View style={[styles.progressBar, { width: size * 1.2 }]}>
            <View style={styles.progressBackground}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(progress * 100, 100)}%`,
                    backgroundColor: isComplete ? '#00E676' : color,
                  },
                ]}
              />
            </View>
          </View>
          <Text style={styles.targetText}>
            {isComplete ? 'GOAL REACHED!' : `Goal: ${formatCalories(targetCalories)}`}
          </Text>
        </View>
      )}

      {/* Burning indicator */}
      {calories > 0 && (
        <View style={styles.burningIndicator}>
          <Animated.View style={flameStyle}>
            <Text style={styles.miniFlame}>🔥</Text>
          </Animated.View>
          <Text style={styles.burningText}>BURNING</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,100,0,0.3)',
  },
  flameContainer: {
    marginBottom: 4,
  },
  flameEmoji: {
    textShadowColor: 'rgba(255,100,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  calorieValue: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  calorieLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginLeft: 4,
  },
  targetContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBackground: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  targetText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    marginTop: 4,
  },
  burningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    opacity: 0.8,
  },
  miniFlame: {
    fontSize: 10,
  },
  burningText: {
    color: '#FF5722',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginLeft: 4,
  },
});
