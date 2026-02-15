// Note: crypto polyfill is loaded in index.js (must be first import)
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { View, AppState as RNAppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';

// Core
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';

// Performance & Monitoring
import { queryClient, restoreQueryCache, persistQueryCache } from './src/lib/queryClient';
import { initSentry, setUserContext } from './src/lib/sentry';
import { rateLimiter } from './src/utils/rateLimiter';
import { useUserStore } from './src/stores/userStore';
import { useAppStore } from './src/stores/appStore';

// Push Notifications
import { initializeNotifications, registerPushToken, clearBadge } from './src/services/notifications';

// Backend Services
import { initializeBackend } from './src/services/backend';

// Map — lazy-loaded to reduce cold start time
import { ENV } from './src/config/env';

// UI Components
import { SmuppyAlertProvider } from './src/context/SmuppyAlertContext';
import { ThemeProvider } from './src/context/ThemeContext';


/**
 * Network Monitor Component
 * Tracks online/offline status globally
 */
const NetworkMonitor = () => {
  const setOnline = useAppStore((state) => state.setOnline);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null initially, treat null as online
      const isOnline = state.isConnected && (state.isInternetReachable !== false);
      setOnline(isOnline);
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
        await registerPushToken(user.id);
        await clearBadge();
      }
    };

    setupPushNotifications();
  }, [user?.id]);

  // BUG-2026-02-15: Removed duplicate notification listeners here.
  // Badge increment + tap navigation are handled by useNotifications in MainNavigator.
  // Having listeners in both places caused badge count to increment x2 per notification.

  return null;
};

/**
 * Cache Persistence
 * Saves query cache when app goes to background
 */
const CachePersistence = () => {
  useEffect(() => {
    // Cache is restored in initializeApp() Promise.all — no need to restore here

    // Persist cache periodically (every 5 minutes)
    const interval = setInterval(() => {
      persistQueryCache();
    }, 5 * 60 * 1000);

    // Persist when app goes to background (more reliable than timer)
    const appStateSub = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        persistQueryCache();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
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

    async function initializeApp() {
      try {
        initSentry();
      } catch (e) {
        if (__DEV__) console.warn('[Sentry] init failed:', e);
      }

      // Initialize Mapbox lazily — async dynamic import to avoid blocking JS thread
      import('@rnmapbox/maps').then((module) => {
        module.default.setAccessToken(ENV.MAPBOX_ACCESS_TOKEN);
      }).catch((e) => {
        if (__DEV__) console.warn('[Mapbox] init failed:', e);
      });

      try {
        // Run independent init tasks in parallel for faster startup
        // restoreQueryCache() runs here so data is ready BEFORE first render
        await Promise.all([
          Font.loadAsync({
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
          }),
          rateLimiter.init(),
          initializeNotifications(),
          initializeBackend(),
        ]);
        // Restore query cache after TTI (non-blocking) to reduce cold start
        restoreQueryCache().catch(() => {});
      } catch (error) {
        if (__DEV__) console.error('Error initializing app:', error);
      } finally {
        if (isMounted) {
          setAppReady(true);
        }
      }
    }

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!appReady) {
    return <View style={{ flex: 1, backgroundColor: '#0EBF8A' }} />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
      <ErrorBoundary showReportButton>
        <QueryClientProvider client={queryClient}>
          <NetworkMonitor />
          <UserContextSync />
          <CachePersistence />
          <PushNotificationHandler />
          <SmuppyAlertProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <AppNavigator />
            </GestureHandlerRootView>
          </SmuppyAlertProvider>
        </QueryClientProvider>
      </ErrorBoundary>
        </ThemeProvider>
    </SafeAreaProvider>
  );
}
