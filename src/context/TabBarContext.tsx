/**
 * TabBarContext - Compatibility Layer
 *
 * This file now re-exports from the Zustand store for backward compatibility.
 * New code should import directly from '../stores/tabBarStore'
 */

import { ReactNode } from 'react';

// Re-export everything from the store
export { useTabBar, useTabBarStore, useTabBarAnimations } from '../stores/tabBarStore';
export type { TabBarContextValue } from '../stores/tabBarStore';

/**
 * TabBarProvider - Deprecated, now a passthrough
 *
 * With Zustand, we no longer need a Context Provider.
 * This is kept for backward compatibility with existing code.
 */
export function TabBarProvider({ children }: { children: ReactNode }): ReactNode {
  return children;
}
