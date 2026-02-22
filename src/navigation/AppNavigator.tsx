import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import { NavigationContainer, LinkingOptions, DefaultTheme, DarkTheme, Theme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, StyleSheet, StatusBar } from 'react-native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import * as backend from '../services/backend';
import { awsAuth } from '../services/aws-auth';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { getCurrentProfile } from '../services/database';
import { registerDeviceSession } from '../services/deviceSession';
import MainNavigator from './MainNavigator';

// CRITICAL: Must run at module load in a non-lazy-loaded file.
// Handles the OAuth redirect callback when the app is (re)opened via a
// custom URL scheme (e.g. Google Sign-In reverse-client-ID redirect).
// Previously lived in socialAuth.ts (imported by AuthNavigator) which is
// lazy-loaded — too late if the app restarts via the OAuth redirect URL.
WebBrowser.maybeCompleteAuthSession();

// Lazy-load AuthNavigator to avoid evaluating 20 auth screen modules for logged-in users (~100-400ms saved)
const AuthNavigator = React.lazy(() => import('./AuthNavigator'));
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import AccountSuspendedScreen from '../screens/moderation/AccountSuspendedScreen';
import AccountBannedScreen from '../screens/moderation/AccountBannedScreen';
import { resetAllStores } from '../stores';
import { useModerationStore } from '../stores/moderationStore';
import { TabBarProvider } from '../context/TabBarContext';
import { AuthCallbackProvider } from '../context/AuthCallbackContext';
import { useTheme } from '../hooks/useTheme';
import ErrorBoundary from '../components/ErrorBoundary';
import { sentryNavigationIntegration } from '../lib/sentry';
import { isValidUUID } from '../utils/formatters';
import { FEATURES } from '../config/featureFlags';

/**
 * Root Stack Param List
 */
export type RootStackParamList = {
  Auth: undefined;
  EmailVerificationPending: { email?: string };
  AccountSuspended: undefined;
  AccountBanned: undefined;
  Main: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Build deep link screen map conditionally based on feature flags
const buildMainScreens = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- React Navigation linking config uses dynamic screen map
  const screens: Record<string, any> = {
    Tabs: {
      screens: {
        Home: 'home',
        Peaks: 'peaks',
        Messages: 'messages',
        Profile: 'my-profile',
      },
    },
    UserProfile: {
      path: 'profile/:userId',
      parse: { userId: (userId: string) => isValidUUID(userId) ? userId : '' },
    },
    PostDetailFanFeed: {
      path: 'post/:postId',
      parse: { postId: (postId: string) => isValidUUID(postId) ? postId : '' },
    },
    PeakView: {
      path: 'peak/:peakId',
      parse: { peakId: (peakId: string) => isValidUUID(peakId) ? peakId : '' },
    },
    ActivityDetail: {
      path: 'activity/:activityId/:activityType',
      parse: {
        activityId: (activityId: string) => isValidUUID(activityId) ? activityId : '',
        activityType: (activityType: string) => activityType === 'group' ? 'group' : 'event',
      },
    },
    EventList: { path: 'events' },
  };

  if (FEATURES.BUSINESS_DISCOVERY) {
    screens.BusinessProfile = {
      path: 'business/:businessId',
      parse: { businessId: (businessId: string) => isValidUUID(businessId) ? businessId : '' },
    };
  }

  if (FEATURES.CHANNEL_SUBSCRIBE) {
    screens.CreatorOfferings = {
      path: 'creator/:creatorId/offerings',
      parse: { creatorId: (creatorId: string) => isValidUUID(creatorId) ? creatorId : '' },
    };
    screens.PackPurchase = {
      path: 'packs/:packId',
      parse: { packId: (packId: string) => isValidUUID(packId) ? packId : '' },
    };
    screens.SubscriptionSuccess = 'checkout/subscription-success';
  }

  if (FEATURES.PRIVATE_SESSIONS) {
    screens.SessionBooked = 'checkout/session-booked';
  }

  if (FEATURES.BUSINESS_BOOKING) {
    screens.BusinessSubscriptionSuccess = 'checkout/business-subscription-success';
  }

  return screens;
};

// Deep linking configuration for React Navigation
const linking = {
  prefixes: [
    Linking.createURL('/'),
    'smuppy://',
    'https://smuppy.com',
    'https://www.smuppy.com',
    'https://app.smuppy.com',
  ],
  config: {
    screens: {
      Auth: {
        screens: {
          NewPassword: 'reset-password', // NOSONAR
        },
      },
      Main: {
        screens: buildMainScreens(),
      },
    },
  },
} as LinkingOptions<RootStackParamList>;

/**
 * App state: 'loading' | 'auth' | 'emailPending' | 'main'
 *
 * - 'auth': no user, or user without profile → show Auth navigator
 *   (Auth screens handle internal navigation: Login, Signup, VerifyCode, Onboarding)
 * - 'emailPending': user exists but email not verified
 * - 'main': user exists + email verified + has profile
 */
type AppState = 'loading' | 'auth' | 'emailPending' | 'suspended' | 'banned' | 'main';

export default function AppNavigator(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Register navigation container with Sentry for automatic screen tracking
  useEffect(() => {
    if (sentryNavigationIntegration && navigationRef) {
      sentryNavigationIntegration.registerNavigationContainer(navigationRef);
    }
  }, [navigationRef]);

  const navigationTheme = useMemo<Theme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.dark,
        border: colors.grayBorder,
        notification: colors.primary,
      },
    };
  }, [isDark, colors]);

  const [appState, setAppState] = useState<AppState>('loading');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const lastHandledUrl = useRef<string | null>(null);
  const resolvingRef = useRef(false);

  // Subscribe to moderation store — redirect to suspended/banned screens
  const moderationStatus = useModerationStore((s) => s.status);
  useEffect(() => {
    if (moderationStatus === 'suspended') {
      setAppState('suspended');
    } else if (moderationStatus === 'banned') {
      setAppState('banned');
    }
  }, [moderationStatus]);

  const handleRecoveryComplete = useCallback(() => {
    setPendingRecovery(false);
  }, []);

  const handleProfileCreated = useCallback(() => {
    setAppState('main');
  }, []);

  /**
   * Determine app state from current auth + profile status
   */
  const resolveAppState = useCallback(async (): Promise<{ state: AppState; email: string }> => {
    const currentUser = await backend.getCurrentUser();
    if (__DEV__) console.log('[Session] getCurrentUser →', currentUser ? currentUser.email : 'null');
    if (!currentUser) {
      return { state: 'auth', email: '' };
    }

    // Parallelize email verification + profile fetch to reduce cold start
    // BUG-2026-02-20: Use autoCreate=true so social auth users (who bypass the
    // LoginScreen.handleLogin → AccountType navigation) get a profile created
    // automatically. Without this, authenticated users without profiles get stuck
    // in 'auth' state (login screen) despite being authenticated.
    const [isVerified, profileResult] = await Promise.all([
      awsAuth.isEmailVerified(),
      getCurrentProfile(true).catch(() => ({ data: null })),
    ]);
    if (__DEV__) console.log('[Session] isEmailVerified →', isVerified, 'hasProfile →', !!profileResult.data);

    if (!isVerified) {
      return { state: 'emailPending', email: currentUser.email };
    }

    if (profileResult.data) {
      return { state: 'main', email: currentUser.email };
    }

    // Fallback: profile auto-creation failed — still authenticated but can't proceed
    if (__DEV__) console.warn('[Session] Authenticated user has no profile and auto-create failed');
    return { state: 'auth', email: currentUser.email };
  }, []);

  const handleDeepLink = useCallback(async (url: string | null) => {
    if (!url) return;
    if (lastHandledUrl.current === url) return;
    if (!url.includes('reset-password')) return;
    // Validate origin: only accept deep links from Smuppy domains or scheme
    const ALLOWED_HOSTNAMES = ['smuppy.com', 'www.smuppy.com', 'app.smuppy.com'];
    let isSmuppyOrigin = url.startsWith('smuppy://') || url.startsWith('exp://');
    if (!isSmuppyOrigin) {
      try {
        const parsed = new URL(url);
        isSmuppyOrigin = parsed.protocol === 'https:' && ALLOWED_HOSTNAMES.includes(parsed.hostname);
      } catch {
        isSmuppyOrigin = false;
      }
    }
    if (!isSmuppyOrigin) return;
    lastHandledUrl.current = url;
    setPendingRecovery(true);
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      const rememberMe = await storage.get(STORAGE_KEYS.REMEMBER_ME);
      if (__DEV__) console.log('[Session] rememberMe flag:', rememberMe);

      if (rememberMe === 'false') {
        if (__DEV__) console.log('[Session] rememberMe=false → signing out');
        await backend.signOut();
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setAppState('auth');
      } else {
        let { state, email } = await resolveAppState();
        if (__DEV__) console.log('[Session] resolveAppState →', state, email);

        // If Remember Me is set but session resolution failed (e.g. network not ready),
        // retry once after a short delay
        if (state === 'auth' && rememberMe === 'true') {
          if (__DEV__) console.log('[Session] Retrying after 500ms...');
          await new Promise(resolve => setTimeout(resolve, 500));
          const retry = await resolveAppState();
          state = retry.state;
          email = retry.email;
          if (__DEV__) console.log('[Session] Retry result →', state, email);
        }

        setAppState(state);
        setUserEmail(email);
      }

      setIsReady(true);
      requestAnimationFrame(() => SplashScreen.hideAsync());
    };

    void loadSession();

    // Listen for auth state changes (login, signup, signout)
    const unsubscribe = backend.onAuthStateChange(async (authUser) => {
      if (authUser) {
        // Guard: skip if already resolving (prevents race from rapid auth events)
        if (resolvingRef.current) return;
        resolvingRef.current = true;
        // Timeout: prevent hanging forever if resolveAppState is stuck
        const timeoutId = setTimeout(() => {
          if (resolvingRef.current) {
            resolvingRef.current = false;
            if (__DEV__) console.warn('[AppNavigator] resolveAppState timed out after 15s');
          }
        }, 15000);
        try {
          const { state, email } = await resolveAppState();
          setAppState(state);
          setUserEmail(email);
          registerDeviceSession().catch((err) => {
            if (__DEV__) console.warn('[AppNavigator] registerDeviceSession failed:', err);
          });
        } finally {
          clearTimeout(timeoutId);
          resolvingRef.current = false;
        }
      } else {
        // SECURITY: Reset all cached stores on logout to prevent data leaking
        // between user sessions (User A's data visible to User B)
        resetAllStores();
        setAppState('auth');
        setUserEmail('');
        lastHandledUrl.current = null;
        setPendingRecovery(false);
      }
    });

    Linking.getInitialURL().then(handleDeepLink).catch(() => { /* deep link unavailable */ });
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      unsubscribe();
      linkingSubscription.remove();
    };
  }, [handleDeepLink, resolveAppState]);

  // Simple state → screen mapping
  const showAuth = appState === 'auth' || appState === 'loading' || pendingRecovery;
  const showEmailPending = appState === 'emailPending' && !pendingRecovery;
  const showSuspended = appState === 'suspended' && !pendingRecovery;
  const showBanned = appState === 'banned' && !pendingRecovery;
  const showMain = appState === 'main' && !pendingRecovery;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />

      {isReady && (
        <AuthCallbackProvider value={{ onRecoveryComplete: handleRecoveryComplete, onProfileCreated: handleProfileCreated }}>
        <TabBarProvider>
          <ErrorBoundary name="AppNavigator">
          <NavigationContainer ref={navigationRef} linking={linking} theme={navigationTheme}>
            <RootStack.Navigator
                id="RootStack"
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                }}
              >
                {showAuth && (
                  <RootStack.Screen name="Auth">
                    {() => (
                      <Suspense fallback={<View style={{ flex: 1, backgroundColor: colors.background }} />}>
                        <AuthNavigator />
                      </Suspense>
                    )}
                  </RootStack.Screen>
                )}

                {showEmailPending && (
                  <RootStack.Screen
                    name="EmailVerificationPending"
                    component={EmailVerificationPendingScreen}
                    initialParams={{ email: userEmail }}
                  />
                )}

                {showSuspended && (
                  <RootStack.Screen name="AccountSuspended" component={AccountSuspendedScreen} />
                )}

                {showBanned && (
                  <RootStack.Screen name="AccountBanned" component={AccountBannedScreen} />
                )}

                {showMain && (
                  <RootStack.Screen name="Main" component={MainNavigator} />
                )}
            </RootStack.Navigator>
          </NavigationContainer>
          </ErrorBoundary>
        </TabBarProvider>
        </AuthCallbackProvider>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
