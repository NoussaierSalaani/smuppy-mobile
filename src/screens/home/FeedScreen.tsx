import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, StatusBar, NativeSyntheticEvent, NativeScrollEvent, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeHeader from '../../components/HomeHeader';
import { useTabBar } from '../../context/TabBarContext';
import { useTheme } from '../../hooks/useTheme';
import ErrorBoundary from '../../components/ErrorBoundary';
import FanFeed from './FanFeed';
import VibesFeed from './VibesFeed';

// Lazy-load XplorerFeed to defer @rnmapbox/maps module evaluation (~100-300ms saved)
const XplorerFeed = React.lazy(() => import('./XplorerFeed'));

const { width } = Dimensions.get('window');
const TABS = ['Fan', 'Vibes', 'Xplorer'] as const;

const HEADER_HEIGHT = 44;
const TABBAR_HEIGHT = 46;

// Ref type for feed components
export interface FeedRef {
  scrollToTop: () => void;
}

export default function FeedScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fanFeedRef = useRef<FeedRef>(null);
  const vibesFeedRef = useRef<FeedRef>(null);
  const { setBottomBarHidden, showBars } = useTabBar();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Track which tabs have been visited (for lazy loading)
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(new Set([0]));

  const topPadding = insets.top || StatusBar.currentHeight || 44;
  const totalHeaderHeight = topPadding + HEADER_HEIGHT + TABBAR_HEIGHT;

  useFocusEffect(
    useCallback(() => {
      // Don't override Xplorer's bottom bar state
      if (activeTab !== 2) {
        setBottomBarHidden(false);
        showBars();
      }
    }, [activeTab, setBottomBarHidden, showBars])
  );

  useEffect(() => {
    // Xplorer manages its own bottom bar visibility
    if (activeTab !== 2) {
      setBottomBarHidden(false);
    }

    // Mark tab as visited for lazy loading
    setVisitedTabs(prev => new Set([...prev, activeTab]));
  }, [activeTab, setBottomBarHidden]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index !== activeTab && index >= 0 && index < TABS.length) {
      setActiveTab(index);
    }
  }, [activeTab]);

  const handleTabChange = useCallback((tabName: string) => {
    const index = TABS.indexOf(tabName as typeof TABS[number]);
    if (index === -1) return;

    // If clicking on the same tab, scroll to top
    if (index === activeTab) {
      if (index === 0 && fanFeedRef.current) {
        fanFeedRef.current.scrollToTop();
        showBars();
      } else if (index === 1 && vibesFeedRef.current) {
        vibesFeedRef.current.scrollToTop();
        showBars();
      }
      return;
    }

    // Switch to different tab
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: index * width, animated: true });
      setActiveTab(index);
    }
  }, [activeTab, showBars]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Horizontal scroll for 3 tabs */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEnabled={activeTab !== 2}
        contentOffset={{ x: 0, y: 0 }}
        style={styles.horizontalScroll}
      >
        {/* Fan - always loaded first */}
        <View style={styles.page}>
          <ErrorBoundary name="FanFeed" minimal>
            <FanFeed ref={fanFeedRef} headerHeight={totalHeaderHeight} />
          </ErrorBoundary>
        </View>

        {/* Vibes - lazy loaded when visited */}
        <View style={styles.page}>
          {visitedTabs.has(1) ? (
            <ErrorBoundary name="VibesFeed" minimal>
              <VibesFeed ref={vibesFeedRef} headerHeight={totalHeaderHeight} />
            </ErrorBoundary>
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.background }]} />
          )}
        </View>

        {/* Xplorer - lazy loaded when visited (defers @rnmapbox/maps eval) */}
        <View style={styles.page}>
          {visitedTabs.has(2) ? (
            <ErrorBoundary name="XplorerFeed" minimal>
              <Suspense fallback={<View style={[styles.placeholder, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>}>
                <XplorerFeed navigation={navigation} isActive={activeTab === 2} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.background }]} />
          )}
        </View>
      </ScrollView>

      {/* Header above all */}
      <HomeHeader activeTab={TABS[activeTab]} onTabChange={handleTabChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  horizontalScroll: {
    flex: 1,
  },
  page: {
    width: width,
    flex: 1,
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
