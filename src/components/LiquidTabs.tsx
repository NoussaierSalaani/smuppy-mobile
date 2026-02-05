/**
 * LiquidTabs - iOS 18 "Water Drop" Animated Tabs
 *
 * True liquid/water drop effect with:
 * - Pill-shaped sliding indicator
 * - Elastic spring animation (like water)
 * - Glossy shine effect
 * - Scale bounce on selection
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Tab {
  key: string;
  label: string;
  icon?: string;
}

interface LiquidTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  style?: ViewStyle;
  variant?: 'glass' | 'solid' | 'minimal';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
}

// Spring config for water-like movement
const WATER_SPRING = {
  damping: 15,
  stiffness: 150,
  mass: 0.6,
};

export const LiquidTabs: React.FC<LiquidTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  style,
  variant = 'glass',
  size = 'medium',
  fullWidth = true,
}) => {
  const { isDark } = useTheme();
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const activeIndex = tabs.findIndex((t) => t.key === activeTab);
  const translateX = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) {
      setMeasuredWidth(w);
    }
  };

  // Size configurations
  const sizeConfig = {
    small: { height: 34, fontSize: 13, padding: 3, radius: 17 },
    medium: { height: 44, fontSize: 15, padding: 4, radius: 22 },
    large: { height: 52, fontSize: 16, padding: 5, radius: 26 },
  };
  const config = sizeConfig[size];

  // Calculate dimensions
  const containerPadding = config.padding;
  // For non-fullWidth: use smaller tabs for small size (compact header)
  const nonFullWidthTabSize = size === 'small' ? 66 : 90;
  // Full width = entire screen width (no margins)
  const containerWidth = fullWidth ? (measuredWidth || SCREEN_WIDTH) : tabs.length * nonFullWidthTabSize;
  const tabWidth = (containerWidth - containerPadding * 2) / tabs.length;
  const indicatorWidth = tabWidth - 4;

  useEffect(() => {
    // Animate position with water-like spring
    translateX.value = withSpring(
      activeIndex * tabWidth + containerPadding + 2,
      WATER_SPRING
    );

    // Squish effect like a water drop
    scaleX.value = withSequence(
      withTiming(1.15, { duration: 100, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    scaleY.value = withSequence(
      withTiming(0.9, { duration: 100, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { scaleX: scaleX.value },
        { scaleY: scaleY.value },
      ] as const,
      width: indicatorWidth,
    };
  });

  const handleTabPress = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Always call onTabChange - parent handles scroll-to-top for same tab
    onTabChange(key);
  };

  return (
    <View
      onLayout={fullWidth ? handleLayout : undefined}
      style={[
        styles.container,
        {
          // No borderRadius when fullWidth - connected to header above
          borderRadius: fullWidth ? 0 : config.radius,
          width: fullWidth ? undefined : containerWidth,
          maxWidth: fullWidth ? undefined : containerWidth,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {/* Glass background */}
      {variant === 'glass' && (
        <>
          <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[styles.glassOverlay, isDark && styles.glassOverlayDark]} />
        </>
      )}
      {variant === 'solid' && <View style={[styles.solidBackground, isDark && styles.solidBackgroundDark]} />}

      {/* Inner container */}
      <View style={[styles.innerContainer, { padding: containerPadding }]}>
        {/* Animated Water Drop Indicator */}
        <Animated.View style={[styles.indicator, indicatorStyle]}>
          <LinearGradient
            colors={['#10D99A', '#0EBF8A', '#00B5C1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.indicatorGradient,
              {
                height: config.height - containerPadding * 2 - 4,
                borderRadius: config.radius - 6,
              },
            ]}
          >
            {/* Top shine - water reflection */}
            <View style={[styles.topShine, { borderRadius: config.radius - 6 }]} />
            {/* Bottom reflection */}
            <View style={styles.bottomReflection} />
            {/* Center glow */}
            <View style={styles.centerGlow} />
          </LinearGradient>
        </Animated.View>

        {/* Tab Labels */}
        {tabs.map((tab, _index) => {
          const isActive = tab.key === activeTab;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              activeOpacity={0.7}
              style={[
                styles.tab,
                {
                  width: tabWidth,
                  height: config.height - containerPadding * 2,
                },
              ]}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { fontSize: config.fontSize },
                  isActive ? styles.tabLabelActive : (isDark ? styles.tabLabelInactiveDark : styles.tabLabelInactive),
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Outer border glow - only when not fullWidth */}
      {!fullWidth && <View style={[styles.borderGlow, { borderRadius: config.radius }]} />}
    </View>
  );
};

// Compact version
export const LiquidTabsCompact: React.FC<LiquidTabsProps> = (props) => (
  <LiquidTabs {...props} size="small" />
);

// With More button for profile
interface LiquidTabsWithMoreProps extends LiquidTabsProps {
  extraTabs?: Tab[];
  onMorePress?: () => void;
}

export const LiquidTabsWithMore: React.FC<LiquidTabsWithMoreProps> = ({
  tabs,
  extraTabs = [],
  activeTab,
  onTabChange,
  onMorePress,
  style,
  size = 'medium',
}) => {
  const activeInExtra = extraTabs.find((t) => t.key === activeTab);
  const hasExtras = extraTabs.length > 0;

  // Build display tabs
  const displayTabs = hasExtras
    ? [...tabs, { key: '__more__', label: '•••' }]
    : tabs;

  const handleChange = (key: string) => {
    if (key === '__more__') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onMorePress?.();
    } else {
      onTabChange(key);
    }
  };

  // If active is in extra, highlight the more button
  const effectiveActiveTab = activeInExtra ? '__more__' : activeTab;

  return (
    <LiquidTabs
      tabs={displayTabs}
      activeTab={effectiveActiveTab}
      onTabChange={handleChange}
      style={style}
      size={size}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  fullWidth: {
    // No margins - truly full width connected to header
    // No shadow when connected
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  solidBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F3F4F6',
  },
  innerContainer: {
    flexDirection: 'row',
    position: 'relative',
  },

  // Water Drop Indicator
  indicator: {
    position: 'absolute',
    top: 4,
    zIndex: 0,
  },
  indicatorGradient: {
    overflow: 'hidden',
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  topShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    borderBottomLeftRadius: 100,
    borderBottomRightRadius: 100,
  },
  bottomReflection: {
    position: 'absolute',
    bottom: 3,
    left: '20%',
    right: '20%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
  },
  centerGlow: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    width: 8,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 4,
  },

  // Tabs
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabLabel: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tabLabelInactive: {
    color: '#6B7280',
  },
  // Dark mode variants
  glassOverlayDark: {
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
  },
  solidBackgroundDark: {
    backgroundColor: '#1A1A1A',
  },
  tabLabelInactiveDark: {
    color: '#9CA3AF',
  },

  // Border glow
  borderGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    pointerEvents: 'none',
  },
});

export default LiquidTabs;
