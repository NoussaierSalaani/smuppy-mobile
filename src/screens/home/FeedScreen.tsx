import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, StatusBar, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeHeader from '../../components/HomeHeader';
import { useTabBar } from '../../context/TabBarContext';
import FanFeed from './FanFeed';
import VibesFeed from './VibesFeed';
import XplorerFeed from './XplorerFeed';

const { width } = Dimensions.get('window');
const TABS = ['Fan', 'Vibes', 'Xplorer'] as const;

const HEADER_HEIGHT = 44;
const TABBAR_HEIGHT = 38;

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
  const [activeTab, setActiveTab] = useState(0);

  // Track which tabs have been visited (for lazy loading)
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(new Set([0]));

  const topPadding = insets.top || StatusBar.currentHeight || 44;
  const totalHeaderHeight = topPadding + HEADER_HEIGHT + TABBAR_HEIGHT;

  useFocusEffect(
    useCallback(() => {
      setBottomBarHidden(false);
      showBars();
    }, [setBottomBarHidden, showBars])
  );

  useEffect(() => {
    // Don't hide bottom bar for any tab - let scroll handle visibility
    setBottomBarHidden(false);

    // Mark tab as visited for lazy loading
    setVisitedTabs(prev => new Set([...prev, activeTab]));
  }, [activeTab, setBottomBarHidden]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index !== activeTab && index >= 0 && index < TABS.length) {
      setActiveTab(index);
    }
  };

  const handleTabChange = (tabName: string) => {
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
  };

  return (
    <View style={styles.container}>
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
          <FanFeed ref={fanFeedRef} headerHeight={totalHeaderHeight} />
        </View>

        {/* Vibes - lazy loaded when visited */}
        <View style={styles.page}>
          {visitedTabs.has(1) ? (
            <VibesFeed ref={vibesFeedRef} headerHeight={totalHeaderHeight} />
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {/* Xplorer - lazy loaded when visited */}
        <View style={styles.page}>
          {visitedTabs.has(2) ? (
            <XplorerFeed navigation={navigation} isActive={activeTab === 2} />
          ) : (
            <View style={styles.placeholder} />
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
