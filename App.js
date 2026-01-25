// Polyfill for crypto.getRandomValues (required by AWS SDK)
import 'react-native-get-random-values';

import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { View } from 'react-native';
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
import { initializeBackend, isUsingAWS } from './src/services/backend';

// UI Components
import OfflineBanner from './src/components/OfflineBanner';

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
      // Hide native splash immediately - our React splash takes over
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Ignore - splash may already be hidden
      }

      try {
        initSentry();
      } catch (e) {
        console.warn('[Sentry] init failed:', e);
      }

      try {
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

        await rateLimiter.init();
        await initializeNotifications();

        // Initialize backend (loads AWS/Supabase preference)
        await initializeBackend();
        if (__DEV__) {
          console.log(`[Backend] Using ${isUsingAWS() ? 'AWS' : 'Supabase'} backend`);
        }
      } catch (error) {
        console.error('Error initializing app:', error);
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
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary showReportButton>
        <QueryClientProvider client={queryClient}>
          <NetworkMonitor />
          <UserContextSync />
          <CachePersistence />
          <PushNotificationHandler />
          <View style={{ flex: 1 }}>
            <AppNavigator />
            <OfflineBanner />
          </View>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
