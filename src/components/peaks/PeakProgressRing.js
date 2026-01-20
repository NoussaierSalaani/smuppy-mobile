import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const COLORS = {
  primary: '#0EBF8A',
  primaryFaded: 'rgba(17, 227, 163, 0.3)',
  dark: '#0A0A0F',
};

const PeakProgressRing = ({
  size = 66,
  strokeWidth = 3,
  avatar,
  progress = 1,
  isActive = false,
  duration = 10,
  onComplete,
  isPaused = false,
}) => {
  const animatedValue = useRef(new Animated.Value(1)).current;
  const animationRef = useRef(null);

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
  }, [isActive, isPaused, duration]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Background circle */}
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.primaryFaded}
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
          stroke={COLORS.primary}
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
        <Image
          source={{ uri: avatar }}
          style={[styles.avatar, {
            width: size - strokeWidth * 2 - 6,
            height: size - strokeWidth * 2 - 6,
            borderRadius: (size - strokeWidth * 2 - 6) / 2,
          }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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