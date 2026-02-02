/**
 * TabBar Store - Zustand Version
 * Manages tab bar visibility state
 *
 * Note: Animation values are stored globally (singleton) to be shared
 * across all components that use scroll-based hide/show
 */

import { create } from 'zustand';
import { useMemo } from 'react';
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

// Pre-compute interpolations once (they never change since globalHideAnim is a singleton)
const _topBarTranslate = globalHideAnim.interpolate({
  inputRange: [0, 1],
  outputRange: [0, -80],
  extrapolate: 'clamp',
});
const _bottomBarTranslate = globalHideAnim.interpolate({
  inputRange: [0, 1],
  outputRange: [0, 100],
  extrapolate: 'clamp',
});
const _barsOpacity = globalHideAnim.interpolate({
  inputRange: [0, 0.5, 1],
  outputRange: [1, 0.8, 0],
  extrapolate: 'clamp',
});

// Stable global functions (no hook dependencies needed)
function _showBars() {
  if (!globalIsVisible) {
    globalIsVisible = true;
    useTabBarStore.getState().setIsVisible(true);
    Animated.spring(globalHideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  }
}

function _hideBars() {
  if (globalIsVisible) {
    globalIsVisible = false;
    useTabBarStore.getState().setIsVisible(false);
    Animated.spring(globalHideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 12,
    }).start();
  }
}

function _handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
  const currentY = event.nativeEvent.contentOffset.y;
  const diff = currentY - globalLastScrollY;
  const threshold = 10;

  if (currentY <= 0) {
    _showBars();
    globalLastScrollY = currentY;
    return;
  }

  if (Math.abs(diff) < threshold) {
    return;
  }

  if (diff > 0) {
    _hideBars();
  } else {
    _showBars();
  }

  globalLastScrollY = currentY;
}

// Single stable object — never changes identity
const STABLE_ANIMATIONS: TabBarAnimations = {
  topBarTranslate: _topBarTranslate,
  bottomBarTranslate: _bottomBarTranslate,
  barsOpacity: _barsOpacity,
  showBars: _showBars,
  hideBars: _hideBars,
  handleScroll: _handleScroll,
};

/**
 * Hook that provides animated values for tab bar hide/show
 * Returns a stable reference — no re-renders caused by this hook
 */
export function useTabBarAnimations(): TabBarAnimations {
  return STABLE_ANIMATIONS;
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

// Stable setTabBarVisible
function _setTabBarVisible(v: boolean) {
  if (v) _showBars();
  else _hideBars();
}

/**
 * Combined hook that provides both store state and animations
 * This is the main hook to use in components (replaces useTabBar from Context)
 */
export function useTabBar(): TabBarContextValue {
  const bottomBarHidden = useTabBarStore((s) => s.bottomBarHidden);
  const setBottomBarHidden = useTabBarStore((s) => s.setBottomBarHidden);
  const isVisible = useTabBarStore((s) => s.isVisible);
  const xplorerFullscreen = useTabBarStore((s) => s.xplorerFullscreen);
  const setXplorerFullscreen = useTabBarStore((s) => s.setXplorerFullscreen);
  const toggleXplorerFullscreen = useTabBarStore((s) => s.toggleXplorerFullscreen);

  return useMemo(() => ({
    ...STABLE_ANIMATIONS,
    bottomBarHidden,
    setBottomBarHidden,
    xplorerFullscreen,
    setXplorerFullscreen,
    toggleXplorerFullscreen,
    tabBarVisible: isVisible,
    setTabBarVisible: _setTabBarVisible,
  }), [bottomBarHidden, setBottomBarHidden, isVisible, xplorerFullscreen, setXplorerFullscreen, toggleXplorerFullscreen]);
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
