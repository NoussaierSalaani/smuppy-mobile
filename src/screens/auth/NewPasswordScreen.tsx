import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, FORM, SPACING } from '../../config/theme';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { PASSWORD_RULES, isPasswordValid, getPasswordStrengthLevel } from '../../utils/validation';
import * as backend from '../../services/backend';

export default function NewPasswordScreen({ navigation, route }) {
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

  // Get email and code from route params (passed from ResetCodeScreen)
  const email = route?.params?.email;
  const code = route?.params?.code;

  const handleGoBack = useCallback(() => {
    Alert.alert(
      'Leave password reset?',
      'If you go back, you will need to request a new reset code.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: goBack },
      ]
    );
  }, [goBack]);

  // Callback from AppNavigator to signal recovery is complete
  const onRecoveryComplete = route?.params?.onRecoveryComplete;

  // Validation avec PASSWORD_RULES centralisées
  const passwordChecks = useMemo(() => PASSWORD_RULES.map(rule => ({
    ...rule,
    passed: rule.test(password),
  })), [password]);

  const passwordValid = useMemo(() => isPasswordValid(password), [password]);
  const allChecksPassed = useMemo(() => passwordChecks.every(check => check.passed), [passwordChecks]);
  const strengthLevel = getPasswordStrengthLevel(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Form valide seulement si TOUS les critères sont remplis
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

      // Success - show inline success UI
      setShowSuccess(true);

      // Brief delay to show success, then navigate to login
      setTimeout(() => {
        if (onRecoveryComplete) {
          onRecoveryComplete();
        } else {
          // Navigate to login screen
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }
      }, 1500);
    } catch (err: any) {
      console.error('[NewPassword] Update error:', err);
      const errorMessage = err?.message || '';

      if (errorMessage.includes('ExpiredCodeException') || errorMessage.includes('expired')) {
        setErrorMessage('Reset code has expired. Please request a new one.');
      } else if (errorMessage.includes('CodeMismatchException') || errorMessage.includes('invalid')) {
        setErrorMessage('Invalid reset code. Please check and try again.');
      } else {
        setErrorMessage('Unable to update password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isValid, isLoading, password, email, code, onRecoveryComplete, navigation]);

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
            <Ionicons name="checkmark" size={48} color={COLORS.white} />
          </LinearGradient>
          <Text style={styles.successTitle}>Password Updated!</Text>
          <Text style={styles.successSubtitle}>
            Your password has been changed successfully.
          </Text>
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Entering the app...</Text>
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
            <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create new password</Text>
            <Text style={styles.subtitle}>Your new password must be different from previously used passwords</Text>
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={COLORS.error} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* New Password Input */}
          <Text style={styles.label}>New password</Text>
          <LinearGradient
            colors={(password.length > 0 || isFocusedPassword) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, password.length > 0 && passwordValid && styles.inputInnerValid]}>
              <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || isFocusedPassword) ? COLORS.primary : COLORS.grayMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor={COLORS.grayMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="off"
                textContentType="none"
                onFocus={() => setIsFocusedPassword(true)}
                onBlur={() => setIsFocusedPassword(false)}
              />
              <TouchableOpacity onPress={togglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
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
                    color={check.passed ? COLORS.primary : COLORS.grayMuted}
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
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.error} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor={COLORS.grayMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoComplete="off"
                textContentType="none"
                onFocus={() => setIsFocusedConfirm(true)}
                onBlur={() => setIsFocusedConfirm(false)}
              />
              <TouchableOpacity onPress={toggleConfirm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <LinearGradient
              colors={(confirmPassword.length > 0 || isFocusedConfirm) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inputGradientBorder}
            >
              <View style={[styles.inputInner, passwordsMatch && styles.inputInnerValid]}>
                <Ionicons name="lock-closed-outline" size={20} color={(confirmPassword.length > 0 || isFocusedConfirm) ? COLORS.primary : COLORS.grayMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm your password"
                  placeholderTextColor={COLORS.grayMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoComplete="off"
                  textContentType="none"
                  onFocus={() => setIsFocusedConfirm(true)}
                  onBlur={() => setIsFocusedConfirm(false)}
                />
                <TouchableOpacity onPress={toggleConfirm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showConfirm ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
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
                color={passwordsMatch ? COLORS.primary : COLORS.error}
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
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.btnText}>Reset Password</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
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
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  successTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  successSubtitle: {
    fontSize: 16,
    color: COLORS.gray,
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
    color: COLORS.gray,
  },

  // Error box
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.errorLight,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.error,
  },

  // Back Button
  backBtn: { alignSelf: 'flex-start', padding: 4, marginLeft: -4, marginBottom: 16 },

  // Header
  header: { alignItems: 'center', marginBottom: SPACING['2xl'] },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.md },
  subtitle: { fontSize: 15, color: COLORS.gray, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.md },

  // Labels
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.sm, marginTop: SPACING.md },

  // Input
  inputRow: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, backgroundColor: COLORS.white },
  inputGradientBorder: { borderRadius: FORM.inputRadius, padding: 2 },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight - 4, borderRadius: FORM.inputRadius - 2, paddingHorizontal: FORM.inputPaddingHorizontal - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: COLORS.backgroundValid },
  inputRowError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: COLORS.errorLight },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: COLORS.dark },

  // Requirements
  requirements: { marginTop: SPACING.sm, marginBottom: SPACING.xs, paddingLeft: SPACING.xs },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  requirementText: { fontSize: 13, color: COLORS.grayMuted },
  requirementMet: { color: COLORS.primary },

  // Strength Bar
  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm, gap: 12 },
  strengthBarBg: { flex: 1, height: 4, backgroundColor: COLORS.grayBorder, borderRadius: 2, overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 12, fontWeight: '600', minWidth: 70 },

  // Match Indicator
  matchIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.sm, paddingLeft: SPACING.xs },
  matchText: { fontSize: 13 },
  matchTextValid: { color: COLORS.primary },
  matchTextError: { color: COLORS.error },

  // Button
  btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, marginTop: SPACING.xl },
  btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },

  // Footer
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 8, paddingBottom: 8 },
});
