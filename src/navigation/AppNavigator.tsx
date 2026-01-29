import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator, StackCardInterpolationProps } from '@react-navigation/stack';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as backend from '../services/backend';
import { awsAuth } from '../services/aws-auth';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { getCurrentProfile } from '../services/database';
import { registerDeviceSession } from '../services/deviceSession';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import { TabBarProvider } from '../context/TabBarContext';
import { AuthCallbackProvider } from '../context/AuthCallbackContext';
import { SmuppyIcon, SmuppyText } from '../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

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
              peakId: (peakId: string) => peakId,
            },
          },
          EventDetail: {
            path: 'event/:eventId',
            parse: {
              eventId: (eventId: string) => eventId,
            },
          },
          ChallengeDetail: {
            path: 'challenge/:challengeId',
            parse: {
              challengeId: (challengeId: string) => challengeId,
            },
          },
          BusinessProfile: {
            path: 'business/:businessId',
            parse: {
              businessId: (businessId: string) => businessId,
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
  const [appState, setAppState] = useState<AppState>('loading');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [hideSplash, setHideSplash] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
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
    if (!currentUser) {
      return { state: 'auth', email: '' };
    }

    const isVerified = await awsAuth.isEmailVerified();
    if (!isVerified) {
      return { state: 'emailPending', email: currentUser.email };
    }

    try {
      const { data } = await getCurrentProfile(false);
      if (data) {
        return { state: 'main', email: currentUser.email };
      }
    } catch {
      // Profile check failed - treat as no profile
    }

    // User exists + verified but no profile → still 'auth'
    // (Login/Signup screens navigate to AccountType internally)
    return { state: 'auth', email: currentUser.email };
  }, []);

  const handleDeepLink = useCallback(async (url: string | null) => {
    if (!url) return;
    if (lastHandledUrl.current === url) return;
    if (!url.includes('reset-password')) return;
    // Validate origin: only accept deep links from Smuppy domains or scheme
    const isSmuppyOrigin = url.startsWith('smuppy://') ||
      url.startsWith('https://smuppy.com') ||
      url.startsWith('https://www.smuppy.com') ||
      url.startsWith('https://app.smuppy.com') ||
      url.startsWith('exp://'); // Expo dev
    if (!isSmuppyOrigin) return;
    lastHandledUrl.current = url;
    setPendingRecovery(true);
  }, []);

  useEffect(() => {
    let sessionLoaded = false;
    let minTimeElapsed = false;

    const checkReady = () => {
      if (sessionLoaded && minTimeElapsed) {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setHideSplash(true);
        });
      }
    };

    const loadSession = async () => {
      const rememberMe = await storage.get(STORAGE_KEYS.REMEMBER_ME);

      if (rememberMe === 'false') {
        await backend.signOut();
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setAppState('auth');
      } else {
        const { state, email } = await resolveAppState();
        setAppState(state);
        setUserEmail(email);
      }

      sessionLoaded = true;
      setIsReady(true);
      checkReady();
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
        setAppState('auth');
        setUserEmail('');
        lastHandledUrl.current = null;
        setPendingRecovery(false);
      }
    });

    const timer = setTimeout(() => {
      minTimeElapsed = true;
      checkReady();
    }, 600);

    Linking.getInitialURL().then(handleDeepLink);
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
      linkingSubscription.remove();
    };
  }, [handleDeepLink, fadeAnim, resolveAppState]);

  // Simple state → screen mapping
  const showAuth = appState === 'auth' || appState === 'loading' || pendingRecovery;
  const showEmailPending = appState === 'emailPending' && !pendingRecovery;
  const showMain = appState === 'main' && !pendingRecovery;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {isReady && (
        <AuthCallbackProvider value={{ onRecoveryComplete: handleRecoveryComplete, onProfileCreated: handleProfileCreated }}>
        <TabBarProvider>
          <NavigationContainer linking={linking}>
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
        </TabBarProvider>
        </AuthCallbackProvider>
      )}

      {!hideSplash && (
        <Animated.View style={[styles.splashOverlay, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={['#00B3C7', '#0EBF8A', '#7BEDC6']}
            locations={[0, 0.5, 1]}
            style={styles.gradient}
          >
            <View style={styles.logoContainer}>
              <SmuppyIcon size={100} variant="dark" />
            </View>
            <View style={styles.bottomContainer}>
              <Text style={styles.fromText}>from</Text>
              <SmuppyText width={90} variant="dark" />
            </View>
          </LinearGradient>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0EBF8A',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  gradient: {
    flex: 1,
    width,
    height,
  },
  logoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomContainer: {
    paddingBottom: 50,
    alignItems: 'center',
  },
  fromText: {
    fontSize: 12,
    fontWeight: '300',
    color: '#0A252F',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
});
