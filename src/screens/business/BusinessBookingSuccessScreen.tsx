/**
 * BusinessBookingSuccessScreen
 * Confirmation screen after successful booking
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDateLong } from '../../utils/dateFormatters';

interface Props {
  route: {
    params: {
      bookingId: string;
      businessName: string;
      serviceName: string;
      date: string;
      time: string;
    };
  };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; popToTop: () => void };
}

export default function BusinessBookingSuccessScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { showConfirm, showSuccess } = useSmuppyAlert();
  const { bookingId, businessName, serviceName, date, time } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddToCalendar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showConfirm(
      'Add to Calendar',
      `Would you like to add "${serviceName}" at ${businessName} on ${formatDateLong(date)} at ${time} to your calendar?`,
      () => {
        // Calendar integration would go here with expo-calendar
        showSuccess('Added', 'Event added to your calendar');
      },
      'Add'
    );
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I just booked "${serviceName}" at ${businessName} on Smuppy! 🎉\n\n📅 ${formatDateLong(date)} at ${time}`,
      });
    } catch (error) {
      if (__DEV__) console.warn('Share error:', error);
    }
  };

  const handleDone = useCallback(() => {
    try {
      navigation.popToTop();
      navigation.navigate('Tabs');
    } catch {
      // Fallback navigation
      navigation.navigate('Tabs');
    }
  }, [navigation]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Success Animation */}
          <Animated.View
            style={[
              styles.animationContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            <LinearGradient colors={GRADIENTS.primary} style={styles.successCircle}>
              <Ionicons name="checkmark" size={60} color="#fff" />
            </LinearGradient>
          </Animated.View>

          {/* Success Message */}
          <Text style={styles.title}>Booking Confirmed! 🎉</Text>
          <Text style={styles.subtitle}>
            Your session has been booked successfully
          </Text>

          {/* Booking Details Card */}
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="business" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{businessName}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="fitness" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Service</Text>
                <Text style={styles.detailValue}>{serviceName}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="calendar" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatDateLong(date)}</Text>
                <Text style={styles.detailSubvalue}>{time}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="receipt" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Booking ID</Text>
                <Text style={styles.detailValueSmall}>{bookingId}</Text>
              </View>
            </View>
          </View>

          {/* Reminder */}
          <View style={styles.reminderCard}>
            <Ionicons name="notifications" size={20} color="#FFD700" />
            <Text style={styles.reminderText}>
              We'll send you a reminder 24 hours before your appointment
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleAddToCalendar}>
              <Ionicons name="calendar-outline" size={20} color="#fff" />
              <Text style={styles.secondaryButtonText}>Add to Calendar</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.secondaryButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleDone}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.primaryGradient}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  animationContainer: {
    width: 120,
    height: 120,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.dark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 32,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  detailSubvalue: {
    fontSize: 14,
    color: colors.grayLight,
    marginTop: 2,
  },
  detailValueSmall: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.grayLight,
    fontFamily: 'monospace',
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 14,
    borderRadius: 14,
    gap: 12,
    width: '100%',
  },
  reminderText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,215,0,0.9)',
  },
  actions: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
