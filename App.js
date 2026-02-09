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
import { useUserStore, useAppStore } from './src/stores';

// Push Notifications
import { initializeNotifications, registerPushToken, clearBadge, addNotificationReceivedListener, addNotificationResponseListener, parseNotificationData } from './src/services/notifications';

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
  const setUnreadNotifications = useAppStore((state) => state.setUnreadNotifications);
  const setUnreadMessages = useAppStore((state) => state.setUnreadMessages);

  useEffect(() => {
    const setupPushNotifications = async () => {
      if (user?.id) {
        await registerPushToken(user.id);
        await clearBadge();
      }
    };

    setupPushNotifications();
  }, [user?.id]);

  // Listen for incoming notifications (foreground)
  useEffect(() => {
    const receivedSub = addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('[Push] Notification received:', notification.request.content.title);
      const data = notification.request.content.data;
      // Increment badge counts based on notification type
      if (data?.type === 'message') {
        setUnreadMessages((prev) => prev + 1);
      } else {
        setUnreadNotifications((prev) => prev + 1);
      }
    });

    const responseSub = addNotificationResponseListener((response) => {
      if (__DEV__) console.log('[Push] Notification tapped');
      // Navigation is handled by useNotifications hook in MainNavigator
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [setUnreadNotifications, setUnreadMessages]);

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
          restoreQueryCache().catch(() => {}),
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
