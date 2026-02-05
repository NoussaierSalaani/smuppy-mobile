/**
 * Day Challenge Overlay
 * Progress badge showing challenge day (e.g., "Day 15/30")
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, RoundedRect, LinearGradient, vec } from '@shopify/react-native-skia';
import { DayChallengeParams } from '../types';

interface DayChallengeProps {
  params: DayChallengeParams;
  size?: number;
}

export function DayChallenge({ params, size = 120 }: DayChallengeProps) {
  const { currentDay, totalDays, challengeName, color } = params;

  // Animation values
  const shine = useSharedValue(0);
  const celebrateScale = useSharedValue(1);

  // Progress calculation
  const progress = currentDay / totalDays;
  const isComplete = currentDay >= totalDays;
  const isMilestone = currentDay % 5 === 0 || currentDay === 1;

  // Shine animation
  useEffect(() => {
    shine.value = withRepeat(
      withTiming(1, { duration: 2000 }),
      -1,
      false
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Celebration animation on milestones
  useEffect(() => {
    if (isMilestone) {
      celebrateScale.value = withSequence(
        withSpring(1.1, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 12, stiffness: 180 })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDay, isMilestone]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrateScale.value }],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + Math.sin(shine.value * Math.PI * 2) * 0.2,
  }));

  // Badge dimensions
  const badgeWidth = size * 1.4;
  const badgeHeight = size * 0.7;
  const progressBarWidth = badgeWidth * 0.85;

  return (
    <Animated.View
      style={[
        styles.container,
        { width: badgeWidth, height: badgeHeight },
        containerStyle,
      ]}
    >
      {/* Background with gradient */}
      <Canvas style={StyleSheet.absoluteFill}>
        <RoundedRect
          x={0}
          y={0}
          width={badgeWidth}
          height={badgeHeight}
          r={12}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(badgeWidth, badgeHeight)}
            colors={[
              'rgba(0,0,0,0.7)',
              'rgba(0,0,0,0.85)',
            ]}
          />
        </RoundedRect>
      </Canvas>

      {/* Shine overlay */}
      <Animated.View style={[styles.shineOverlay, shineStyle]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Challenge name */}
        <Text style={[styles.challengeName, { color: 'rgba(255,255,255,0.7)' }]}>
          {challengeName.toUpperCase()}
        </Text>

        {/* Day counter */}
        <View style={styles.dayRow}>
          <Text style={[styles.dayLabel, { color: 'rgba(255,255,255,0.8)' }]}>
            DAY
          </Text>
          <Text style={[styles.dayNumber, { color }]}>
            {currentDay}
          </Text>
          <Text style={[styles.totalDays, { color: 'rgba(255,255,255,0.5)' }]}>
            /{totalDays}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBar, { width: progressBarWidth }]}>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: `${progress * 100}%`,
                  backgroundColor: isComplete ? '#00E676' : color,
                },
              ]}
            />
          </View>
        </View>

        {/* Status text */}
        <Text style={styles.statusText}>
          {isComplete
            ? 'CHALLENGE COMPLETE!'
            : `${totalDays - currentDay} days to go`}
        </Text>
      </View>

      {/* Milestone badge */}
      {isMilestone && !isComplete && (
        <View style={[styles.milestoneBadge, { backgroundColor: color }]}>
          <Text style={styles.milestoneText}>
            {currentDay === 1 ? 'START' : 'MILESTONE'}
          </Text>
        </View>
      )}

      {/* Completion star */}
      {isComplete && (
        <View style={styles.completeStar}>
          <Text style={styles.starEmoji}>⭐</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  shineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  content: {
    flex: 1,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeName: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 4,
  },
  dayNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  totalDays: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressBar: {
    marginTop: 6,
  },
  progressBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 8,
    marginTop: 4,
  },
  milestoneBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    transform: [{ rotate: '15deg' }],
  },
  milestoneText: {
    color: '#000',
    fontSize: 7,
    fontWeight: 'bold',
  },
  completeStar: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  starEmoji: {
    fontSize: 24,
  },
});
