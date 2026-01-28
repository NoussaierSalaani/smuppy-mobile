/**
 * TabBar Store - Zustand Version
 * Manages tab bar visibility state
 *
 * Note: Animation values are stored globally (singleton) to be shared
 * across all components that use scroll-based hide/show
 */

import { create } from 'zustand';
import { useCallback, useMemo } from 'react';
import { Animated, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';

// ============================================
// GLOBAL SHARED ANIMATION VALUE (SINGLETON)
// ============================================
// This MUST be outside the hook to be shared across all components
const globalHideAnim = new Animated.Value(0);
let globalIsVisible = true;
let globalLastScrollY = 0;

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

  // Xplorer fullscreen mode (header hidden, map takes full screen)
  xplorerFullscreen: boolean;
  setXplorerFullscreen: (fullscreen: boolean) => void;
  toggleXplorerFullscreen: () => void;

  // Reset
  reset: () => void;
}

export const useTabBarStore = create<TabBarStoreState>((set) => ({
  bottomBarHidden: false,
  isVisible: true,
  xplorerFullscreen: false,

  setBottomBarHidden: (hidden) => set({ bottomBarHidden: hidden }),
  setIsVisible: (visible) => set({ isVisible: visible }),
  setXplorerFullscreen: (fullscreen) => set({ xplorerFullscreen: fullscreen }),
  toggleXplorerFullscreen: () => set((state) => ({ xplorerFullscreen: !state.xplorerFullscreen })),

  reset: () => set({ bottomBarHidden: false, isVisible: true, xplorerFullscreen: false }),
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
 * Uses global singleton Animated.Value to share across all components
 */
export function useTabBarAnimations(): TabBarAnimations {
  const { setIsVisible } = useTabBarStore();

  // Use GLOBAL animation value (shared across all components)
  const hideAnim = globalHideAnim;

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
    if (!globalIsVisible) {
      globalIsVisible = true;
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
    if (globalIsVisible) {
      globalIsVisible = false;
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
      const diff = currentY - globalLastScrollY;
      const threshold = 10;

      if (currentY <= 0) {
        showBars();
        globalLastScrollY = currentY;
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

      globalLastScrollY = currentY;
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
  // Xplorer fullscreen mode
  xplorerFullscreen: boolean;
  setXplorerFullscreen: (fullscreen: boolean) => void;
  toggleXplorerFullscreen: () => void;
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
  const { bottomBarHidden, setBottomBarHidden, isVisible, xplorerFullscreen, setXplorerFullscreen, toggleXplorerFullscreen } = useTabBarStore();
  const animations = useTabBarAnimations();

  return {
    ...animations,
    bottomBarHidden,
    setBottomBarHidden,
    xplorerFullscreen,
    setXplorerFullscreen,
    toggleXplorerFullscreen,
    tabBarVisible: isVisible,
    setTabBarVisible: (v: boolean) => (v ? animations.showBars() : animations.hideBars()),
  };
}

// Legacy export for backward compatibility
export const tabBarStore = {
  reset: () => {
    useTabBarStore.getState().reset();
    // Reset global animation values too
    globalHideAnim.setValue(0);
    globalIsVisible = true;
    globalLastScrollY = 0;
  },
};
