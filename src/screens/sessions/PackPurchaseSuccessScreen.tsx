/**
 * Pack Purchase Success Screen
 * Confirmation screen after successful pack purchase
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface Pack {
  id: string;
  name: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
}

interface Creator {
  id: string;
  name: string;
  username: string;
}

type RouteParams = {
  PackPurchaseSuccess: { pack: Pack; creator: Creator };
};

const PackPurchaseSuccessScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<RouteProp<RouteParams, 'PackPurchaseSuccess'>>();
  const { colors, isDark } = useTheme();
  const { pack, creator } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 10,
        stiffness: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBookNow = () => {
    navigation.replace('BookSession', { creatorId: creator.id, fromPack: true });
  };

  const handleViewSessions = () => {
    navigation.replace('MySessions');
  };

  const handleGoHome = () => {
    navigation.replace('Tabs');
  };

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + pack.validityDays);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Success Animation */}
        <Animated.View style={[styles.successIcon, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name="checkmark" size={60} color={colors.white} />
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Purchase successful!</Text>
          <Text style={styles.subtitle}>
            You purchased the {pack.name} with {creator.name}
          </Text>

          {/* Pack Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Ionicons name="cube" size={22} color={colors.primary} />
              <Text style={styles.summaryText}>{pack.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="videocam" size={22} color={colors.primary} />
              <Text style={styles.summaryText}>{pack.sessionsIncluded} sessions available</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="time" size={22} color={colors.primary} />
              <Text style={styles.summaryText}>{pack.sessionDuration} min/session</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="calendar" size={22} color={colors.primary} />
              <Text style={styles.summaryText}>
                Expires on {expiryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </Text>
            </View>
          </View>

          {/* Info */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={colors.primary} />
            <Text style={styles.infoText}>
              You can book your sessions anytime from {creator.name}'s profile.
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { paddingBottom: insets.bottom + 16, opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleBookNow}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <Ionicons name="calendar" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Book a session</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleViewSessions}>
          <Text style={styles.secondaryButtonText}>View my sessions</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={handleGoHome}>
          <Text style={styles.linkButtonText}>Back to home</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    marginBottom: 32,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 32,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryText: {
    fontSize: 15,
    color: colors.dark,
    flex: 1,
  },
  infoCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.primary + '15',
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.gray,
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  linkButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    fontSize: 15,
    color: colors.gray,
  },
});

export default PackPurchaseSuccessScreen;
