import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { supabase } from '../config/supabase';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import { registerDeviceSession } from '../services/deviceSession';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import { TabBarProvider } from '../context/TabBarContext';
import { UserProvider } from '../context/UserContext';
import { SmuppyIcon, SmuppyText } from '../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');
const RootStack = createStackNavigator();

// Deep linking configuration for React Navigation
const linking = {
  prefixes: [
    Linking.createURL('/'),
    'smuppy://',
  ],
  config: {
    screens: {
      Auth: {
        screens: {
          NewPassword: 'reset-password',
        },
      },
    },
  },
};

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hideSplash, setHideSplash] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState(false);
  const [justSignedUp, setJustSignedUp] = useState(false);
  const [isCheckingSignup, setIsCheckingSignup] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const lastHandledUrl = useRef(null);

  /**
   * Callback passed to NewPasswordScreen to signal recovery flow is complete
   */
  const handleRecoveryComplete = useCallback(() => {
    setPendingRecovery(false);
  }, []);

  /**
   * Handle deep link URLs for password recovery
   * Supabase sends: smuppy://reset-password#access_token=xxx&refresh_token=xxx&type=recovery
   * Also handles query params as fallback: smuppy://reset-password?access_token=xxx&...
   */
  const handleDeepLink = useCallback(async (url) => {
    if (!url) return;

    // Skip if we already handled this exact URL
    if (lastHandledUrl.current === url) return;

    // Only handle reset-password deep links
    if (!url.includes('reset-password')) return;

    let access_token = null;
    let refresh_token = null;
    let type = null;

    // Try fragment first (#access_token=...&refresh_token=...&type=recovery)
    const fragmentIndex = url.indexOf('#');
    if (fragmentIndex !== -1) {
      const fragment = url.substring(fragmentIndex + 1);
      const params = new URLSearchParams(fragment);
      access_token = params.get('access_token');
      refresh_token = params.get('refresh_token');
      type = params.get('type');
    }

    // Fallback: try query params (?access_token=...)
    if (!access_token) {
      const queryIndex = url.indexOf('?');
      if (queryIndex !== -1) {
        const query = url.substring(queryIndex + 1);
        const params = new URLSearchParams(query);
        access_token = params.get('access_token');
        refresh_token = params.get('refresh_token');
        type = params.get('type');
      }
    }

    // Only process recovery type with valid tokens
    if (type === 'recovery' && access_token && refresh_token) {
      // Mark this URL as handled
      lastHandledUrl.current = url;

      // IMPORTANT: Set pendingRecovery BEFORE setSession
      // This ensures we show NewPasswordScreen instead of Main
      setPendingRecovery(true);

      try {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) {
          console.error('[DeepLink] Failed to set session:', error.message);
          setPendingRecovery(false);
          lastHandledUrl.current = null;
        }
        // Success: pendingRecovery=true will force AuthNavigator with NewPassword
      } catch (err) {
        console.error('[DeepLink] Error setting session:', err);
        setPendingRecovery(false);
        lastHandledUrl.current = null;
      }
    }
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
        await supabase.auth.signOut();
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setSession(null);
        setEmailVerified(false);
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setEmailVerified(!!session?.user?.email_confirmed_at);
      }

      sessionLoaded = true;
      setIsReady(true);
      checkReady();
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (_event === 'SIGNED_IN' && newSession) {
        setIsCheckingSignup(true);

        const signedUp = await storage.get(STORAGE_KEYS.JUST_SIGNED_UP);
        if (signedUp === 'true') {
          setJustSignedUp(true);
        }
        setSession(newSession);
        setEmailVerified(!!newSession?.user?.email_confirmed_at);
        setIsCheckingSignup(false);

        registerDeviceSession().catch(() => {});
        return;
      }

      setSession(newSession);
      setEmailVerified(!!newSession?.user?.email_confirmed_at);

      if (_event === 'SIGNED_OUT') {
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
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, [handleDeepLink]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {isReady && (
        <UserProvider>
          <TabBarProvider>
            <NavigationContainer linking={linking}>
              <RootStack.Navigator
                screenOptions={{
                  headerShown: false,
                  animationEnabled: true,
                  cardStyleInterpolator: ({ current }) => ({
                    cardStyle: { opacity: current.progress },
                  }),
                }}
              >
                {(!session || pendingRecovery || justSignedUp || isCheckingSignup) && (
                  <RootStack.Screen
                    name="Auth"
                    component={AuthNavigator}
                    initialParams={{
                      initialRouteName: pendingRecovery ? 'NewPassword' : (justSignedUp ? 'Success' : undefined),
                      onRecoveryComplete: handleRecoveryComplete,
                      onSignupComplete: () => setJustSignedUp(false),
                    }}
                  />
                )}

                {session && !emailVerified && !pendingRecovery && !justSignedUp && !isCheckingSignup && (
                  <RootStack.Screen
                    name="EmailVerificationPending"
                    component={EmailVerificationPendingScreen}
                    initialParams={{ email: session?.user?.email }}
                  />
                )}

                {session && emailVerified && !pendingRecovery && !justSignedUp && !isCheckingSignup && (
                  <RootStack.Screen name="Main" component={MainNavigator} />
                )}
              </RootStack.Navigator>
            </NavigationContainer>
          </TabBarProvider>
        </UserProvider>
      )}

      {!hideSplash && (
        <Animated.View style={[styles.splashOverlay, { opacity: fadeAnim }]}>
          <LinearGradient
            colors={['#00B3C7', '#11E3A3', '#7BEDC6']}
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
    backgroundColor: '#11E3A3',
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
