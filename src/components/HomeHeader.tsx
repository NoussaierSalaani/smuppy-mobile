// src/components/HomeHeader.tsx
import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { SmuppyText } from './SmuppyLogo';
import { useTabBar } from '../context/TabBarContext';
import { useTheme } from '../hooks/useTheme';
import { useUserStore } from '../stores';
import { LiquidTabs } from './LiquidTabs';

// Constants for tab bar calculations (kept for reference, LiquidTabs handles rendering now)

type TabId = 'Fan' | 'Vibes' | 'Xplorer';

interface Tab {
  id: TabId;
  label: string;
}

interface HomeHeaderProps {
  activeTab?: TabId;
  onTabChange?: (tabId: TabId) => void;
}

// Define navigation param list for type safety
type RootStackParamList = {
  Search: undefined;
  Messages: undefined;
  [key: string]: undefined;
};

export default function HomeHeader({ activeTab = 'Vibes', onTabChange }: HomeHeaderProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { topBarTranslate, barsOpacity, xplorerFullscreen } = useTabBar();
  const { colors, gradients, isDark } = useTheme();

  // Check if user is pro_creator or pro_business for special styling
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';

  const tabs: Tab[] = useMemo(() => [
    { id: 'Fan', label: 'Fan' },
    { id: 'Vibes', label: 'Vibes' },
    { id: 'Xplorer', label: 'Xplorer' },
  ], []);

  const indicatorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const activeIndex = tabs.findIndex(t => t.id === activeTab);
    Animated.spring(indicatorAnim, {
      toValue: activeIndex,
      useNativeDriver: true,
      tension: 120,
      friction: 12,
    }).start();
  }, [activeTab, indicatorAnim, tabs]);

  // Hide header in fullscreen map mode only
  // Must be after all hooks to comply with React rules
  if (activeTab === 'Xplorer' && xplorerFullscreen) {
    return <></>;
  }

  const handleTabPress = (tabId: TabId): void => {
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  const handleSearchPress = (): void => {
    navigation.navigate('Search');
  };

  const handleNotificationsPress = (): void => {
    navigation.navigate('Notifications');
  };

  const topPadding = insets.top || StatusBar.currentHeight || 44;

  // Icon color based on account type (dark for both now)
  const iconColor = colors.dark;

  // ===== PRO CREATOR: Floating Glass Header compact =====
  if (isProCreator) {
    return (
      <View style={styles.wrapper} pointerEvents="box-none">
        {/* Spacer pour le safe area */}
        <View style={{ height: topPadding, backgroundColor: 'transparent' }} />

        <Animated.View
          style={[
            styles.floatingHeaderWrapper,
            {
              transform: [{ translateY: topBarTranslate }],
              opacity: barsOpacity,
            }
          ]}
        >
          {/* Gradient border */}
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.gradientBorder, { shadowColor: colors.primary }]}
          >
            {/* Glass content */}
            <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={[styles.floatingHeaderContent, { backgroundColor: isDark ? 'rgba(13,13,13,0.92)' : 'rgba(255,255,255,0.92)' }]}>
              {/* Single row: compact layout */}
              <View style={styles.compactRow}>
                {/* Left: Search */}
                <TouchableOpacity
                  style={[styles.compactIconButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(10,37,47,0.04)' }]}
                  onPress={handleSearchPress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  testID="search-button"
                >
                  <Ionicons name="search-outline" size={20} color={colors.dark} />
                </TouchableOpacity>

                {/* Center: Liquid Glass Tabs */}
                <View style={styles.liquidTabsWrapper}>
                  <LiquidTabs
                    tabs={tabs.map(t => ({ key: t.id, label: t.label }))}
                    activeTab={activeTab}
                    onTabChange={(key) => handleTabPress(key as TabId)}
                    size="medium"
                    fullWidth={false}
                    style={styles.liquidTabsCompact}
                  />
                </View>

                {/* Right: Notifications */}
                <TouchableOpacity
                  style={[styles.compactIconButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(10,37,47,0.04)' }]}
                  onPress={handleNotificationsPress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  testID="notifications-button"
                >
                  <Ionicons name="notifications-outline" size={20} color={colors.dark} />
                </TouchableOpacity>
              </View>
            </BlurView>
          </LinearGradient>
        </Animated.View>
      </View>
    );
  }

  // ===== REGULAR USER: Header + TabBar séparés =====
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* Header animé - disparaît au scroll */}
      <Animated.View
        style={[
          {
            transform: [{ translateY: topBarTranslate }],
            opacity: barsOpacity,
          }
        ]}
      >
        <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={[styles.fixedHeader, { paddingTop: topPadding, backgroundColor: isDark ? 'rgba(13,13,13,0.85)' : 'rgba(255,255,255,0.85)' }]}>
          <View style={styles.fixedHeaderContent}>
            <View style={styles.leftIconContainer}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleSearchPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="search-button"
              >
                <Ionicons name="search-outline" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.logoContainer}>
              <SmuppyText width={120} variant={isDark ? "white" : "dark"} />
            </View>
            <View style={styles.rightIconContainer}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleNotificationsPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="notifications-button"
              >
                <Ionicons name="notifications-outline" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>

        {/* TabBar - Liquid Glass Style */}
        <View style={styles.tabBarContainer}>
          <LiquidTabs
            tabs={tabs.map(t => ({ key: t.id, label: t.label }))}
            activeTab={activeTab}
            onTabChange={(key) => handleTabPress(key as TabId)}
            size="medium"
            fullWidth={true}
            variant="glass"
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },

  // ===== FIXED HEADER =====
  fixedHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  fixedHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },

  // Icône gauche
  leftIconContainer: {
    width: 44,
    alignItems: 'flex-start',
  },

  // Logo centré
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Icône droite
  rightIconContainer: {
    width: 44,
    alignItems: 'flex-end',
  },

  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ===== TABBAR - Liquid Glass =====
  tabBarContainer: {
    marginTop: 0,
    paddingBottom: 0,
  },

  // ===== PRO CREATOR: FLOATING GLASS HEADER =====
  floatingHeaderWrapper: {
    marginHorizontal: 20,
    marginTop: 2,
  },
  gradientBorder: {
    borderRadius: 28, // Même que bottom nav
    padding: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingHeaderContent: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  compactIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(10, 37, 47, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },

  // Liquid Tabs wrapper
  liquidTabsWrapper: {
    flexShrink: 1,
    marginHorizontal: 8,
  },
  liquidTabsCompact: {
    marginHorizontal: 0,
  },
});
