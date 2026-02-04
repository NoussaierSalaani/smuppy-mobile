import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { NavigationContainer, LinkingOptions, DefaultTheme, DarkTheme, Theme, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator, StackCardInterpolationProps } from '@react-navigation/stack';
import { View, StyleSheet, StatusBar } from 'react-native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as backend from '../services/backend';
import { awsAuth } from '../services/aws-auth';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { getCurrentProfile } from '../services/database';
import { registerDeviceSession } from '../services/deviceSession';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import { resetAllStores } from '../stores';
import { TabBarProvider } from '../context/TabBarContext';
import { AuthCallbackProvider } from '../context/AuthCallbackContext';
import { useTheme } from '../hooks/useTheme';
import ErrorBoundary from '../components/ErrorBoundary';
import { sentryNavigationIntegration } from '../lib/sentry';

/**
 * Root Stack Param List
 */
export type RootStackParamList = {
  Auth: undefined;
  EmailVerificationPending: { email?: string };
  Main: undefined;
};

const RootStack = createStackNavigator<RootStackParamList>();

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
          NewPassword: 'reset-password',
        },
      },
      Main: {
        screens: {
          Tabs: {
            screens: {
              HomeTab: {
                screens: {
                  Feed: 'home',
                },
              },
              MessagesTab: {
                screens: {
                  Messages: 'messages',
                },
              },
              ProfileTab: {
                screens: {
                  Profile: 'my-profile',
                },
              },
            },
          },
          UserProfile: {
            path: 'profile/:userId',
            parse: {
              userId: (userId: string) => {
                // Validate UUID format to prevent navigation injection
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(userId) ? userId : '';
              },
            },
          },
          PostDetailFanFeed: {
            path: 'post/:postId',
            parse: {
              postId: (postId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(postId) ? postId : '';
              },
            },
          },
          PeakView: {
            path: 'peak/:peakId',
            parse: {
              peakId: (peakId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(peakId) ? peakId : '';
              },
            },
          },
          EventDetail: {
            path: 'event/:eventId',
            parse: {
              eventId: (eventId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(eventId) ? eventId : '';
              },
            },
          },
          BusinessProfile: {
            path: 'business/:businessId',
            parse: {
              businessId: (businessId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(businessId) ? businessId : '';
              },
            },
          },
          EventList: {
            path: 'events',
          },
          GroupDetail: {
            path: 'groups/:groupId',
            parse: {
              groupId: (groupId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(groupId) ? groupId : '';
              },
            },
          },
          CreatorOfferings: {
            path: 'creator/:creatorId/offerings',
            parse: {
              creatorId: (creatorId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(creatorId) ? creatorId : '';
              },
            },
          },
          PackPurchase: {
            path: 'packs/:packId',
            parse: {
              packId: (packId: string) => {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                return uuidRegex.test(packId) ? packId : '';
              },
            },
          },
        },
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
type AppState = 'loading' | 'auth' | 'emailPending' | 'main';

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

    const isVerified = await awsAuth.isEmailVerified();
    if (__DEV__) console.log('[Session] isEmailVerified →', isVerified);
    if (!isVerified) {
      return { state: 'emailPending', email: currentUser.email };
    }

    try {
      const { data } = await getCurrentProfile(false);
      if (__DEV__) console.log('[Session] getCurrentProfile →', data ? 'has profile' : 'no profile');
      if (data) {
        return { state: 'main', email: currentUser.email };
      }
    } catch (err) {
      if (__DEV__) console.log('[Session] getCurrentProfile error:', err);
    }

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
      // eslint-disable-next-line no-undef
      requestAnimationFrame(() => SplashScreen.hideAsync());
    };

    loadSession();

    // Listen for auth state changes (login, signup, signout)
    const unsubscribe = backend.onAuthStateChange(async (authUser) => {
      if (authUser) {
        // Guard: skip if already resolving (prevents race from rapid auth events)
        if (resolvingRef.current) return;
        resolvingRef.current = true;
        try {
          const { state, email } = await resolveAppState();
          setAppState(state);
          setUserEmail(email);
          registerDeviceSession().catch(() => {});
        } finally {
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

    Linking.getInitialURL().then(handleDeepLink);
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
                  cardStyleInterpolator: ({ current }: StackCardInterpolationProps) => ({
                    cardStyle: {
                      opacity: current.progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 1],
                      }),
                    },
                  }),
                }}
              >
                {showAuth && (
                  <RootStack.Screen
                    name="Auth"
                    component={AuthNavigator}
                  />
                )}

                {showEmailPending && (
                  <RootStack.Screen
                    name="EmailVerificationPending"
                    component={EmailVerificationPendingScreen}
                    initialParams={{ email: userEmail }}
                  />
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
