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

import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

type ColorScheme = 'green' | 'dark' | 'gold' | 'red' | 'blue';

const COLOR_SCHEMES: Record<ColorScheme, {
  gradient: [string, string, string];
  shadow: string;
  outlineBorder: string;
  outlineText: string;
}> = {
  green: {
    gradient: ['#10D99A', '#0EBF8A', '#00B5C1'],
    shadow: '#0EBF8A',
    outlineBorder: '#0EBF8A',
    outlineText: '#0EBF8A',
  },
  dark: {
    gradient: ['#1C1C1E', '#0A0A0F', '#1A1A2E'],
    shadow: '#000000',
    outlineBorder: '#0A0A0F',
    outlineText: '#0A0A0F',
  },
  gold: {
    gradient: ['#FFD700', '#FFA500', '#FF8C00'],
    shadow: '#FFA500',
    outlineBorder: '#FFA500',
    outlineText: '#FFA500',
  },
  red: {
    gradient: ['#FF4757', '#E74C3C', '#C0392B'],
    shadow: '#E74C3C',
    outlineBorder: '#E74C3C',
    outlineText: '#E74C3C',
  },
  blue: {
    gradient: ['#3B82F6', '#2563EB', '#1D4ED8'],
    shadow: '#2563EB',
    outlineBorder: '#2563EB',
    outlineText: '#2563EB',
  },
};

interface LiquidButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  iconOnly?: boolean;
  variant?: 'filled' | 'outline';
  colorScheme?: ColorScheme;
  accessibilityLabel?: string;
  accessibilityHint?: string;
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
  iconOnly = false,
  variant = 'filled',
  colorScheme = 'green',
  accessibilityLabel,
  accessibilityHint,
}) => {
  const config = SIZE_CONFIG[size];
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Dynamic color schemes using theme colors
  const colorSchemes = useMemo(() => ({
    ...COLOR_SCHEMES,
    green: {
      ...COLOR_SCHEMES.green,
      shadow: colors.primary,
      outlineBorder: colors.primary,
      outlineText: colors.primary,
    },
    dark: {
      ...COLOR_SCHEMES.dark,
      outlineBorder: colors.dark,
      outlineText: colors.dark,
    },
  }), [colors.primary, colors.dark]);

  const scheme = colorSchemes[colorScheme];
  const labelColor = colorScheme === 'gold' ? '#000000' : '#FFFFFF';

  // Tinted transparent background for outline — darker tint in dark mode
  const outlineBgMap: Record<ColorScheme, string> = {
    green: isDark ? 'rgba(14, 191, 138, 0.12)' : 'rgba(14, 191, 138, 0.08)',
    dark: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(10, 10, 15, 0.05)',
    gold: isDark ? 'rgba(255, 165, 0, 0.12)' : 'rgba(255, 165, 0, 0.08)',
    red: isDark ? 'rgba(231, 76, 60, 0.12)' : 'rgba(231, 76, 60, 0.08)',
    blue: isDark ? 'rgba(37, 99, 235, 0.12)' : 'rgba(37, 99, 235, 0.08)',
  };

  // In dark mode: outline text should be lighter for readability
  const outlineTextColor = isDark && colorScheme === 'dark' ? '#E5E7EB' : scheme.outlineText;
  const outlineBorderColor = isDark && colorScheme === 'dark' ? '#4A4A4C' : scheme.outlineBorder;

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        accessibilityHint={accessibilityHint}
        style={[
          styles.outlineContainer,
          {
            height: config.height,
            paddingHorizontal: config.paddingH,
            borderRadius: config.radius,
            opacity: disabled ? 0.5 : 1,
            borderColor: outlineBorderColor,
            shadowColor: scheme.shadow,
            backgroundColor: outlineBgMap[colorScheme],
          },
          style,
        ]}
      >
        {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
        <Text style={[styles.outlineText, { fontSize: config.fontSize, color: outlineTextColor }, textStyle]}>
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
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      style={[
        styles.container,
        { borderRadius: iconOnly ? config.height / 2 : config.radius, opacity: disabled ? 0.5 : 1, shadowColor: scheme.shadow },
        style,
      ]}
    >
      <LinearGradient
        colors={scheme.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          {
            height: config.height,
            width: iconOnly ? config.height : undefined,
            paddingHorizontal: iconOnly ? 0 : config.paddingH,
            borderRadius: iconOnly ? config.height / 2 : config.radius,
          },
        ]}
      >
        {/* Top shine - water reflection */}
        <View style={[styles.topShine, { borderRadius: iconOnly ? config.height / 2 : config.radius }]} />
        {/* Bottom reflection */}
        <View style={styles.bottomReflection} />
        {/* Center glow */}
        <View style={styles.centerGlow} />

        {/* Content */}
        <View style={styles.content}>
          {iconOnly ? (
            icon
          ) : (
            <>
              {icon && iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
              <Text style={[styles.label, { fontSize: config.fontSize, color: labelColor }, textStyle]}>
                {label}
              </Text>
              {icon && iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
            </>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    overflow: 'hidden',
    shadowColor: colors.primary,
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
    color: colors.white,
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
    borderWidth: 1.5,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  outlineText: {
    fontWeight: '600',
    color: colors.primary,
    letterSpacing: 0.3,
  },
});

export default LiquidButton;
