import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS, FORM, SPACING, HIT_SLOP } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { PASSWORD_RULES, isPasswordValid, getPasswordStrengthLevel } from '../../utils/validation';
import * as backend from '../../services/backend';
import { useAuthCallbacks } from '../../context/AuthCallbackContext';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

interface NewPasswordScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route?: {
    params?: {
      email?: string;
      code?: string;
    };
  };
}

export default function NewPasswordScreen({ navigation, route }: NewPasswordScreenProps) {
  const { colors, isDark } = useTheme();
  const { showDestructiveConfirm } = useSmuppyAlert();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isFocusedPassword, setIsFocusedPassword] = useState(false);
  const [isFocusedConfirm, setIsFocusedConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { goBack, disabled } = usePreventDoubleNavigation(navigation);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Get email and code from route params (passed from ResetCodeScreen)
  const email = route?.params?.email;
  const code = route?.params?.code;

  const handleGoBack = useCallback(() => {
    showDestructiveConfirm(
      'Leave password reset?',
      'If you go back, you will need to request a new reset code.',
      goBack,
      'Leave'
    );
  }, [goBack, showDestructiveConfirm]);

  // Callback from context to signal recovery is complete
  const { onRecoveryComplete } = useAuthCallbacks();
  const isMountedRef = useRef(true);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Validation using centralized PASSWORD_RULES
  const passwordChecks = useMemo(() => PASSWORD_RULES.map(rule => ({
    ...rule,
    passed: rule.test(password),
  })), [password]);

  const passwordValid = useMemo(() => isPasswordValid(password), [password]);
  const allChecksPassed = useMemo(() => passwordChecks.every(check => check.passed), [passwordChecks]);
  const strengthLevel = getPasswordStrengthLevel(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Form valid only if ALL criteria are met
  const isValid = passwordValid && passwordsMatch;

  const handleSubmit = useCallback(async () => {
    if (!isValid || isLoading) return;

    if (!email || !code) {
      setErrorMessage('Missing reset code. Please go back and try again.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // Confirm password reset with AWS Cognito
      await backend.confirmForgotPassword(email, code, password);

      if (!isMountedRef.current) return;

      // Success - show inline success UI
      setShowSuccess(true);

      // Brief delay to show success, then signal recovery complete
      successTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          onRecoveryComplete();
        }
      }, 1500);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      
      if (__DEV__) console.warn('[NewPassword] Update error:', err);
      const errorMessage = (err as Error)?.message || '';

      if (errorMessage.includes('ExpiredCodeException') || errorMessage.includes('expired')) {
        setErrorMessage('Reset code has expired. Please request a new one.');
      } else if (errorMessage.includes('CodeMismatchException') || errorMessage.includes('invalid')) {
        setErrorMessage('Invalid reset code. Please check and try again.');
      } else {
        setErrorMessage('Unable to update password. Please try again.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isValid, isLoading, password, email, code, onRecoveryComplete]);

  const togglePassword = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const toggleConfirm = useCallback(() => {
    setShowConfirm(prev => !prev);
  }, []);

  const getStrengthBarWidth = () => {
    switch (strengthLevel.level) {
      case 'weak': return '25%';
      case 'medium': return '50%';
      case 'strong': return '75%';
      default: return '100%';
    }
  };

  // Success state - show success message while AppNavigator transitions to Main
  if (showSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={GRADIENTS.primaryStart}
            end={GRADIENTS.primaryEnd}
            style={styles.successIcon}
          >
            <Ionicons name="checkmark" size={48} color={colors.white} />
          </LinearGradient>
          <Text style={styles.successTitle}>Password Updated!</Text>
          <Text style={styles.successSubtitle}>
            Your password has been changed successfully.
          </Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>
              {'Entering the app...'}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Back Button */}
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={handleGoBack} disabled={disabled}>
            <Ionicons name="chevron-back" size={28} color={colors.dark} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create new password</Text>
            <Text style={styles.subtitle}>Your new password must be different from previously used passwords</Text>
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* New Password Input */}
          <Text style={styles.label}>New password</Text>
          <LinearGradient
            colors={(password.length > 0 || isFocusedPassword) ? GRADIENTS.button : [colors.grayBorder, colors.grayBorder]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, password.length > 0 && passwordValid && styles.inputInnerValid]}>
              <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || isFocusedPassword) ? colors.primary : colors.grayMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor={colors.grayMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="off"
                textContentType="none"
                maxLength={128}
                onFocus={() => setIsFocusedPassword(true)}
                onBlur={() => setIsFocusedPassword(false)}
              />
              <TouchableOpacity onPress={togglePassword} hitSlop={HIT_SLOP.medium}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={colors.grayMuted} />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Password Requirements */}
          {password.length > 0 && !allChecksPassed && (
            <View style={styles.requirements}>
              {passwordChecks.map((check) => (
                <View key={check.id} style={styles.requirementRow}>
                  <Ionicons
                    name={check.passed ? "checkmark-circle" : "ellipse-outline"}
                    size={16}
                    color={check.passed ? colors.primary : colors.grayMuted}
                  />
                  <Text style={[styles.requirementText, check.passed && styles.requirementMet]}>
                    {check.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Strength Bar */}
          {password.length > 0 && (
            <View style={styles.strengthRow}>
              <View style={styles.strengthBarBg}>
                <View style={[styles.strengthBar, { width: getStrengthBarWidth(), backgroundColor: strengthLevel.color }]} />
              </View>
              <Text style={[styles.strengthText, { color: strengthLevel.color }]}>{strengthLevel.label}</Text>
            </View>
          )}

          {/* Confirm Password Input */}
          <Text style={styles.label}>Confirm new password</Text>
          {(confirmPassword.length > 0 && !passwordsMatch) ? (
            <View style={[styles.inputRow, styles.inputRowError]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.error} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor={colors.grayMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoComplete="off"
                textContentType="none"
                maxLength={128}
                onFocus={() => setIsFocusedConfirm(true)}
                onBlur={() => setIsFocusedConfirm(false)}
              />
              <TouchableOpacity onPress={toggleConfirm} hitSlop={HIT_SLOP.medium}>
                <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={20} color={colors.grayMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <LinearGradient
              colors={(confirmPassword.length > 0 || isFocusedConfirm) ? GRADIENTS.button : [colors.grayBorder, colors.grayBorder]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inputGradientBorder}
            >
              <View style={[styles.inputInner, passwordsMatch && styles.inputInnerValid]}>
                <Ionicons name="lock-closed-outline" size={20} color={(confirmPassword.length > 0 || isFocusedConfirm) ? colors.primary : colors.grayMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor={colors.grayMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoComplete="off"
                  textContentType="none"
                  maxLength={128}
                  onFocus={() => setIsFocusedConfirm(true)}
                  onBlur={() => setIsFocusedConfirm(false)}
                />
                <TouchableOpacity onPress={toggleConfirm} hitSlop={HIT_SLOP.medium}>
                  <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={20} color={colors.grayMuted} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          )}

          {/* Password Match Indicator */}
          {confirmPassword.length > 0 && (
            <View style={styles.matchIndicator}>
              <Ionicons
                name={passwordsMatch ? "checkmark-circle" : "close-circle"}
                size={16}
                color={passwordsMatch ? colors.primary : colors.error}
              />
              <Text style={[styles.matchText, passwordsMatch ? styles.matchTextValid : styles.matchTextError]}>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <LinearGradient
            colors={isValid && !isLoading ? GRADIENTS.primary : GRADIENTS.buttonDisabled}
            start={GRADIENTS.primaryStart}
            end={GRADIENTS.primaryEnd}
            style={styles.btn}
          >
            <TouchableOpacity style={styles.btnInner} onPress={handleSubmit} disabled={!isValid || disabled || isLoading} activeOpacity={0.8}>
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.btnText}>Reset Password</Text>
                  <Ionicons name="arrow-forward" size={20} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>

          {/* Footer */}
          <View style={styles.footer}>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const errorBg = isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2';
  const errorInputBg = isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2';
  const validBg = isDark ? 'rgba(14,191,138,0.15)' : '#E6FAF8';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING['3xl'] },
    disabled: { opacity: 0.6 },

    // Success state
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    successIcon: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: SPACING.xl,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    successTitle: {
      fontFamily: 'WorkSans-Bold',
      fontSize: 28,
      color: colors.dark,
      textAlign: 'center',
      marginBottom: SPACING.md,
    },
    successSubtitle: {
      fontSize: 16,
      color: colors.gray,
      textAlign: 'center',
      marginBottom: SPACING.xl,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loadingText: {
      fontSize: 14,
      color: colors.gray,
    },

    // Error box
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: errorBg,
      borderRadius: 12,
      padding: SPACING.md,
      marginBottom: SPACING.lg,
    },
    errorText: {
      flex: 1,
      fontSize: 14,
      color: colors.error,
    },

    // Back Button
    backBtn: { alignSelf: 'flex-start', padding: 4, marginLeft: -4, marginBottom: 16 },

    // Header
    header: { alignItems: 'center', marginBottom: SPACING['2xl'] },
    title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: colors.dark, textAlign: 'center', marginBottom: SPACING.md },
    subtitle: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.md },

    // Labels
    label: { fontSize: 14, fontWeight: '600', color: colors.dark, marginBottom: SPACING.sm, marginTop: SPACING.md },

    // Input
    inputRow: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: colors.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, backgroundColor: colors.background },
    inputGradientBorder: { borderRadius: FORM.inputRadius, padding: 2 },
    inputInner: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight - 4, borderRadius: FORM.inputRadius - 2, paddingHorizontal: FORM.inputPaddingHorizontal - 2, backgroundColor: colors.background },
    inputInnerValid: { backgroundColor: validBg },
    inputRowError: { borderColor: colors.error, borderWidth: 2, backgroundColor: errorInputBg },
    inputIcon: { marginRight: 12 },
    input: { flex: 1, fontSize: 16, color: colors.dark },

    // Requirements
    requirements: { marginTop: SPACING.sm, marginBottom: SPACING.xs, paddingLeft: SPACING.xs },
    requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    requirementText: { fontSize: 13, color: colors.grayMuted },
    requirementMet: { color: colors.primary },

    // Strength Bar
    strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm, gap: 12 },
    strengthBarBg: { flex: 1, height: 4, backgroundColor: colors.grayBorder, borderRadius: 2, overflow: 'hidden' },
    strengthBar: { height: '100%', borderRadius: 2 },
    strengthText: { fontSize: 12, fontWeight: '600', minWidth: 70 },

    // Match Indicator
    matchIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingLeft: SPACING.xs },
    matchText: { fontSize: 13 },
    matchTextValid: { color: colors.primary },
    matchTextError: { color: colors.error },

    // Button
    btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, marginTop: SPACING.xl },
    btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    btnText: { color: colors.white, fontSize: 16, fontWeight: '600' },

    // Footer
    footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 8, paddingBottom: 8 },
  });
};
