/**
 * GlassButton - iOS 18 "Liquid Glass" Style Button
 *
 * Inspired by the new Apple design language:
 * - Frosted glass effect (BlurView)
 * - Subtle border with transparency
 * - Soft inner shadow
 * - Smooth animations
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

interface GlassButtonProps {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'secondary' | 'pill';
  size?: 'small' | 'medium' | 'large';
  active?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  label,
  icon,
  onPress,
  variant = 'default',
  size = 'medium',
  active = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const sizeStyles = {
    small: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    medium: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    large: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  };

  const iconSizes = { small: 16, medium: 20, large: 24 };
  const textSizes = { small: 13, medium: 15, large: 17 };

  if (variant === 'primary' && active) {
    return (
      <AnimatedTouchable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.9}
        style={[animatedStyle, style]}
      >
        <LinearGradient
          colors={['#0EBF8A', '#00B5C1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.primaryButton, sizeStyles[size]]}
        >
          {icon && (
            <Ionicons
              name={icon}
              size={iconSizes[size]}
              color="#FFFFFF"
              style={label ? { marginRight: 8 } : undefined}
            />
          )}
          {label && (
            <Text style={[styles.primaryText, { fontSize: textSizes[size] }, textStyle]}>
              {label}
            </Text>
          )}
        </LinearGradient>
      </AnimatedTouchable>
    );
  }

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={0.9}
      style={[animatedStyle, style]}
    >
      <View style={[styles.glassContainer, sizeStyles[size], active && styles.glassActive]}>
        <BlurView
          intensity={40}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassContent}>
          {icon && (
            <Ionicons
              name={icon}
              size={iconSizes[size]}
              color={active ? '#0EBF8A' : '#374151'}
              style={label ? { marginRight: 8 } : undefined}
            />
          )}
          {label && (
            <Text
              style={[
                styles.glassText,
                { fontSize: textSizes[size] },
                active && styles.glassTextActive,
                textStyle,
              ]}
            >
              {label}
            </Text>
          )}
        </View>
        {/* Inner highlight */}
        <View style={styles.innerHighlight} />
      </View>
    </AnimatedTouchable>
  );
};

// Glass Pill Tabs - for tab bars
interface GlassPillTabsProps {
  tabs: { key: string; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  style?: ViewStyle;
}

export const GlassPillTabs: React.FC<GlassPillTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  style,
}) => {
  return (
    <View style={[styles.pillTabsContainer, style]}>
      <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.pillTabsInner}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.8}
              style={styles.pillTabItem}
            >
              {isActive ? (
                <LinearGradient
                  colors={['#0EBF8A', '#00B5C1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.pillTabActive}
                >
                  {tab.icon && (
                    <Ionicons name={tab.icon} size={16} color="#FFF" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.pillTabTextActive}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.pillTab}>
                  {tab.icon && (
                    <Ionicons name={tab.icon} size={16} color="#6B7280" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.pillTabText}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Glass Button Styles
  glassContainer: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  glassActive: {
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    borderColor: 'rgba(14, 191, 138, 0.3)',
  },
  glassContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassText: {
    fontWeight: '600',
    color: '#374151',
  },
  glassTextActive: {
    color: '#0EBF8A',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },

  // Primary Button
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryText: {
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Pill Tabs
  pillTabsContainer: {
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: 'rgba(243, 244, 246, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  pillTabsInner: {
    flexDirection: 'row',
    padding: 4,
  },
  pillTabItem: {
    flex: 1,
  },
  pillTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  pillTabActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pillTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  pillTabTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default GlassButton;
