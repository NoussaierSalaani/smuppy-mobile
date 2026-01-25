import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, FORM, SPACING } from '../../config/theme';
import { useCooldown } from '../../hooks/useCooldown';
import * as backend from '../../services/backend';

export default function CheckEmailScreen({ navigation, route }) {
  const { email } = route.params || {};
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { remaining: remainingTime, isCoolingDown, start: triggerCooldown } = useCooldown(30);
  const canAction = !isCoolingDown;

  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleBackToLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const handleResend = useCallback(async () => {
    if (!canAction || isResending || !email) return;

    setIsResending(true);
    setResendSuccess(false);

    try {
      // Use backend service which routes to AWS Cognito
      await backend.forgotPassword(email.trim().toLowerCase());
      setResendSuccess(true);
      triggerCooldown();
    } catch (error) {
      console.error('[CheckEmail] Resend error:', error);
      // Still trigger cooldown to prevent spam
      triggerCooldown();
    } finally {
      setIsResending(false);
    }
  }, [canAction, isResending, email, triggerCooldown]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
          <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={GRADIENTS.primaryStart}
            end={GRADIENTS.primaryEnd}
            style={styles.iconCircle}
          >
            <Ionicons name="mail-open-outline" size={48} color={COLORS.white} />
          </LinearGradient>
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We've sent a password reset link to{'\n'}
          <Text style={styles.emailText}>{email || 'your email'}</Text>
        </Text>

        {/* Instructions */}
        <View style={styles.instructionsBox}>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            <Text style={styles.instructionText}>Open the email from Smuppy</Text>
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            <Text style={styles.instructionText}>Click the reset password link</Text>
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            <Text style={styles.instructionText}>Create your new password</Text>
          </View>
        </View>

        {/* Resend Success Message */}
        {resendSuccess && (
          <View style={styles.successMessage}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
            <Text style={styles.successText}>Link sent successfully!</Text>
          </View>
        )}

        {/* Resend Link Button */}
        <TouchableOpacity
          style={[styles.resendBtn, (!canAction || isResending) && styles.resendBtnDisabled]}
          onPress={handleResend}
          disabled={!canAction || isResending}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : !canAction ? (
            <Text style={styles.resendTextDisabled}>
              Resend link in {remainingTime}s
            </Text>
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
              <Text style={styles.resendText}>Resend link</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Back to Login */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={GRADIENTS.primaryStart}
          end={GRADIENTS.primaryEnd}
          style={styles.btn}
        >
          <TouchableOpacity style={styles.btnInner} onPress={handleBackToLogin} activeOpacity={0.8}>
            <Text style={styles.btnText}>Back to login</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </LinearGradient>

        {/* Footer */}
        <View style={styles.footer}>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.base,
  },
  backBtn: {
    alignSelf: 'flex-start',
    padding: 4,
    marginLeft: -4,
    marginBottom: SPACING.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emailText: {
    fontWeight: '600',
    color: COLORS.dark,
  },
  instructionsBox: {
    backgroundColor: COLORS.backgroundValid,
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: COLORS.dark,
    flex: 1,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: SPACING.md,
  },
  successText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  resendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.md,
  },
  resendBtnDisabled: {
    opacity: 0.6,
  },
  resendText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: '600',
  },
  resendTextDisabled: {
    fontSize: 15,
    color: COLORS.gray,
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  btn: {
    height: FORM.buttonHeight,
    borderRadius: FORM.buttonRadius,
    marginBottom: SPACING.xl,
  },
  btnInner: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
});
