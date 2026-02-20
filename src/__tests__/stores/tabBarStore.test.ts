/**
 * TabBar Store Tests
 * Tests for tab bar visibility state management (Zustand store portion)
 *
 * Note: The animation hook (useTabBarAnimations) and combined hook (useTabBar)
 * rely on React hooks and Animated APIs. This file tests the Zustand store
 * (useTabBarStore) and the exported tabBarStore singleton.
 */

// Mock react-native before any imports (tabBarStore imports Animated at module level)
jest.mock('react-native', () => {
  const animatedValue = {
    interpolate: jest.fn(() => ({ __type: 'interpolation' })),
    setValue: jest.fn(),
  };
  return {
    Animated: {
      Value: jest.fn(() => animatedValue),
      spring: jest.fn(() => ({ start: jest.fn() })),
    },
    Platform: { OS: 'ios' },
  };
});

// Mock react (useMemo used in useTabBar hook)
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useMemo: jest.fn((fn: () => unknown) => fn()),
}));

import { useTabBarStore, tabBarStore } from '../../stores/tabBarStore';

describe('TabBarStore', () => {
  beforeEach(() => {
    useTabBarStore.getState().reset();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // 1. Initial State
  // ==========================================================================
  describe('Initial State', () => {
    it('should have bottomBarHidden set to false initially', () => {
      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
    });

    it('should have isVisible set to true initially', () => {
      const state = useTabBarStore.getState();
      expect(state.isVisible).toBe(true);
    });

    it('should have xplorerFullscreen set to false initially', () => {
      const state = useTabBarStore.getState();
      expect(state.xplorerFullscreen).toBe(false);
    });
  });

  // ==========================================================================
  // 2. setBottomBarHidden
  // ==========================================================================
  describe('setBottomBarHidden', () => {
    it('should set bottomBarHidden to true', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      expect(useTabBarStore.getState().bottomBarHidden).toBe(true);
    });

    it('should set bottomBarHidden to false', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setBottomBarHidden(false);
      expect(useTabBarStore.getState().bottomBarHidden).toBe(false);
    });

    it('should not affect other state properties', () => {
      useTabBarStore.getState().setBottomBarHidden(true);

      const state = useTabBarStore.getState();
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });

    it('should be idempotent when setting same value', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setBottomBarHidden(true);
      expect(useTabBarStore.getState().bottomBarHidden).toBe(true);
    });
  });

  // ==========================================================================
  // 3. setIsVisible
  // ==========================================================================
  describe('setIsVisible', () => {
    it('should set isVisible to false', () => {
      useTabBarStore.getState().setIsVisible(false);
      expect(useTabBarStore.getState().isVisible).toBe(false);
    });

    it('should set isVisible to true', () => {
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().setIsVisible(true);
      expect(useTabBarStore.getState().isVisible).toBe(true);
    });

    it('should not affect other state properties', () => {
      useTabBarStore.getState().setIsVisible(false);

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.xplorerFullscreen).toBe(false);
    });
  });

  // ==========================================================================
  // 4. setXplorerFullscreen
  // ==========================================================================
  describe('setXplorerFullscreen', () => {
    it('should set xplorerFullscreen to true', () => {
      useTabBarStore.getState().setXplorerFullscreen(true);
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(true);
    });

    it('should set xplorerFullscreen to false', () => {
      useTabBarStore.getState().setXplorerFullscreen(true);
      useTabBarStore.getState().setXplorerFullscreen(false);
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(false);
    });

    it('should not affect other state properties', () => {
      useTabBarStore.getState().setXplorerFullscreen(true);

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
    });
  });

  // ==========================================================================
  // 5. toggleXplorerFullscreen
  // ==========================================================================
  describe('toggleXplorerFullscreen', () => {
    it('should toggle from false to true', () => {
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(false);

      useTabBarStore.getState().toggleXplorerFullscreen();

      expect(useTabBarStore.getState().xplorerFullscreen).toBe(true);
    });

    it('should toggle from true to false', () => {
      useTabBarStore.getState().setXplorerFullscreen(true);

      useTabBarStore.getState().toggleXplorerFullscreen();

      expect(useTabBarStore.getState().xplorerFullscreen).toBe(false);
    });

    it('should toggle back and forth correctly', () => {
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(false);

      useTabBarStore.getState().toggleXplorerFullscreen();
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(true);

      useTabBarStore.getState().toggleXplorerFullscreen();
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(false);

      useTabBarStore.getState().toggleXplorerFullscreen();
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(true);
    });

    it('should not affect other state properties', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setIsVisible(false);

      useTabBarStore.getState().toggleXplorerFullscreen();

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(true);
      expect(state.isVisible).toBe(false);
      expect(state.xplorerFullscreen).toBe(true);
    });
  });

  // ==========================================================================
  // 6. reset
  // ==========================================================================
  describe('reset', () => {
    it('should reset all state to initial values', () => {
      // Modify all state values
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().setXplorerFullscreen(true);

      // Verify modified state
      expect(useTabBarStore.getState().bottomBarHidden).toBe(true);
      expect(useTabBarStore.getState().isVisible).toBe(false);
      expect(useTabBarStore.getState().xplorerFullscreen).toBe(true);

      // Reset
      useTabBarStore.getState().reset();

      // Verify reset state
      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });

    it('should be safe to call when already in initial state', () => {
      useTabBarStore.getState().reset();

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      useTabBarStore.getState().setXplorerFullscreen(true);

      useTabBarStore.getState().reset();
      useTabBarStore.getState().reset();
      useTabBarStore.getState().reset();

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });
  });

  // ==========================================================================
  // 7. tabBarStore singleton
  // ==========================================================================
  describe('tabBarStore singleton', () => {
    it('should reset store state via tabBarStore.reset()', () => {
      // Modify state
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().setXplorerFullscreen(true);

      // Reset via singleton
      tabBarStore.reset();

      // Verify reset
      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });
  });

  // ==========================================================================
  // 8. State Isolation & Combined Operations
  // ==========================================================================
  describe('State Isolation', () => {
    it('should handle multiple state changes independently', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().setXplorerFullscreen(true);

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(true);
      expect(state.isVisible).toBe(false);
      expect(state.xplorerFullscreen).toBe(true);
    });

    it('should maintain state across interleaved operations', () => {
      // Interleave different operations
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().toggleXplorerFullscreen(); // false -> true
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().toggleXplorerFullscreen(); // true -> false
      useTabBarStore.getState().setBottomBarHidden(false);

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(false);
      expect(state.xplorerFullscreen).toBe(false);
    });

    it('should reset correctly after complex state changes', () => {
      useTabBarStore.getState().setBottomBarHidden(true);
      useTabBarStore.getState().setIsVisible(false);
      useTabBarStore.getState().toggleXplorerFullscreen();
      useTabBarStore.getState().toggleXplorerFullscreen();
      useTabBarStore.getState().toggleXplorerFullscreen();

      useTabBarStore.getState().reset();

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(false);
      expect(state.isVisible).toBe(true);
      expect(state.xplorerFullscreen).toBe(false);
    });
  });

  // ==========================================================================
  // 9. Direct setState (Zustand escape hatch)
  // ==========================================================================
  describe('Direct setState', () => {
    it('should support partial state updates via setState', () => {
      useTabBarStore.setState({ bottomBarHidden: true });

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(true);
      expect(state.isVisible).toBe(true); // Unchanged
    });

    it('should support setting multiple fields at once', () => {
      useTabBarStore.setState({
        bottomBarHidden: true,
        isVisible: false,
        xplorerFullscreen: true,
      });

      const state = useTabBarStore.getState();
      expect(state.bottomBarHidden).toBe(true);
      expect(state.isVisible).toBe(false);
      expect(state.xplorerFullscreen).toBe(true);
    });
  });
});
