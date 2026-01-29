/**
 * LiquidButton - iOS 18 "Water Drop" Glossy Button
 *
 * Matches the LiquidTabs indicator style:
 * - Gradient background (green → cyan)
 * - Glossy top shine
 * - Bottom reflection
 * - Center glow dot
 * - Green shadow
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface LiquidButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  variant?: 'filled' | 'outline';
}

const SIZE_CONFIG = {
  xs: { height: 28, paddingH: 14, fontSize: 11, radius: 14 },
  sm: { height: 34, paddingH: 18, fontSize: 13, radius: 17 },
  md: { height: 44, paddingH: 24, fontSize: 15, radius: 22 },
  lg: { height: 52, paddingH: 32, fontSize: 17, radius: 26 },
};

export const LiquidButton: React.FC<LiquidButtonProps> = ({
  label,
  onPress,
  disabled = false,
  size = 'sm',
  style,
  textStyle,
  icon,
  iconPosition = 'right',
  variant = 'filled',
}) => {
  const config = SIZE_CONFIG[size];

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        style={[
          styles.outlineContainer,
          {
            height: config.height,
            paddingHorizontal: config.paddingH,
            borderRadius: config.radius,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
        <Text style={[styles.outlineText, { fontSize: config.fontSize }, textStyle]}>
          {label}
        </Text>
        {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.container,
        { borderRadius: config.radius, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <LinearGradient
        colors={['#10D99A', '#0EBF8A', '#00B5C1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            height: config.height,
            paddingHorizontal: config.paddingH,
            borderRadius: config.radius,
          },
        ]}
      >
        {/* Top shine - water reflection */}
        <View style={[styles.topShine, { borderRadius: config.radius }]} />
        {/* Bottom reflection */}
        <View style={styles.bottomReflection} />
        {/* Center glow */}
        <View style={styles.centerGlow} />

        {/* Content */}
        <View style={styles.content}>
          {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          <Text style={[styles.label, { fontSize: config.fontSize }, textStyle]}>
            {label}
          </Text>
          {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  topShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
  },
  bottomReflection: {
    position: 'absolute',
    bottom: 3,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 2,
  },
  centerGlow: {
    position: 'absolute',
    top: '28%',
    left: '8%',
    width: 6,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.12)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  iconLeft: {
    marginRight: 6,
  },
  iconRight: {
    marginLeft: 6,
  },
  outlineContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  outlineText: {
    fontWeight: '600',
    color: '#0EBF8A',
    letterSpacing: 0.3,
  },
});

export default LiquidButton;
