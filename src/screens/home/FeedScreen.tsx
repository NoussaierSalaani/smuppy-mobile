import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, StatusBar } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeHeader from '../../components/HomeHeader';
import { useTabBar } from '../../context/TabBarContext';
import FanFeed from './FanFeed';
import VibesFeed from './VibesFeed';
import XplorerFeed from './XplorerFeed';

const { width } = Dimensions.get('window');
const TABS = ['Fan', 'Vibes', 'Xplorer'] as const;

const HEADER_HEIGHT = 50;
const TABBAR_HEIGHT = 70;

export default function FeedScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const { setBottomBarHidden, showBars } = useTabBar();
  const [activeTab, setActiveTab] = useState(0);

  const topPadding = insets.top || StatusBar.currentHeight || 44;
  const totalHeaderHeight = topPadding + HEADER_HEIGHT + TABBAR_HEIGHT;

  useFocusEffect(
    useCallback(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ x: 0, animated: false });
      }
      setActiveTab(0);
      setBottomBarHidden(false);
      showBars();
    }, [setBottomBarHidden, showBars])
  );

  useEffect(() => {
    if (activeTab === 2) {
      setBottomBarHidden(true);
    } else {
      setBottomBarHidden(false);
    }
  }, [activeTab, setBottomBarHidden]);

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    if (index !== activeTab && index >= 0 && index < TABS.length) {
      setActiveTab(index);
    }
  };

  const handleTabChange = (tabName) => {
    const index = TABS.indexOf(tabName);
    if (index !== -1 && scrollRef.current) {
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
        scrollEnabled={activeTab !== 2} // Disable swipe on Xplorer
        contentOffset={{ x: 0, y: 0 }}
        style={styles.horizontalScroll}
      >
        {/* Fan - with marginTop for header */}
        <View style={[styles.page, { marginTop: totalHeaderHeight }]}>
          <FanFeed />
        </View>

        {/* Vibes - with marginTop for header */}
        <View style={[styles.page, { marginTop: totalHeaderHeight }]}>
          <VibesFeed />
        </View>

        {/* Xplorer - NO marginTop, full screen map behind header */}
        <View style={styles.page}>
          <XplorerFeed navigation={navigation} isActive={activeTab === 2} />
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
});