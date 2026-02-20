/**
 * Heart Rate Pulse Overlay
 * Animated heart rate display with pulsing effect
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Canvas, Path, Skia, Group } from '@shopify/react-native-skia';
import { HeartRatePulseParams } from '../types';

type HeartRatePulseProps = Readonly<{
  params: HeartRatePulseParams;
  size?: number;
}>;


export function HeartRatePulse({ params, size = 100 }: HeartRatePulseProps) {
  const { bpm, isAnimating, color } = params;

  // Animation values
  const heartScale = useSharedValue(1);
  const waveProgress = useSharedValue(0);
  const glowOpacity = useSharedValue(0.5);

  // Calculate pulse timing based on BPM
  const beatDuration = 60000 / bpm; // ms per beat
  const animationDuration = Math.max(beatDuration * 0.4, 100); // 40% of beat for animation

  // Heart pulse animation
  useEffect(() => {
    if (isAnimating) {
      heartScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: animationDuration * 0.3, easing: Easing.out(Easing.cubic) }),
          withTiming(0.95, { duration: animationDuration * 0.2, easing: Easing.in(Easing.cubic) }),
          withTiming(1.1, { duration: animationDuration * 0.2, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: animationDuration * 0.3, easing: Easing.in(Easing.cubic) })
        ),
        -1,
        false
      );

      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: animationDuration * 0.3 }),
          withTiming(0.3, { duration: animationDuration * 0.7 })
        ),
        -1,
        false
      );

      // ECG wave animation
      waveProgress.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      heartScale.value = withTiming(1, { duration: 200 });
      glowOpacity.value = withTiming(0.5, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnimating, bpm, animationDuration]);

  // Animated styles
  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  // Heart rate zone
  const getHeartRateZone = (bpm: number): { zone: string; color: string } => {
    if (bpm < 100) return { zone: 'WARM UP', color: '#4CAF50' };
    if (bpm < 130) return { zone: 'FAT BURN', color: '#8BC34A' };
    if (bpm < 160) return { zone: 'CARDIO', color: '#FFC107' };
    if (bpm < 180) return { zone: 'PEAK', color: '#FF9800' };
    return { zone: 'MAX', color: '#FF5722' };
  };

  const { zone, color: zoneColor } = getHeartRateZone(bpm);

  // ECG path dimensions
  const ecgWidth = size * 1.5;
  const ecgHeight = size * 0.3;

  // Create ECG path
  const createECGPath = () => {
    const path = Skia.Path.Make();
    const segmentWidth = ecgWidth / 10;

    path.moveTo(0, ecgHeight / 2);

    // Flat line
    path.lineTo(segmentWidth * 2, ecgHeight / 2);

    // P wave (small bump)
    path.quadTo(segmentWidth * 2.5, ecgHeight * 0.35, segmentWidth * 3, ecgHeight / 2);

    // Flat
    path.lineTo(segmentWidth * 3.5, ecgHeight / 2);

    // QRS complex (sharp spike)
    path.lineTo(segmentWidth * 4, ecgHeight * 0.6);
    path.lineTo(segmentWidth * 4.3, ecgHeight * 0.05);
    path.lineTo(segmentWidth * 4.6, ecgHeight * 0.85);
    path.lineTo(segmentWidth * 5, ecgHeight / 2);

    // Flat
    path.lineTo(segmentWidth * 5.5, ecgHeight / 2);

    // T wave
    path.quadTo(segmentWidth * 6.5, ecgHeight * 0.3, segmentWidth * 7.5, ecgHeight / 2);

    // Flat to end
    path.lineTo(ecgWidth, ecgHeight / 2);

    return path;
  };

  return (
    <View style={styles.container}>
      {/* Main display */}
      <View style={styles.mainDisplay}>
        {/* Heart icon */}
        <Animated.View style={[styles.heartContainer, heartStyle]}>
          <Animated.View style={[styles.heartGlow, glowStyle, { backgroundColor: color }]} />
          <Text style={[styles.heartEmoji, { fontSize: size * 0.35 }]}>❤️</Text>
        </Animated.View>

        {/* BPM value */}
        <View style={styles.bpmContainer}>
          <Text style={[styles.bpmValue, { fontSize: size * 0.4, color }]}>
            {bpm}
          </Text>
          <Text style={[styles.bpmLabel, { fontSize: size * 0.12 }]}>
            BPM
          </Text>
        </View>
      </View>

      {/* ECG wave */}
      <View style={[styles.ecgContainer, { width: ecgWidth, height: ecgHeight }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group>
            <Path
              path={createECGPath()}
              color={color}
              style="stroke"
              strokeWidth={2}
              strokeCap="round"
              strokeJoin="round"
            />
          </Group>
        </Canvas>
      </View>

      {/* Zone indicator */}
      <View style={[styles.zoneIndicator, { borderColor: zoneColor }]}>
        <View style={[styles.zoneDot, { backgroundColor: zoneColor }]} />
        <Text style={[styles.zoneText, { color: zoneColor }]}>{zone}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,50,50,0.3)',
  },
  mainDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heartContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  heartGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.3,
  },
  heartEmoji: {
    textShadowColor: 'rgba(255,0,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  bpmContainer: {
    alignItems: 'center',
  },
  bpmValue: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  bpmLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginTop: -4,
  },
  ecgContainer: {
    marginTop: 8,
    overflow: 'hidden',
  },
  zoneIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  zoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  zoneText: {
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
