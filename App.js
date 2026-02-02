// Note: crypto polyfill is loaded in index.js (must be first import)
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { View } from 'react-native';

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
import { useUserStore, useAppStore } from './src/stores';

// Push Notifications
import { initializeNotifications, registerPushToken, clearBadge } from './src/services/notifications';

// Backend Services
import { initializeBackend } from './src/services/backend';

// Map
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';

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

    async function initializeApp() {
      try {
        initSentry();
      } catch (e) {
        if (__DEV__) console.warn('[Sentry] init failed:', e);
      }

      // Initialize Mapbox globally before any map component renders
      try {
        const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
        if (mapboxToken) {
          Mapbox.setAccessToken(mapboxToken);
        }
      } catch (e) {
        if (__DEV__) console.warn('[Mapbox] init failed:', e);
      }

      try {
        // Run independent init tasks in parallel for faster startup
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
            <View style={{ flex: 1 }}>
              <AppNavigator />
            </View>
          </SmuppyAlertProvider>
        </QueryClientProvider>
      </ErrorBoundary>
        </ThemeProvider>
    </SafeAreaProvider>
  );
}
