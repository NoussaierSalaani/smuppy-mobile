import React, { useEffect } from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';

interface SkeletonBaseProps {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const SHIMMER_DURATION = 1200;

const SkeletonBase = ({ width, height, borderRadius = 4, style }: SkeletonBaseProps) => {
  const { colors, isDark } = useTheme();
  const translateX = useSharedValue(-1);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 100 }],
  }));

  const bgColor = isDark ? '#1F1F1F' : colors.grayBorder;
  const shimmerColors: [string, string, string] = isDark
    ? ['#1F1F1F', '#2A2A2A', '#1F1F1F']
    : [colors.grayBorder, colors.backgroundSecondary, colors.grayBorder];

  return (
    <View
      style={[
        { width, height, borderRadius, backgroundColor: bgColor, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <LinearGradient
          colors={shimmerColors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

export default React.memo(SkeletonBase);
