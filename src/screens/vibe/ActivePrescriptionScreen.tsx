/**
 * ActivePrescriptionScreen — Timer + progression for active prescription
 *
 * Completion feeds the twin + vibe score.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVibePrescriptions } from '../../hooks/useVibePrescriptions';
import { getPrescriptionById, PrescriptionCategory } from '../../services/prescriptionEngine';
import { COLORS, SPACING } from '../../config/theme';
import { useUserStore } from '../../stores';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICONS: Record<PrescriptionCategory, IoniconsName> = {
  movement: 'fitness',
  mindfulness: 'leaf',
  social: 'people',
  creative: 'color-palette',
  nutrition: 'nutrition',
};

interface ActivePrescriptionScreenProps {
  navigation: {
    goBack: () => void;
  };
  route: {
    params: { prescriptionId: string };
  };
}

export default function ActivePrescriptionScreen({ navigation, route }: ActivePrescriptionScreenProps) {
  const accountType = useUserStore((s) => s.user?.accountType);
  const isBusiness = accountType === 'pro_business';
  const insets = useSafeAreaInsets();
  const { completePrescription } = useVibePrescriptions();
  const prescription = getPrescriptionById(route.params.prescriptionId);

  const [secondsLeft, setSecondsLeft] = useState(
    (prescription?.durationMinutes ?? 1) * 60,
  );
  const [isComplete, setIsComplete] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;

  const totalSeconds = (prescription?.durationMinutes ?? 1) * 60;

  // Countdown timer
  useEffect(() => {
    if (isComplete || !prescription) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsComplete(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isComplete, prescription]);

  // Progress animation
  useEffect(() => {
    const elapsed = totalSeconds - secondsLeft;
    const progress = totalSeconds > 0 ? elapsed / totalSeconds : 0;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [secondsLeft, totalSeconds, progressAnim]);

  // Completion bounce
  useEffect(() => {
    if (!isComplete) return;
    Animated.sequence([
      Animated.spring(bounceAnim, { toValue: 1.2, friction: 3, useNativeDriver: true }),
      Animated.spring(bounceAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [isComplete, bounceAnim]);

  const handleComplete = useCallback(() => {
    if (!prescription) return;
    completePrescription(prescription.id);
    navigation.goBack();
  }, [prescription, completePrescription, navigation]);

  const handleCancel = useCallback(() => navigation.goBack(), [navigation]);

  // Business accounts don't have access to prescriptions
  useEffect(() => {
    if (isBusiness) navigation.goBack();
  }, [isBusiness, navigation]);

  if (isBusiness) return null;

  if (!prescription) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.errorText}>Prescription not found</Text>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      {/* Cancel button */}
      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Ionicons name="close" size={28} color={COLORS.gray} />
      </TouchableOpacity>

      {/* Prescription info */}
      <View style={styles.infoSection}>
        <Ionicons name={CATEGORY_ICONS[prescription.category]} size={40} color={COLORS.primary} />
        <Text style={styles.title}>{prescription.title}</Text>
        <Text style={styles.description}>{prescription.description}</Text>
      </View>

      {/* Timer */}
      <Animated.View style={[styles.timerSection, { transform: [{ scale: bounceAnim }] }]}>
        {isComplete ? (
          <>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.primary} />
            <Text style={styles.completeText}>Well done!</Text>
            <Text style={styles.rewardText}>+{prescription.vibeScoreReward} vibe points</Text>
          </>
        ) : (
          <>
            <Text style={styles.timer}>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
            </View>
          </>
        )}
      </Animated.View>

      {/* Action button */}
      <View style={styles.bottomSection}>
        {isComplete ? (
          <TouchableOpacity onPress={handleComplete} activeOpacity={0.8}>
            <LinearGradient
              colors={['#00B3C7', '#0EBF8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.completeButton}
            >
              <Text style={styles.completeButtonText}>Collect reward</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.skipButton} onPress={handleCancel}>
            <Text style={styles.skipText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
  },
  cancelButton: {
    alignSelf: 'flex-end',
  },
  infoSection: {
    alignItems: 'center',
    marginTop: 40,
    gap: SPACING.sm,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 24,
    color: COLORS.dark,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
  },
  timerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 72,
    color: COLORS.dark,
    letterSpacing: 2,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.grayBorder,
    marginTop: SPACING.lg,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  completeText: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.primary,
    marginTop: SPACING.md,
  },
  rewardText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.gray,
    marginTop: SPACING.xs,
  },
  bottomSection: {
    paddingBottom: 20,
  },
  completeButton: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  completeButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.white,
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.gray,
  },
  errorText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 40,
  },
  backLink: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.primary,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
