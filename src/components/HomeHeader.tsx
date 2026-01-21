// src/components/HomeHeader.tsx
import React, { useRef, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { COLORS } from '../config/theme';
import { SmuppyText } from './SmuppyLogo';
import { useTabBar } from '../context/TabBarContext';

const { width } = Dimensions.get('window');
const TAB_BAR_MARGIN = 16;
const TAB_BAR_INNER_PADDING = 16;
const TAB_BAR_WIDTH = width - (TAB_BAR_MARGIN * 2) - (TAB_BAR_INNER_PADDING * 2);
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

  const tabs: Tab[] = [
    { id: 'Fan', label: 'Fan' },
    { id: 'Vibes', label: 'Vibes' },
    { id: 'Xplorer', label: 'Xplorer' },
  ];

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

  const handleMessagesPress = (): void => {
    navigation.navigate('Messages');
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

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {/* ===== HEADER FIXE ===== */}
      <View style={[styles.fixedHeader, { paddingTop: topPadding }]}>
        <View style={styles.fixedHeaderContent}>
          {/* Icône gauche - Recherche */}
          <View style={styles.leftIconContainer}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleSearchPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="search-outline" size={24} color={COLORS.dark} />
            </TouchableOpacity>
          </View>

          {/* Logo centré */}
          <View style={styles.logoContainer}>
            <SmuppyText width={120} variant="dark" />
          </View>

          {/* Icône droite - Messages */}
          <View style={styles.rightIconContainer}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleMessagesPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chatbubble-outline" size={24} color={COLORS.dark} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ===== TABBAR ANIMÉ ===== */}
      <Animated.View
        style={[
          styles.tabBarAnimatedWrapper,
          {
            transform: [{ translateY: topBarTranslate }],
            opacity: barsOpacity,
          }
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.tabBarContainer}>
          <BlurView intensity={90} tint="light" style={styles.tabBarBlur}>
            <View style={styles.tabsContainer}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={styles.tab}
                    onPress={() => handleTabPress(tab.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.tabText,
                      isActive && styles.tabTextActive
                    ]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.lineContainer}>
              <View style={styles.grayLine} />
              <Animated.View
                style={[
                  styles.greenIndicator,
                  {
                    width: INDICATOR_WIDTH,
                    transform: [{ translateX: indicatorTranslateX }],
                  }
                ]}
              />
            </View>
          </BlurView>
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
    backgroundColor: '#FFFFFF',
  },
  fixedHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 50,
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

  // ===== ANIMATED TABBAR =====
  tabBarAnimatedWrapper: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  tabBarContainer: {
    marginHorizontal: TAB_BAR_MARGIN,
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarBlur: {
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingBottom: 10,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: TAB_BAR_INNER_PADDING,
  },
  tab: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(10, 37, 47, 0.4)',
    letterSpacing: 0.2,
  },
  tabTextActive: {
    color: COLORS.dark,
    fontWeight: '600',
  },

  // ===== LIGNE =====
  lineContainer: {
    height: 2.5,
    marginHorizontal: TAB_BAR_INNER_PADDING,
    position: 'relative',
  },
  grayLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 2,
  },
  greenIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2.5,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});
