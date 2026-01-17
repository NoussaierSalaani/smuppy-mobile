import { useEffect, useState, useCallback } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';

// Core
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

// Performance & Monitoring
import { queryClient, restoreQueryCache, persistQueryCache } from './src/lib/queryClient';
import { initSentry, setUserContext } from './src/lib/sentry';
import { rateLimiter } from './src/utils/rateLimiter';
import { useUserStore, useAppStore } from './src/stores';

// Push Notifications
import { initializeNotifications, registerPushToken, clearBadge } from './src/services/notifications';

/**
 * Network Monitor Component
 * Tracks online/offline status globally
 */
const NetworkMonitor = () => {
  const setOnline = useAppStore((state) => state.setOnline);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected && state.isInternetReachable);
    });

    return () => unsubscribe();
  }, [setOnline]);

  return null;
};

/**
 * User Context Sync
 * Syncs user data with Sentry for error tracking
 */
const UserContextSync = () => {
  const user = useUserStore((state) => state.user);

  useEffect(() => {
    setUserContext(user);
  }, [user]);

  return null;
};

/**
 * Push Notification Handler
 * Registers for push notifications when user logs in
 */
const PushNotificationHandler = () => {
  const user = useUserStore((state) => state.user);

  useEffect(() => {
    const setupPushNotifications = async () => {
      if (user?.id) {
        // Register push token for this user
        await registerPushToken(user.id);
        // Clear badge when app opens
        await clearBadge();
      }
    };

    setupPushNotifications();
  }, [user?.id]);

  return null;
};

/**
 * Cache Persistence
 * Saves query cache when app goes to background
 */
const CachePersistence = () => {
  useEffect(() => {
    // Restore cache on mount
    restoreQueryCache();

    // Persist cache periodically (every 5 minutes)
    const interval = setInterval(() => {
      persistQueryCache();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
      // Persist on unmount
      persistQueryCache();
    };
  }, []);

  return null;
};

export default function App() {
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const forceReady = async () => {
      if (!isMounted) return;
      setAppReady(true);
      try {
        await SplashScreen.hideAsync();
      } catch {
        // best-effort: never crash on splash hide
      }
    };

    const watchdog = setTimeout(() => {
      forceReady();
    }, 8000);

    async function initializeApp() {
      try {
        // IMPORTANT: do this inside effect (not module-level)
        try {
          await SplashScreen.preventAutoHideAsync();
        } catch {
          // best-effort
        }

        // Initialize Sentry inside effect so it can't crash module evaluation
        try {
          initSentry();
        } catch (e) {
          console.warn('[Sentry] init failed:', e);
        }

        // Load fonts
        await Font.loadAsync({
          'WorkSans-Regular': require('./assets/fonts/WorkSans-Regular.ttf'),
          'WorkSans-Medium': require('./assets/fonts/WorkSans-Medium.ttf'),
          'WorkSans-SemiBold': require('./assets/fonts/WorkSans-SemiBold.ttf'),
          'WorkSans-Bold': require('./assets/fonts/WorkSans-Bold.ttf'),
          'WorkSans-ExtraBold': require('./assets/fonts/WorkSans-ExtraBold.ttf'),
          'Poppins-Regular': require('./assets/fonts/Poppins-Regular.ttf'),
          'Poppins-Medium': require('./assets/fonts/Poppins-Medium.ttf'),
          'Poppins-SemiBold': require('./assets/fonts/Poppins-SemiBold.ttf'),
          'Poppins-Bold': require('./assets/fonts/Poppins-Bold.ttf'),
          'Poppins-ExtraBold': require('./assets/fonts/Poppins-ExtraBold.ttf'),
        });

        // Initialize rate limiter (load persisted data)
        await rateLimiter.init();

        // Initialize push notifications (Android channels, etc.)
        await initializeNotifications();

        // Restore query cache
        await restoreQueryCache();
      } catch (error) {
        console.log('Error initializing app:', error);
      } finally {
        clearTimeout(watchdog);
        await forceReady(); // ALWAYS unlock UI + hide splash
      }
    }

    initializeApp();

    return () => {
      isMounted = false;
      clearTimeout(watchdog);
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      try {
        await SplashScreen.hideAsync();
      } catch {}
    }
  }, [appReady]);

  if (!appReady) {
    return null; // Wait for initialization
  }

  return (
    <ErrorBoundary showReportButton>
      <QueryClientProvider client={queryClient}>
        {/* Global monitors (no UI) */}
        <NetworkMonitor />
        <UserContextSync />
        <CachePersistence />
        <PushNotificationHandler />

        {/* Main app */}
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          <AppNavigator />
        </View>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
