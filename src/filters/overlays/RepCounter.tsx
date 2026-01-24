/**
 * Rep Counter Overlay
 * Animated repetition counter with bounce effect
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { RepCounterParams } from '../types';

interface RepCounterProps {
  params: RepCounterParams;
  size?: number;
}

export function RepCounter({ params, size = 80 }: RepCounterProps) {
  const { currentReps, targetReps, exerciseName, color } = params;
  const prevReps = useRef(currentReps);

  // Animation values
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Bounce on rep change
  useEffect(() => {
    if (currentReps !== prevReps.current) {
      scale.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 300 }),
        withSpring(1, { damping: 12, stiffness: 200 })
      );

      // Flash effect
      opacity.value = withSequence(
        withTiming(0.5, { duration: 50 }),
        withTiming(1, { duration: 150 })
      );

      prevReps.current = currentReps;
    }
  }, [currentReps]);

  // Animated styles
  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Progress towards target
  const progressPercentage = targetReps
    ? Math.min((currentReps / targetReps) * 100, 100)
    : 0;

  const isComplete = targetReps && currentReps >= targetReps;

  return (
    <View style={[styles.container, { minWidth: size * 1.5 }]}>
      {/* Main counter */}
      <View style={styles.counterRow}>
        <Animated.Text
          style={[
            styles.repNumber,
            {
              fontSize: size * 0.6,
              color: isComplete ? '#00E676' : color,
            },
            numberStyle,
          ]}
        >
          {currentReps}
        </Animated.Text>

        {targetReps && (
          <Text
            style={[
              styles.targetText,
              { fontSize: size * 0.25, color: 'rgba(255,255,255,0.7)' },
            ]}
          >
            /{targetReps}
          </Text>
        )}
      </View>

      {/* Exercise name */}
      <Text
        style={[
          styles.exerciseName,
          { fontSize: size * 0.15, color: 'rgba(255,255,255,0.9)' },
        ]}
      >
        {exerciseName.toUpperCase()}
      </Text>

      {/* Progress bar */}
      {targetReps && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercentage}%`,
                  backgroundColor: isComplete ? '#00E676' : color,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Completion indicator */}
      {isComplete && (
        <Text style={styles.completeText}>COMPLETE!</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  repNumber: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  targetText: {
    fontWeight: '600',
    marginLeft: 4,
  },
  exerciseName: {
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 4,
  },
  progressContainer: {
    width: '100%',
    marginTop: 8,
  },
  progressBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  completeText: {
    color: '#00E676',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 6,
  },
});
