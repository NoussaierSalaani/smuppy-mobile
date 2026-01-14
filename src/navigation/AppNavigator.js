import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, StatusBar, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../config/supabase';
import { registerDeviceSession } from '../services/deviceSession';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';
import { TabBarProvider } from '../context/TabBarContext';
import { UserProvider } from '../context/UserContext';
import { SmuppyIcon, SmuppyText } from '../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');
const RootStack = createStackNavigator();

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hideSplash, setHideSplash] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let sessionLoaded = false;
    let minTimeElapsed = false;

    const checkReady = () => {
      if (sessionLoaded && minTimeElapsed) {
        // Fade out the splash
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setHideSplash(true);
        });
      }
    };

    // Load session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      // Check if email is verified
      setEmailVerified(!!session?.user?.email_confirmed_at);
      sessionLoaded = true;
      setIsReady(true);
      checkReady();
    });

    // Listen to session changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // Update email verification status
      setEmailVerified(!!session?.user?.email_confirmed_at);

      // Register device session on sign in
      if (_event === 'SIGNED_IN' && session) {
        registerDeviceSession().catch(err => {
          console.error('[AppNavigator] Device registration failed:', err);
        });
      }
    });

    // Minimum splash display time (600ms)
    const timer = setTimeout(() => {
      minTimeElapsed = true;
      checkReady();
    }, 600);

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      
      {/* App Content - rendered in background */}
      {isReady && (
        <UserProvider>
          <TabBarProvider>
            <NavigationContainer>
              <RootStack.Navigator 
                screenOptions={{ 
                  headerShown: false,
                  animationEnabled: true,
                  cardStyleInterpolator: ({ current }) => ({
                    cardStyle: { opacity: current.progress },
                  }),
                }}
              >
                {!session && (
                  <RootStack.Screen name="Auth" component={AuthNavigator} />
                )}

                {session && !emailVerified && (
                  <RootStack.Screen
                    name="EmailVerificationPending"
                    component={EmailVerificationPendingScreen}
                    initialParams={{ email: session?.user?.email }}
                  />
                )}

                {session && emailVerified && (
                  <RootStack.Screen name="Main" component={MainNavigator} />
                )}
              </RootStack.Navigator>
            </NavigationContainer>
          </TabBarProvider>
        </UserProvider>
      )}

      {/* Splash Screen - on top, fades out */}
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
