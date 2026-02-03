/**
 * ActivePrescriptionScreen — Timer + progression for active prescription
 *
 * Completion feeds the twin + vibe score.
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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
import { SPACING } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore, useVibeStore } from '../../stores';

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

const RUSHED_THRESHOLD = 0.3;
const RUSHED_DAILY_LIMIT = 3;
const COUNTDOWN_SECONDS = 3;

type Phase = 'prep' | 'countdown' | 'active' | 'complete';

export default function ActivePrescriptionScreen({ navigation, route }: ActivePrescriptionScreenProps) {
  const { colors, isDark } = useTheme();
  const accountType = useUserStore((s) => s.user?.accountType);
  const isBusiness = accountType === 'pro_business';
  const insets = useSafeAreaInsets();
  const { completePrescription } = useVibePrescriptions();
  const prescription = getPrescriptionById(route.params.prescriptionId);
  const prescriptionStartedAt = useVibeStore((s) => s.prescriptionStartedAt);
  const rushedToday = useVibeStore((s) => s.rushedToday);

  const isManual = prescription?.completionMethod === 'manual';

  const [phase, setPhase] = useState<Phase>('prep');
  const [countdownValue, setCountdownValue] = useState(COUNTDOWN_SECONDS);
  const [secondsLeft, setSecondsLeft] = useState(
    (prescription?.durationMinutes ?? 1) * 60,
  );
  const [wasRushed, setWasRushed] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const countdownScaleAnim = useRef(new Animated.Value(1)).current;

  const totalSeconds = (prescription?.durationMinutes ?? 1) * 60;

  // ── Countdown 3-2-1 ──
  useEffect(() => {
    if (phase !== 'countdown') return;

    const interval = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase('active');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // Countdown number pulse animation
  useEffect(() => {
    if (phase !== 'countdown') return;
    countdownScaleAnim.setValue(1.4);
    Animated.spring(countdownScaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: true,
    }).start();
  }, [phase, countdownValue, countdownScaleAnim]);

  // ── Activity timer (timer mode only) ──
  useEffect(() => {
    if (phase !== 'active' || isManual || !prescription) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase('complete');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, isManual, prescription]);

  // Progress animation (timer mode only)
  useEffect(() => {
    if (phase !== 'active' || isManual) return;
    const elapsed = totalSeconds - secondsLeft;
    const progress = totalSeconds > 0 ? elapsed / totalSeconds : 0;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [phase, isManual, secondsLeft, totalSeconds, progressAnim]);

  // Completion bounce
  useEffect(() => {
    if (phase !== 'complete') return;
    Animated.sequence([
      Animated.spring(bounceAnim, { toValue: 1.2, friction: 3, useNativeDriver: true }),
      Animated.spring(bounceAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
  }, [phase, bounceAnim]);

  const handleGo = useCallback(() => {
    setCountdownValue(COUNTDOWN_SECONDS);
    setPhase('countdown');
  }, []);

  // Manual "Mark as Done" handler
  const handleMarkDone = useCallback(() => {
    if (!prescription || !prescriptionStartedAt) return;
    const elapsed = Date.now() - prescriptionStartedAt;
    const minRequired = prescription.durationMinutes * 60 * 1000 * RUSHED_THRESHOLD;
    setWasRushed(elapsed < minRequired);
    setPhase('complete');
  }, [prescription, prescriptionStartedAt]);

  const handleComplete = useCallback(() => {
    if (!prescription) return;
    completePrescription(prescription.id);
    navigation.goBack();
  }, [prescription, completePrescription, navigation]);

  const handleCancel = useCallback(() => navigation.goBack(), [navigation]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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

  const rewardDisplay = wasRushed
    ? Math.ceil(prescription.vibeScoreReward * 0.5)
    : prescription.vibeScoreReward;

  // ── PREP PHASE ──
  if (phase === 'prep') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Ionicons name="close" size={28} color={colors.gray} />
        </TouchableOpacity>

        <View style={styles.infoSection}>
          <Ionicons name={CATEGORY_ICONS[prescription.category]} size={40} color={colors.primary} />
          <Text style={styles.title}>{prescription.title}</Text>
          <Text style={styles.prepDuration}>{prescription.durationMinutes} min</Text>
        </View>

        <View style={styles.instructionsSection}>
          <Text style={styles.instructionsTitle}>How it works</Text>
          {prescription.instructions.map((step, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={styles.instructionBullet}>
                <Text style={styles.instructionBulletText}>{i + 1}</Text>
              </View>
              <Text style={styles.instructionText}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity onPress={handleGo} activeOpacity={0.8}>
            <LinearGradient
              colors={['#00B3C7', '#0EBF8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.completeButton}
            >
              <Text style={styles.completeButtonText}>Go</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={handleCancel}>
            <Text style={styles.skipText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── COUNTDOWN PHASE (3-2-1) ──
  if (phase === 'countdown') {
    return (
      <View style={[styles.container, styles.countdownContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <Animated.Text style={[styles.countdownNumber, { transform: [{ scale: countdownScaleAnim }] }]}>
          {countdownValue}
        </Animated.Text>
        <Text style={styles.countdownLabel}>Get ready...</Text>
      </View>
    );
  }

  // ── ACTIVE + COMPLETE PHASES ──
  return (
    <View style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
      <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
        <Ionicons name="close" size={28} color={colors.gray} />
      </TouchableOpacity>

      <View style={styles.infoSection}>
        <Ionicons name={CATEGORY_ICONS[prescription.category]} size={40} color={colors.primary} />
        <Text style={styles.title}>{prescription.title}</Text>
        <Text style={styles.description}>{prescription.description}</Text>
        {isManual && phase === 'active' && (
          <Text style={styles.recommendedDuration}>~{prescription.durationMinutes} min recommended</Text>
        )}
      </View>

      <Animated.View style={[styles.timerSection, { transform: [{ scale: bounceAnim }] }]}>
        {phase === 'complete' ? (
          <>
            <Ionicons name="checkmark-circle" size={80} color={colors.primary} />
            <Text style={styles.completeText}>
              {wasRushed ? 'Completed' : 'Well done!'}
            </Text>
            <Text style={styles.rewardText}>+{rewardDisplay} vibe points</Text>
            {wasRushed && (
              <Text style={styles.rushedText}>
                Try to take more time next time for better results
              </Text>
            )}
            {wasRushed && rushedToday >= RUSHED_DAILY_LIMIT && (
              <Text style={styles.rushedText}>
                You seem to be going fast today. Take your time — the results will come!
              </Text>
            )}
          </>
        ) : isManual ? (
          <TouchableOpacity onPress={handleMarkDone} activeOpacity={0.8}>
            <LinearGradient
              colors={['#00B3C7', '#0EBF8A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.markDoneButton}
            >
              <Ionicons name="checkmark" size={28} color={colors.white} />
              <Text style={styles.markDoneText}>Mark as Done</Text>
            </LinearGradient>
          </TouchableOpacity>
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

      <View style={styles.bottomSection}>
        {phase === 'complete' ? (
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

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.dark,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: colors.gray,
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
    color: colors.dark,
    letterSpacing: 2,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: SPACING.lg,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  completeText: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: colors.primary,
    marginTop: SPACING.md,
  },
  rewardText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.gray,
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
    color: colors.white,
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.gray,
  },
  errorText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.error,
    textAlign: 'center',
    marginTop: 40,
  },
  backLink: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.primary,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
  prepDuration: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.gray,
  },
  instructionsSection: {
    flex: 1,
    marginTop: 32,
    gap: SPACING.md,
  },
  instructionsTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 18,
    color: colors.dark,
    marginBottom: SPACING.xs,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  instructionBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  instructionBulletText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: colors.white,
  },
  instructionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: colors.dark,
    flex: 1,
    lineHeight: 22,
  },
  countdownContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNumber: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 120,
    color: colors.primary,
  },
  countdownLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 18,
    color: colors.gray,
    marginTop: SPACING.sm,
  },
  recommendedDuration: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.xs,
  },
  markDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 48,
    borderRadius: 32,
    gap: SPACING.sm,
  },
  markDoneText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.white,
  },
  rushedText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    lineHeight: 20,
  },
});
