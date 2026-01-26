/**
 * TabBar Store - Zustand Version
 * Manages tab bar visibility state
 *
 * Note: Animation values remain in useTabBarAnimations hook
 * because Animated.Value doesn't serialize to Zustand
 */

import { create } from 'zustand';
import { useRef, useCallback, useMemo } from 'react';
import { Animated, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

// ============================================
// ZUSTAND STORE (for simple state)
// ============================================

interface TabBarStoreState {
  // BottomNav visibility (for Xplorer)
  bottomBarHidden: boolean;
  setBottomBarHidden: (hidden: boolean) => void;

  // Tab bar visibility state
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;

  // Reset
  reset: () => void;
}

export const useTabBarStore = create<TabBarStoreState>((set) => ({
  bottomBarHidden: false,
  isVisible: true,

  setBottomBarHidden: (hidden) => set({ bottomBarHidden: hidden }),
  setIsVisible: (visible) => set({ isVisible: visible }),

  reset: () => set({ bottomBarHidden: false, isVisible: true }),
}));

// ============================================
// ANIMATION HOOK (for Animated values)
// ============================================

interface TabBarAnimations {
  // Animated interpolations
  topBarTranslate: Animated.AnimatedInterpolation<number>;
  bottomBarTranslate: Animated.AnimatedInterpolation<number>;
  barsOpacity: Animated.AnimatedInterpolation<number>;

  // Methods
  showBars: () => void;
  hideBars: () => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Hook that provides animated values for tab bar hide/show
 * Uses useRef for Animated.Value to persist across renders
 */
export function useTabBarAnimations(): TabBarAnimations {
  const { setIsVisible } = useTabBarStore();

  // Animation value: 0 = visible, 1 = hidden
  const hideAnim = useRef(new Animated.Value(0)).current;
  const isVisibleRef = useRef(true);
  const lastScrollY = useRef(0);

  // TopBar translate (scroll animation)
  const topBarTranslate = useMemo(
    () =>
      hideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -80],
        extrapolate: 'clamp',
      }),
    [hideAnim]
  );

  // BottomBar translate (scroll animation)
  const bottomBarTranslate = useMemo(
    () =>
      hideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 100],
        extrapolate: 'clamp',
      }),
    [hideAnim]
  );

  // Opacity (scroll animation)
  const barsOpacity = useMemo(
    () =>
      hideAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 0.8, 0],
        extrapolate: 'clamp',
      }),
    [hideAnim]
  );

  // Show bars
  const showBars = useCallback(() => {
    if (!isVisibleRef.current) {
      isVisibleRef.current = true;
      setIsVisible(true);
      Animated.spring(hideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    }
  }, [hideAnim, setIsVisible]);

  // Hide bars
  const hideBars = useCallback(() => {
    if (isVisibleRef.current) {
      isVisibleRef.current = false;
      setIsVisible(false);
      Animated.spring(hideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }).start();
    }
  }, [hideAnim, setIsVisible]);

  // Scroll handler
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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
    },
    [showBars, hideBars]
  );

  return {
    topBarTranslate,
    bottomBarTranslate,
    barsOpacity,
    showBars,
    hideBars,
    handleScroll,
  };
}

// ============================================
// COMBINED HOOK (replaces useTabBar)
// ============================================

export interface TabBarContextValue {
  // Scroll animations
  topBarTranslate: Animated.AnimatedInterpolation<number>;
  bottomBarTranslate: Animated.AnimatedInterpolation<number>;
  barsOpacity: Animated.AnimatedInterpolation<number>;
  // BottomNav visibility (for Xplorer)
  bottomBarHidden: boolean;
  setBottomBarHidden: (hidden: boolean) => void;
  // Methods
  showBars: () => void;
  hideBars: () => void;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  // Legacy
  tabBarVisible: boolean;
  setTabBarVisible: (visible: boolean) => void;
}

/**
 * Combined hook that provides both store state and animations
 * This is the main hook to use in components (replaces useTabBar from Context)
 */
export function useTabBar(): TabBarContextValue {
  const { bottomBarHidden, setBottomBarHidden, isVisible } = useTabBarStore();
  const animations = useTabBarAnimations();

  return {
    ...animations,
    bottomBarHidden,
    setBottomBarHidden,
    tabBarVisible: isVisible,
    setTabBarVisible: (v: boolean) => (v ? animations.showBars() : animations.hideBars()),
  };
}

// Legacy export for backward compatibility
export const tabBarStore = {
  reset: () => useTabBarStore.getState().reset(),
};
