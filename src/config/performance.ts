/**
 * Performance Configuration
 * Centralized performance settings for the app
 */

import { Platform } from 'react-native';

/**
 * FlatList/FlashList default performance props
 * Use spread operator to apply these to lists: {...FLATLIST_PERFORMANCE_PROPS}
 */
export const FLATLIST_PERFORMANCE_PROPS = {
  removeClippedSubviews: Platform.OS === 'android', // Better on Android, can cause issues on iOS
  maxToRenderPerBatch: 10,
  initialNumToRender: 10,
  windowSize: 5,
  updateCellsBatchingPeriod: 50,
};

/**
 * FlashList specific performance props
 */
export const FLASHLIST_PERFORMANCE_PROPS = {
  estimatedItemSize: 200,
  drawDistance: 250,
};

/**
 * Image loading priority levels
 */
export const IMAGE_PRIORITIES = {
  /** Above the fold, visible immediately */
  HIGH: 'high',
  /** Visible after scroll, normal priority */
  NORMAL: 'normal',
  /** Background images, preload */
  LOW: 'low',
} as const;

/**
 * Animation durations for consistent UI
 */
export const ANIMATION_DURATIONS = {
  /** Fast transitions (buttons, toggles) */
  FAST: 150,
  /** Normal transitions (modals, pages) */
  NORMAL: 250,
  /** Slow transitions (complex animations) */
  SLOW: 400,
  /** Splash/loading screens */
  SPLASH: 600,
};

/**
 * Debounce/Throttle intervals
 */
export const DEBOUNCE_INTERVALS = {
  /** Search input debounce */
  SEARCH: 300,
  /** Button press throttle */
  BUTTON: 500,
  /** Scroll event throttle */
  SCROLL: 100,
  /** Form validation debounce */
  VALIDATION: 200,
};

/**
 * Cache settings for React Query
 */
export const QUERY_CACHE_CONFIG = {
  /** Time data stays fresh before refetch */
  STALE_TIME: {
    SHORT: 30 * 1000, // 30 seconds
    MEDIUM: 5 * 60 * 1000, // 5 minutes
    LONG: 30 * 60 * 1000, // 30 minutes
    VERY_LONG: 60 * 60 * 1000, // 1 hour
  },
  /** Time data stays in cache after component unmount */
  GC_TIME: {
    SHORT: 5 * 60 * 1000, // 5 minutes
    MEDIUM: 30 * 60 * 1000, // 30 minutes
    LONG: 60 * 60 * 1000, // 1 hour
  },
  /** Number of retry attempts */
  RETRY: {
    DEFAULT: 3,
    MUTATIONS: 1,
  },
};

/**
 * Pagination settings
 */
export const PAGINATION_CONFIG = {
  /** Default page size */
  PAGE_SIZE: 20,
  /** Initial page to load */
  INITIAL_PAGE: 1,
  /** Threshold for loading more (0-1, percentage from bottom) */
  THRESHOLD: 0.5,
};

/**
 * Memory thresholds for optimization decisions
 */
export const MEMORY_THRESHOLDS = {
  /** Max images to keep in memory cache */
  MAX_IMAGE_CACHE: 100,
  /** Max items to render in virtualized lists */
  MAX_RENDERED_ITEMS: 50,
  /** Max offline queue size */
  MAX_OFFLINE_QUEUE: 100,
};

/**
 * Network retry configuration
 */
export const NETWORK_CONFIG = {
  /** Request timeout in ms */
  TIMEOUT: 30000,
  /** Retry delay in ms (doubles each retry) */
  RETRY_DELAY: 1000,
  /** Max retry attempts */
  MAX_RETRIES: 3,
};

export default {
  FLATLIST_PERFORMANCE_PROPS,
  FLASHLIST_PERFORMANCE_PROPS,
  IMAGE_PRIORITIES,
  ANIMATION_DURATIONS,
  DEBOUNCE_INTERVALS,
  QUERY_CACHE_CONFIG,
  PAGINATION_CONFIG,
  MEMORY_THRESHOLDS,
  NETWORK_CONFIG,
};
