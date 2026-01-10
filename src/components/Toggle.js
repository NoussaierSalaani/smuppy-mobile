import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS, SIZES, BORDERS } from '../config/theme';

/**
 * Toggle/Switch Component
 * 
 * @param {boolean} value - Current value
 * @param {function} onValueChange - Change handler
 * @param {boolean} disabled - Disabled state
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {object} style - Additional styles
 */
export default function Toggle({
  value = false,
  onValueChange,
  disabled = false,
  size = 'md',
  style,
}) {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  // Size configurations
  const sizeConfig = {
    sm: {
      width: 36,
      height: 20,
      thumbSize: 16,
      padding: 2,
    },
    md: {
      width: 42,
      height: 22,
      thumbSize: 18,
      padding: 2,
    },
    lg: {
      width: 52,
      height: 28,
      thumbSize: 24,
      padding: 2,
    },
  };

  const config = sizeConfig[size];

  // Animate on value change
  useEffect(() => {
    Animated.spring(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
      friction: 8,
      tension: 60,
    }).start();
  }, [value]);

  // Handle press
  const handlePress = () => {
    if (!disabled && onValueChange) {
      onValueChange(!value);
    }
  };

  // Calculate thumb position
  const thumbPosition = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [config.padding, config.width - config.thumbSize - config.padding],
  });

  // Calculate background color
  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.white, COLORS.primary],
  });

  // Calculate border color
  const borderColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.grayLight, COLORS.primary],
  });

  // Calculate thumb color
  const thumbColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.grayLight, COLORS.white],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={disabled}
      style={style}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: config.width,
            height: config.height,
            borderRadius: config.height / 2,
            backgroundColor: disabled ? COLORS.backgroundDisabled : backgroundColor,
            borderColor: disabled ? COLORS.grayLight : borderColor,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: config.thumbSize,
              height: config.thumbSize,
              borderRadius: config.thumbSize / 2,
              backgroundColor: disabled ? COLORS.grayMuted : thumbColor,
              transform: [{ translateX: thumbPosition }],
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: 'center',
    borderWidth: BORDERS.thin,
  },
  thumb: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
});
