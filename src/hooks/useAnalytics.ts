/**
 * useAnalytics Hook
 * Easy access to analytics tracking in components
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRoute } from '@react-navigation/native';
import analytics, { EVENTS } from '../services/analytics';

interface EventProperties {
  [key: string]: string | number | boolean | undefined | null;
}

interface UseAnalyticsOptions {
  trackScreenOnMount?: boolean;
}

interface UseAnalyticsReturn {
  track: (eventName: string, properties?: EventProperties) => void;
  trackScreen: (screenName?: string, properties?: EventProperties) => void;
  trackPostInteraction: (
    action: 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave',
    postId: string
  ) => void;
  trackFollow: (targetUserId: string, isFollow: boolean) => void;
  trackError: (errorName: string, errorMessage: string, context?: string) => void;
  EVENTS: typeof EVENTS;
}

/**
 * Hook for analytics tracking
 * Automatically tracks screen views on mount if enabled
 */
export const useAnalytics = (options: UseAnalyticsOptions = {}): UseAnalyticsReturn => {
  const { trackScreenOnMount = true } = options;
  const route = useRoute();
  const hasTrackedScreen = useRef(false);

  // Track screen view on mount
  useEffect(() => {
    if (trackScreenOnMount && !hasTrackedScreen.current) {
      hasTrackedScreen.current = true;
      analytics.trackScreen(route.name);
    }
  }, [trackScreenOnMount, route.name]);

  const track = useCallback((eventName: string, properties?: EventProperties) => {
    analytics.track(eventName, properties);
  }, []);

  const trackScreen = useCallback((screenName?: string, properties?: EventProperties) => {
    analytics.trackScreen(screenName || route.name, properties);
  }, [route.name]);

  const trackPostInteraction = useCallback(
    (action: 'like' | 'unlike' | 'comment' | 'share' | 'save' | 'unsave', postId: string) => {
      analytics.trackPostInteraction(action, postId);
    },
    []
  );

  const trackFollow = useCallback((targetUserId: string, isFollow: boolean) => {
    analytics.trackFollow(targetUserId, isFollow);
  }, []);

  const trackError = useCallback(
    (errorName: string, errorMessage: string, context?: string) => {
      analytics.trackError(errorName, errorMessage, context);
    },
    []
  );

  return {
    track,
    trackScreen,
    trackPostInteraction,
    trackFollow,
    trackError,
    EVENTS,
  };
};

export default useAnalytics;
