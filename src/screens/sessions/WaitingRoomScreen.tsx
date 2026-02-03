// src/screens/sessions/WaitingRoomScreen.tsx
import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptimizedImage from '../../components/OptimizedImage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { awsAPI } from '../../services/aws-api';

const POLL_INTERVAL = 3000; // Poll every 3 seconds

export default function WaitingRoomScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();

  const { sessionId, creator } = route.params || {
    sessionId: null,
    creator: {
      id: '',
      name: 'Creator',
      avatar: null,
    },
  };

  const { showAlert } = useSmuppyAlert();
  const [isPolling, setIsPolling] = useState(true);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for avatar ring
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dots animation
  useEffect(() => {
    const dots = Animated.loop(
      Animated.timing(dotAnim, {
        toValue: 3,
        duration: 1500,
        useNativeDriver: false,
      })
    );
    dots.start();
    return () => dots.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    setIsPolling(false);
    navigation.goBack();
  };

  // Poll for session status to check if creator accepted
  const checkSessionStatus = useCallback(async () => {
    if (!sessionId) {
      // No sessionId - this is a demo mode, auto-transition after 5 seconds
      return;
    }

    try {
      const response = await awsAPI.getSession(sessionId);
      if (response.success && response.session) {
        const { status } = response.session;

        if (status === 'confirmed') {
          // Creator accepted - go to call
          setIsPolling(false);
          navigation.replace('PrivateCall', { sessionId, creator });
        } else if (status === 'cancelled') {
          // Creator declined or session cancelled
          setIsPolling(false);
          showAlert({
            title: 'Session Declined',
            message: 'The creator was unable to accept your session request.',
            type: 'error',
            buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
          });
        }
        // If status is still 'pending', continue polling
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to check session status:', error);
    }
  }, [sessionId, creator, navigation, showAlert]);

  // Poll for session status
  useEffect(() => {
    if (!sessionId) {
      // Demo mode - auto-transition after 5 seconds
      const timer = setTimeout(() => {
        navigation.replace('PrivateCall', { creator });
      }, 5000);
      return () => clearTimeout(timer);
    }

    // Real mode - poll for status
    const pollInterval = setInterval(() => {
      if (isPolling) {
        checkSessionStatus();
      }
    }, POLL_INTERVAL);

    // Initial check
    checkSessionStatus();

    return () => clearInterval(pollInterval);
  }, [sessionId, isPolling, checkSessionStatus, creator, navigation]);

  const ringScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const ringOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>1 to 1 Live</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Avatar with pulse ring */}
        <View style={styles.avatarContainer}>
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: ringScale }],
                opacity: ringOpacity,
              },
            ]}
          />
          <View style={styles.avatarRing}>
            <OptimizedImage
              source={creator.avatar}
              style={styles.avatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
          </View>
        </View>

        {/* Waiting text */}
        <Text style={styles.waitingTitle}>
          Waiting for {creator.name} to accept...
        </Text>

        {/* Animated dots */}
        <View style={styles.dotsContainer}>
          {[0, 1, 2].map((index) => (
            <Animated.View
              key={index}
              style={[
                styles.dot,
                {
                  opacity: dotAnim.interpolate({
                    inputRange: [index, index + 0.5, index + 1, 3],
                    outputRange: [0.3, 1, 0.3, 0.3],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Cancel Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelButtonText}>Cancel request</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
  },
  avatarContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.primary,
    padding: 4,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
  },
  waitingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 16,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
});
