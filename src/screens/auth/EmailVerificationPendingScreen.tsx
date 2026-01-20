import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';
import { supabase } from '../../config/supabase';
import { ENV } from '../../config/env';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { checkAWSRateLimit } from '../../services/awsRateLimit';

/**
 * EmailVerificationPendingScreen
 * Shows when user has signed up but hasn't verified their email
 * Blocks access to the app until email is confirmed
 */
export default function EmailVerificationPendingScreen({ route }) {
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const email = route?.params?.email || 'your email';

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
        const { data: { session }, error } = await supabase.auth.refreshSession();
        if (!error && session?.user?.email_confirmed_at) {
          // AppNavigator will switch stacks once email is verified
          return;
        }
      } catch (err) {
        console.error('[EmailPending] Error checking status:', err);
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
      Alert.alert('Too many attempts', `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`);
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch(`${ENV.SUPABASE_URL}/functions/v1/auth-resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ENV.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${ENV.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (response.status === 429) {
        Alert.alert('Too many attempts', 'Please try again in a few moments.');
        return;
      }

      if (!response.ok) {
        Alert.alert('Error', 'Unable to resend verification email. Please try again.');
        return;
      }

      setResendCooldown(60);
      Alert.alert('Email Sent', 'A new verification email has been sent to your inbox.');
    } catch (err) {
      console.error('[EmailPending] Resend error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsResending(false);
    }
  }, [resendCooldown, isResending, email]);

  const handleCheckStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (!error && session?.user?.email_confirmed_at) {
        setIsCheckingStatus(false);
        return;
      } else {
        Alert.alert(
          'Not Verified Yet',
          'Your email has not been verified yet. Please check your inbox and click the verification link.'
        );
      }
    } catch (err) {
      console.error('[EmailPending] Check status error:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out and use a different email?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await storage.clear([
                STORAGE_KEYS.ACCESS_TOKEN,
                STORAGE_KEYS.REFRESH_TOKEN,
                STORAGE_KEYS.USER_ID,
              ]);
              await supabase.auth.signOut({ scope: 'global' });
            } catch (err) {
              console.error('[EmailPending] Sign out error:', err);
            }
          },
        },
      ]
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
          <Ionicons name="mail" size={48} color={COLORS.white} />
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
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.btnText}>I've verified my email</Text>
                <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
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
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.resendLink}>Didn't receive the email? Resend</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Sign Out Option */}
        <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.gray} />
          <Text style={styles.signOutText}>Sign out and use a different email</Text>
        </TouchableOpacity>

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
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },

  // Title
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },

  // Email Box
  emailBox: {
    backgroundColor: COLORS.grayBorder,
    borderRadius: 12,
    padding: SPACING.md,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emailLabel: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 4,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },

  // Instructions
  instructionsBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: SPACING.lg,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  instructionsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.dark,
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
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray,
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
    color: COLORS.white,
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
    color: COLORS.gray,
  },
  resendCooldownTime: {
    fontWeight: '600',
    color: COLORS.dark,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Sign Out
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayLight,
    width: '100%',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 14,
    color: COLORS.gray,
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingBottom: SPACING.xl,
    alignItems: 'center',
  },
});
