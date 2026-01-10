// src/context/TabBarContext.js
import React, { createContext, useContext, useRef, useCallback, useState } from 'react';
import { Animated } from 'react-native';

const TabBarContext = createContext();

export function TabBarProvider({ children }) {
  // Animation value: 0 = visible, 1 = hidden (for scroll)
  const hideAnim = useRef(new Animated.Value(0)).current;
  const isVisible = useRef(true);
  const lastScrollY = useRef(0);

  // State to hide ONLY the BottomNav (Xplorer screen)
  const [bottomBarHidden, setBottomBarHidden] = useState(false);

  // TopBar translate (scroll animation)
  const topBarTranslate = hideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -80],
    extrapolate: 'clamp',
  });

  // BottomBar translate (scroll animation)
  const bottomBarTranslate = hideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100],
    extrapolate: 'clamp',
  });

  // Opacity (scroll animation)
  const barsOpacity = hideAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.8, 0],
    extrapolate: 'clamp',
  });

  // Show bars (scroll up)
  const showBars = useCallback(() => {
    if (!isVisible.current) {
      isVisible.current = true;
      Animated.spring(hideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    }
  }, [hideAnim]);

  // Hide bars (scroll down)
  const hideBars = useCallback(() => {
    if (isVisible.current) {
      isVisible.current = false;
      Animated.spring(hideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    }
  }, [hideAnim]);

  // Scroll handler
  const handleScroll = useCallback((event) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const diff = currentY - lastScrollY.current;
    const threshold = 10;

    if (currentY <= 0) {
      showBars();
      lastScrollY.current = currentY;
      return;
    }

    if (Math.abs(diff) < threshold) {
      return;
    }

    if (diff > 0) {
      hideBars();
    } else {
      showBars();
    }

    lastScrollY.current = currentY;
  }, [showBars, hideBars]);

  const value = {
    // Scroll animations
    topBarTranslate,
    bottomBarTranslate,
    barsOpacity,
    // BottomNav visibility (for Xplorer)
    bottomBarHidden,
    setBottomBarHidden,
    // Methods
    showBars,
    hideBars,
    handleScroll,
    // Legacy
    tabBarVisible: isVisible.current,
    setTabBarVisible: (v) => v ? showBars() : hideBars(),
  };

  return (
    <TabBarContext.Provider value={value}>
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBar() {
  const context = useContext(TabBarContext);
  if (!context) {
    throw new Error('useTabBar must be used within TabBarProvider');
  }
  return context;
}