import React, { useState, useCallback, useMemo } from 'react';
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
import { GRADIENTS, FORM, SPACING } from '../../config/theme';
import { useCooldown } from '../../hooks/useCooldown';
import * as backend from '../../services/backend';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface CheckEmailScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    canGoBack: () => boolean;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route?: {
    params?: {
      email?: string;
    };
  };
}

/**
 * Mask email for privacy/security
 * Example: "john.doe@gmail.com" → "j••••••e@g••••.com"
 */
const maskEmail = (email: string): string => {
  if (!email || !email.includes('@')) return '••••@••••.com';

  const [localPart, domain] = email.split('@');
  const [domainName, ...domainExt] = domain.split('.');

  // Mask local part: show first and last char, rest as dots
  const maskedLocal = localPart.length <= 2
    ? '••'
    : `${localPart[0]}${'•'.repeat(Math.min(localPart.length - 2, 6))}${localPart[localPart.length - 1]}`;

  // Mask domain name: show first char, rest as dots
  const maskedDomain = domainName.length <= 1
    ? '••••'
    : `${domainName[0]}${'•'.repeat(Math.min(domainName.length - 1, 4))}`;

  return `${maskedLocal}@${maskedDomain}.${domainExt.join('.')}`;
};

export default function CheckEmailScreen({ navigation, route }: CheckEmailScreenProps) {
  const { email } = route?.params || {};
  const maskedEmailDisplay = maskEmail(email || '');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { remaining: remainingTime, isCoolingDown, start: triggerCooldown } = useCooldown(30);
  const canAction = !isCoolingDown;
  const { colors, isDark } = useTheme();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
      if (__DEV__) console.warn('[CheckEmail] Resend error:', error);
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
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </TouchableOpacity>

        {/* Icon */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={GRADIENTS.primaryStart}
            end={GRADIENTS.primaryEnd}
            style={styles.iconCircle}
          >
            <Ionicons name="mail-open-outline" size={48} color={colors.white} />
          </LinearGradient>
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We've sent a password reset code to{'\n'}
          <Text style={styles.emailText}>{maskedEmailDisplay}</Text>
        </Text>

        {/* Instructions */}
        <View style={styles.instructionsBox}>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.instructionText}>Open the email from Smuppy</Text>
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.instructionText}>Copy the 6-digit verification code</Text>
          </View>
          <View style={styles.instructionRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text style={styles.instructionText}>Enter the code to reset your password</Text>
          </View>
        </View>

        {/* Resend Success Message */}
        {resendSuccess && (
          <View style={styles.successMessage}>
            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            <Text style={styles.successText}>Code sent successfully!</Text>
          </View>
        )}

        {/* Resend Code Button */}
        <TouchableOpacity
          style={[styles.resendBtn, (!canAction || isResending) && styles.resendBtnDisabled]}
          onPress={handleResend}
          disabled={!canAction || isResending}
        >
          {isResending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : !canAction ? (
            <Text style={styles.resendTextDisabled}>
              Resend code in {remainingTime}s
            </Text>
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={styles.resendText}>Resend code</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* I Have a Code Button */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={GRADIENTS.primaryStart}
          end={GRADIENTS.primaryEnd}
          style={styles.btn}
        >
          <TouchableOpacity style={styles.btnInner} onPress={() => navigation.navigate('ResetCode', { email })} activeOpacity={0.8}>
            <Text style={styles.btnText}>I have a code</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        </LinearGradient>

        {/* Back to Login Link */}
        <TouchableOpacity style={styles.backToLoginBtn} onPress={handleBackToLogin}>
          <Text style={styles.backToLoginText}>Back to login</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: colors.dark,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emailText: {
    fontWeight: '600',
    color: colors.dark,
  },
  instructionsBox: {
    backgroundColor: colors.backgroundValid,
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
    color: colors.dark,
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
    color: colors.primary,
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
    color: colors.primary,
    fontWeight: '600',
  },
  resendTextDisabled: {
    fontSize: 15,
    color: colors.gray,
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  btn: {
    height: FORM.buttonHeight,
    borderRadius: FORM.buttonRadius,
    marginBottom: SPACING.md,
  },
  btnInner: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  backToLoginBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  backToLoginText: {
    fontSize: 15,
    color: colors.gray,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
});
