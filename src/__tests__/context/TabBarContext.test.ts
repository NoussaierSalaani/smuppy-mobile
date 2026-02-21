/**
 * TabBarContext Tests
 * Tests for the TabBarContext compatibility layer.
 *
 * TabBarContext is a passthrough that re-exports hooks/types from tabBarStore
 * and provides a no-op TabBarProvider for backward compatibility.
 */

// Mock the tabBarStore dependency
const mockUseTabBar = jest.fn();
const mockUseTabBarStore = jest.fn();
const mockUseTabBarAnimations = jest.fn();

jest.mock('../../stores/tabBarStore', () => ({
  useTabBar: mockUseTabBar,
  useTabBarStore: mockUseTabBarStore,
  useTabBarAnimations: mockUseTabBarAnimations,
}));

import {
  TabBarProvider,
  useTabBar,
  useTabBarStore,
  useTabBarAnimations,
} from '../../context/TabBarContext';

describe('TabBarContext', () => {
  // ==========================================================================
  // 1. Re-exports
  // ==========================================================================
  describe('Re-exports', () => {
    it('should re-export useTabBar from tabBarStore', () => {
      expect(useTabBar).toBe(mockUseTabBar);
    });

    it('should re-export useTabBarStore from tabBarStore', () => {
      expect(useTabBarStore).toBe(mockUseTabBarStore);
    });

    it('should re-export useTabBarAnimations from tabBarStore', () => {
      expect(useTabBarAnimations).toBe(mockUseTabBarAnimations);
    });
  });

  // ==========================================================================
  // 2. TabBarProvider
  // ==========================================================================
  describe('TabBarProvider', () => {
    it('should be a function', () => {
      expect(typeof TabBarProvider).toBe('function');
    });

    it('should return children as-is (passthrough)', () => {
      const children = 'test-children';
      const result = TabBarProvider({ children });
      expect(result).toBe(children);
    });

    it('should return null children as-is', () => {
      const result = TabBarProvider({ children: null as unknown as import('react').ReactNode });
      expect(result).toBeNull();
    });

    it('should return complex children as-is', () => {
      const children = { type: 'div', props: { id: 'test' } };
      const result = TabBarProvider({ children: children as unknown as import('react').ReactNode });
      expect(result).toBe(children);
    });
  });
});
