import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator, StackCardInterpolationProps } from '@react-navigation/stack';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as backend from '../services/backend';
import { awsAuth } from '../services/aws-auth';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { registerDeviceSession } from '../services/deviceSession';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import { TabBarProvider } from '../context/TabBarContext';
import { UserProvider } from '../context/UserContext';
import { SmuppyIcon, SmuppyText } from '../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

/**
 * Root Stack Param List
 */
export type RootStackParamList = {
  Auth: {
    initialRouteName?: string;
    onRecoveryComplete?: () => void;
    onSignupComplete?: () => void;
  };
  EmailVerificationPending: { email?: string };
  Main: undefined;
};

const RootStack = createStackNavigator<RootStackParamList>();

// Deep linking configuration for React Navigation
// Using type assertion to handle nested navigators
const linking = {
  prefixes: [Linking.createURL('/'), 'smuppy://'],
  config: {
    screens: {
      Auth: {
        screens: {
          NewPassword: 'reset-password',
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
  const [isReady, setIsReady] = useState(false);
  const [hideSplash, setHideSplash] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [isCheckingSignup, setIsCheckingSignup] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const lastHandledUrl = useRef<string | null>(null);

  /**
   * Callback passed to NewPasswordScreen to signal recovery flow is complete
   */
  const handleRecoveryComplete = useCallback(() => {
    setPendingRecovery(false);
  }, []);

  /**
   * Handle deep link URLs for password recovery
   * AWS Cognito: smuppy://reset-password?code=xxx&email=xxx
   */
  const handleDeepLink = useCallback(async (url: string | null) => {
    if (!url) return;

    // Skip if we already handled this exact URL
    if (lastHandledUrl.current === url) return;

    // Only handle reset-password deep links
    if (!url.includes('reset-password')) return;

    // Mark this URL as handled
    lastHandledUrl.current = url;

    // Set pending recovery to show NewPasswordScreen
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

      const signedUp = await storage.get(STORAGE_KEYS.JUST_SIGNED_UP);
      if (signedUp === 'true') {
        setJustSignedUp(true);
      }

      if (rememberMe === 'false') {
        await backend.signOut();
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setUser(null);
        setEmailVerified(false);
      } else {
        const currentUser = await backend.getCurrentUser();
        if (currentUser) {
          // Check if email is verified via Cognito
          const isVerified = await awsAuth.isEmailVerified();
          setUser({
            id: currentUser.id,
            email: currentUser.email,
            username: currentUser.username,
            emailVerified: isVerified,
          });
          setEmailVerified(isVerified);
        } else {
          setUser(null);
          setEmailVerified(false);
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
        setIsCheckingSignup(true);

        const signedUp = await storage.get(STORAGE_KEYS.JUST_SIGNED_UP);
        if (signedUp === 'true') {
          setJustSignedUp(true);
        }

        const isVerified = await awsAuth.isEmailVerified();
        setUser({
          id: authUser.id,
          email: authUser.email,
          username: authUser.username,
          emailVerified: isVerified,
        });
        setEmailVerified(isVerified);
        setIsCheckingSignup(false);

        registerDeviceSession().catch(() => {});
      } else {
        setUser(null);
        setEmailVerified(false);
        lastHandledUrl.current = null;
        setPendingRecovery(false);
        setJustSignedUp(false);
        setIsCheckingSignup(false);
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
  }, [handleDeepLink, fadeAnim]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {isReady && (
        <UserProvider>
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
                {(!user || pendingRecovery || justSignedUp || isCheckingSignup) && (
                  <RootStack.Screen
                    name="Auth"
                    component={AuthNavigator}
                    initialParams={{
                      initialRouteName: pendingRecovery
                        ? 'NewPassword'
                        : justSignedUp
                        ? 'Success'
                        : undefined,
                      onRecoveryComplete: handleRecoveryComplete,
                      onSignupComplete: () => setJustSignedUp(false),
                    }}
                  />
                )}

                {user &&
                  !emailVerified &&
                  !pendingRecovery &&
                  !justSignedUp &&
                  !isCheckingSignup && (
                    <RootStack.Screen
                      name="EmailVerificationPending"
                      component={EmailVerificationPendingScreen}
                      initialParams={{ email: user?.email }}
                    />
                  )}

                {user &&
                  emailVerified &&
                  !pendingRecovery &&
                  !justSignedUp &&
                  !isCheckingSignup && <RootStack.Screen name="Main" component={MainNavigator} />}
              </RootStack.Navigator>
            </NavigationContainer>
          </TabBarProvider>
        </UserProvider>
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
