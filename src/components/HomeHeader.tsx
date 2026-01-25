// src/components/HomeHeader.tsx
import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { COLORS, GRADIENTS } from '../config/theme';
import { SmuppyText } from './SmuppyLogo';
import { useTabBar } from '../context/TabBarContext';
import { useUserStore } from '../stores';
import { LiquidTabs } from './LiquidTabs';

const { width } = Dimensions.get('window');
const TAB_BAR_INNER_PADDING = 16;
const TAB_BAR_WIDTH = width - (TAB_BAR_INNER_PADDING * 2);
const TAB_COUNT = 3;
const TAB_WIDTH = TAB_BAR_WIDTH / TAB_COUNT;
const INDICATOR_WIDTH = TAB_WIDTH * 0.5;

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
  const { topBarTranslate, barsOpacity } = useTabBar();

  // Check if user is pro_creator for special styling
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator';

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

  const indicatorTranslateX = indicatorAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      (TAB_WIDTH * 0) + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
      (TAB_WIDTH * 1) + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
      (TAB_WIDTH * 2) + (TAB_WIDTH - INDICATOR_WIDTH) / 2,
    ],
  });

  // Icon color based on account type (dark for both now)
  const iconColor = COLORS.dark;

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
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBorder}
          >
            {/* Glass content */}
            <BlurView intensity={90} tint="light" style={styles.floatingHeaderContent}>
              {/* Single row: compact layout */}
              <View style={styles.compactRow}>
                {/* Left: Search */}
                <TouchableOpacity
                  style={styles.compactIconButton}
                  onPress={handleSearchPress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="search-outline" size={20} color={COLORS.dark} />
                </TouchableOpacity>

                {/* Center: Liquid Glass Tabs */}
                <View style={styles.liquidTabsWrapper}>
                  <LiquidTabs
                    tabs={tabs.map(t => ({ key: t.id, label: t.label }))}
                    activeTab={activeTab}
                    onTabChange={(key) => handleTabPress(key as TabId)}
                    size="small"
                    fullWidth={false}
                    style={styles.liquidTabsCompact}
                  />
                </View>

                {/* Right: Notifications */}
                <TouchableOpacity
                  style={styles.compactIconButton}
                  onPress={handleNotificationsPress}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="notifications-outline" size={20} color={COLORS.dark} />
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
        <BlurView intensity={80} tint="light" style={[styles.fixedHeader, { paddingTop: topPadding }]}>
          <View style={styles.fixedHeaderContent}>
            <View style={styles.leftIconContainer}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleSearchPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="search-outline" size={24} color={iconColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.logoContainer}>
              <SmuppyText width={120} variant="dark" />
            </View>
            <View style={styles.rightIconContainer}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleNotificationsPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
    marginTop: 4,
    paddingBottom: 8,
  },

  // ===== PRO CREATOR: FLOATING GLASS HEADER =====
  floatingHeaderWrapper: {
    marginHorizontal: 20,
    marginTop: 2,
  },
  gradientBorder: {
    borderRadius: 28, // Même que bottom nav
    padding: 1.5,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  floatingHeaderContent: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(10, 37, 47, 0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Liquid Tabs wrapper
  liquidTabsWrapper: {
    flex: 1,
    marginHorizontal: 6,
    maxWidth: 220, // Ensure it doesn't push icons off screen
  },
  liquidTabsCompact: {
    marginHorizontal: 0,
    borderRadius: 14,
  },
});
