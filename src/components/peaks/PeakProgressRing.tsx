import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { AvatarImage } from '../OptimizedImage';
import Svg, { Circle } from 'react-native-svg';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PeakProgressRingProps {
  size?: number;
  strokeWidth?: number;
  avatar: string;
  progress?: number;
  isActive?: boolean;
  duration?: number;
  onComplete?: () => void;
  isPaused?: boolean;
}

const PeakProgressRing = ({
  size = 66,
  strokeWidth = 3,
  avatar,
  isActive = false,
  duration = 10,
  onComplete,
  isPaused = false,
}: PeakProgressRingProps): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const animatedValue = useRef(new Animated.Value(1)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    if (isActive && !isPaused) {
      animatedValue.setValue(1);

      animationRef.current = Animated.timing(animatedValue, {
        toValue: 0,
        duration: duration * 1000,
        useNativeDriver: false,
      });

      animationRef.current.start(({ finished }) => {
        if (finished && onComplete) {
          onComplete();
        }
      });
    } else if (isPaused && animationRef.current) {
      animationRef.current.stop();
    }

    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
      }
    };
  }, [isActive, isPaused, duration, animatedValue, onComplete]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const primaryFaded = `${colors.primary}4D`; // ~30% opacity

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background circle */}
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={primaryFaded}
          strokeWidth={strokeWidth}
          fill="none"
        />
      </Svg>

      {/* Progress circle */}
      <Svg
        width={size}
        height={size}
        style={[styles.svg, styles.progressSvg]}
      >
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>

      {/* Avatar */}
      <View style={[styles.avatarContainer, {
        width: size - strokeWidth * 2 - 4,
        height: size - strokeWidth * 2 - 4,
        borderRadius: (size - strokeWidth * 2 - 4) / 2,
      }]}>
        <AvatarImage source={avatar} size={size - strokeWidth * 2 - 6} />
      </View>
    </View>
  );
};

const createStyles = (_colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
    transform: [{ rotateZ: '-90deg' }],
  },
  progressSvg: {
    transform: [{ rotateZ: '-90deg' }],
  },
  avatarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    resizeMode: 'cover',
  },
});

export default PeakProgressRing;
