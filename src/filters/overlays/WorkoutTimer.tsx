/**
 * Workout Timer Overlay
 * Animated circular countdown/stopwatch for workout videos
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  useDerivedValue,
} from 'react-native-reanimated';
import { Canvas, Circle, Path, Skia, Group } from '@shopify/react-native-skia';
import { WorkoutTimerParams } from '../types';

interface WorkoutTimerProps {
  params: WorkoutTimerParams;
  size?: number;
  onComplete?: () => void;
}

export function WorkoutTimer({
  params,
  size = 100,
  onComplete,
}: WorkoutTimerProps) {
  const { totalSeconds, currentSeconds, isRunning, mode, color } = params;

  // Animation values
  const progress = useSharedValue(mode === 'countdown' ? 1 : 0);
  const pulse = useSharedValue(1);

  // Calculate progress
  const progressValue = mode === 'countdown'
    ? currentSeconds / totalSeconds
    : currentSeconds / totalSeconds;

  useEffect(() => {
    progress.value = withTiming(progressValue, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [progressValue]);

  // Pulse animation when running
  useEffect(() => {
    if (isRunning) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isRunning]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}`;
  };

  // Circle dimensions
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Create arc path
  const createArcPath = (progressVal: number) => {
    const path = Skia.Path.Make();
    const startAngle = -90;
    const sweepAngle = progressVal * 360;

    path.addArc(
      {
        x: strokeWidth / 2,
        y: strokeWidth / 2,
        width: size - strokeWidth,
        height: size - strokeWidth,
      },
      startAngle,
      sweepAngle
    );

    return path;
  };

  return (
    <Animated.View style={[styles.container, { width: size, height: size }, containerStyle]}>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          color="rgba(255,255,255,0.2)"
          style="stroke"
          strokeWidth={strokeWidth}
        />

        {/* Progress arc */}
        <Group>
          <Path
            path={createArcPath(progressValue)}
            color={color}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
          />
        </Group>
      </Canvas>

      {/* Time display */}
      <View style={styles.timeContainer}>
        <Text style={[styles.timeText, { fontSize: size * 0.28, color }]}>
          {formatTime(currentSeconds)}
        </Text>
        {mode === 'countdown' && (
          <Text style={[styles.modeText, { fontSize: size * 0.1 }]}>
            {isRunning ? 'GO!' : 'READY'}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeText: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  modeText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
    marginTop: 2,
  },
});
