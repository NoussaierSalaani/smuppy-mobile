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
import { SmuppyIcon, SmuppyText } from '../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

/**
 * Root Stack Param List
 */
export type RootStackParamList = {
  Auth: {
    initialRouteName?: string;
    onRecoveryComplete?: () => void;
    onProfileCreated?: () => void;
  };
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
              userId: (userId: string) => userId,
            },
          },
          PostDetailFanFeed: {
            path: 'post/:postId',
            parse: {
              postId: (postId: string) => postId,
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

// User type for AWS Cognito
interface AppUser {
  id: string;
  email: string;
  username?: string;
  emailVerified?: boolean;
}

export default function AppNavigator(): React.JSX.Element {
  const [user, setUser] = useState<AppUser | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hideSplash, setHideSplash] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const lastHandledUrl = useRef<string | null>(null);

  const handleRecoveryComplete = useCallback(() => {
    setPendingRecovery(false);
  }, []);

  const handleProfileCreated = useCallback(() => {
    setHasProfile(true);
  }, []);

  /**
   * Check if the current user has a profile (without auto-creating one)
   */
  const checkProfile = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await getCurrentProfile(false);
      return !!data;
    } catch {
      return false;
    }
  }, []);

  const handleDeepLink = useCallback(async (url: string | null) => {
    if (!url) return;
    if (lastHandledUrl.current === url) return;
    if (!url.includes('reset-password')) return;
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
        setUser(null);
        setEmailVerified(false);
        setHasProfile(null);
      } else {
        const currentUser = await backend.getCurrentUser();
        if (currentUser) {
          const isVerified = await awsAuth.isEmailVerified();
          setUser({
            id: currentUser.id,
            email: currentUser.email,
            username: currentUser.username,
            emailVerified: isVerified,
          });
          setEmailVerified(isVerified);

          // Check profile existence
          if (isVerified) {
            const profileExists = await checkProfile();
            setHasProfile(profileExists);
          } else {
            setHasProfile(null);
          }
        } else {
          setUser(null);
          setEmailVerified(false);
          setHasProfile(null);
        }
      }

      sessionLoaded = true;
      setIsReady(true);
      checkReady();
    };

    loadSession();

    // Listen for auth state changes
    const unsubscribe = backend.onAuthStateChange(async (authUser) => {
      if (authUser) {
        const isVerified = await awsAuth.isEmailVerified();
        setUser({
          id: authUser.id,
          email: authUser.email,
          username: authUser.username,
          emailVerified: isVerified,
        });
        setEmailVerified(isVerified);

        // Check profile existence
        if (isVerified) {
          const profileExists = await checkProfile();
          setHasProfile(profileExists);
        } else {
          setHasProfile(null);
        }

        registerDeviceSession().catch(() => {});
      } else {
        setUser(null);
        setEmailVerified(false);
        setHasProfile(null);
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
  }, [handleDeepLink, fadeAnim, checkProfile]);

  // Determine which screen to show
  const showAuth = !user || pendingRecovery;
  const showEmailPending = user && !emailVerified && !pendingRecovery;
  const showOnboarding = user && emailVerified && hasProfile === false && !pendingRecovery;
  const showMain = user && emailVerified && hasProfile === true && !pendingRecovery;
  // hasProfile === null while loading → keep showing splash/current state

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {isReady && (
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
                {/* No user, or pending recovery → Auth (Login/Signup/VerifyCode) */}
                {(showAuth || showOnboarding) && (
                  <RootStack.Screen
                    name="Auth"
                    component={AuthNavigator}
                    initialParams={{
                      initialRouteName: pendingRecovery
                        ? 'NewPassword'
                        : showOnboarding
                        ? 'AccountType'
                        : undefined,
                      onRecoveryComplete: handleRecoveryComplete,
                      onProfileCreated: handleProfileCreated,
                    }}
                  />
                )}

                {/* User authenticated but email not verified */}
                {showEmailPending && (
                  <RootStack.Screen
                    name="EmailVerificationPending"
                    component={EmailVerificationPendingScreen}
                    initialParams={{ email: user?.email }}
                  />
                )}

                {/* User authenticated, email verified, has profile → Main */}
                {showMain && (
                  <RootStack.Screen name="Main" component={MainNavigator} />
                )}
            </RootStack.Navigator>
          </NavigationContainer>
        </TabBarProvider>
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
