import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { GRADIENTS, SPACING } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';
import { awsAuth } from '../../services/aws-auth';
import { RouteProp } from '@react-navigation/native';

type EmailVerificationRouteParams = {
  EmailVerificationPending: { email?: string };
};

/**
 * EmailVerificationPendingScreen
 * Shows when user has signed up but hasn't verified their email
 * Blocks access to the app until email is confirmed
 */
export default function EmailVerificationPendingScreen({
  route
}: {
  route: RouteProp<EmailVerificationRouteParams, 'EmailVerificationPending'>
}): React.ReactNode {
  const { colors, isDark } = useTheme();
  const { showError, showSuccess, showAlert, showDestructiveConfirm } = useSmuppyAlert();
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const email = route?.params?.email ?? '';

  const styles = useMemo(() => createStyles(colors), [colors]);

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Poll for email verification status every 5 seconds
  useEffect(() => {
    const checkVerificationStatus = async () => {
      try {
        // Use backend service to check current user status
        const user = await backend.getCurrentUser();
        if (user) {
          // User is authenticated, AppNavigator will handle navigation
          return;
        }
      } catch (err) {
        if (__DEV__) console.warn('[EmailPending] Error checking status:', err);
      }
    };

    const interval = setInterval(checkVerificationStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleResendEmail = useCallback(async () => {
    if (resendCooldown > 0 || isResending) return;

    // Check AWS rate limit first (server-side protection) - BEFORE setIsResending
    const normalizedEmail = email.trim().toLowerCase();
    const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-resend');
    if (!awsCheck.allowed) {
      showError('Too many attempts', `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`);
      return;
    }

    setIsResending(true);

    try {
      // Use AWS Cognito to resend confirmation code
      await awsAuth.resendConfirmationCode(normalizedEmail);
      setResendCooldown(60);
      showSuccess('Code Sent', 'A new verification code has been sent to your inbox.');
    } catch (err: any) {
      if (__DEV__) console.warn('[EmailPending] Resend error:', err);
      const errorMessage = err?.message || '';

      if (errorMessage.includes('LimitExceededException') || errorMessage.includes('rate')) {
        showError('Too many attempts', 'Please try again in a few moments.');
      } else {
        showError('Error', 'Unable to resend verification code. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  }, [resendCooldown, isResending, email]);

  const handleCheckStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      // Check if user is now verified via backend
      const user = await backend.getCurrentUser();
      if (user) {
        setIsCheckingStatus(false);
        // User is verified, navigation will handle it
        return;
      } else {
        showAlert({
          title: 'Not Verified Yet',
          message: 'Your email has not been verified yet. Please check your inbox and enter the verification code.',
          type: 'warning',
          buttons: [{ text: 'OK' }],
        });
      }
    } catch (err) {
      if (__DEV__) console.warn('[EmailPending] Check status error:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    showDestructiveConfirm(
      'Sign Out',
      'Are you sure you want to sign out and use a different email?',
      async () => {
        try {
          await storage.clear([
            STORAGE_KEYS.ACCESS_TOKEN,
            STORAGE_KEYS.REFRESH_TOKEN,
            STORAGE_KEYS.USER_ID,
          ]);
          await backend.signOut();
        } catch (err) {
          if (__DEV__) console.warn('[EmailPending] Sign out error:', err);
        }
      },
      'Sign Out'
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Icon */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={GRADIENTS.primaryStart}
          end={GRADIENTS.primaryEnd}
          style={styles.iconContainer}
        >
          <Ionicons name="mail" size={48} color={colors.white} />
        </LinearGradient>

        {/* Title */}
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We've sent a verification link to your email address
        </Text>

        {/* Email Display */}
        <View style={styles.emailBox}>
          <Text style={styles.emailLabel}>Email sent to:</Text>
          <Text style={styles.emailText}>{email}</Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsBox}>
          <Text style={styles.instructionsTitle}>To continue:</Text>

          <View style={styles.instructionRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <Text style={styles.instructionText}>Check your inbox (and spam folder)</Text>
          </View>

          <View style={styles.instructionRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <Text style={styles.instructionText}>Click the verification link in the email</Text>
          </View>

          <View style={styles.instructionRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <Text style={styles.instructionText}>Return here - you'll be automatically redirected</Text>
          </View>
        </View>

        {/* Check Status Button */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={GRADIENTS.primaryStart}
          end={GRADIENTS.primaryEnd}
          style={styles.btn}
        >
          <TouchableOpacity
            style={styles.btnInner}
            onPress={handleCheckStatus}
            disabled={isCheckingStatus}
            activeOpacity={0.8}
          >
            {isCheckingStatus ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.btnText}>I've verified my email</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.white} />
              </>
            )}
          </TouchableOpacity>
        </LinearGradient>

        {/* Resend Link */}
        <View style={styles.resendRow}>
          {resendCooldown > 0 ? (
            <Text style={styles.resendCooldownText}>
              Resend email in <Text style={styles.resendCooldownTime}>{resendCooldown}s</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResendEmail} disabled={isResending}>
              {isResending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.resendLink}>Didn't receive the email? Resend</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Sign Out Option */}
        <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={colors.gray} />
          <Text style={styles.signOutText}>Sign out and use a different email</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING['2xl'],
    alignItems: 'center',
  },

  // Icon
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },

  // Title
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: colors.dark,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },

  // Email Box
  emailBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emailLabel: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 4,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },

  // Instructions
  instructionsBox: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: SPACING.lg,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: SPACING.md,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.gray,
    lineHeight: 20,
  },

  // Button
  btn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    marginBottom: SPACING.lg,
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

  // Resend
  resendRow: {
    marginBottom: SPACING.xl,
    height: 24,
    justifyContent: 'center',
  },
  resendCooldownText: {
    fontSize: 14,
    color: colors.gray,
  },
  resendCooldownTime: {
    fontWeight: '600',
    color: colors.dark,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Sign Out
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: colors.grayLight,
    width: '100%',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 14,
    color: colors.gray,
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingBottom: SPACING.xl,
    alignItems: 'center',
  },
});
