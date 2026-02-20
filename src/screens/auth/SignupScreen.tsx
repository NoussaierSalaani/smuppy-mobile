import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SPACING } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { GoogleLogo } from '../../components/auth';
import ErrorModal from '../../components/ErrorModal';
import { validate, isPasswordValid, getPasswordStrengthLevel, PASSWORD_RULES, isDisposableEmail, detectDomainTypo } from '../../utils/validation';
import { awsAPI } from '../../services/aws-api';
import * as backend from '../../services/backend';
import { useSocialAuth } from '../../hooks/useSocialAuth';
import {
  createAuthColors,
  AUTH_FORM,
} from '../../components/auth/authStyles';

type SignupScreenProps = Readonly<{
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}>;

export default function SignupScreen({ navigation }: SignupScreenProps) {

  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const [rememberMe, setRememberMe] = useState(false);

  // Ref for mount tracking
  const isMountedRef = useRef(true);

  // Mount tracking
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // Social auth via shared hook
  const onSocialError = useCallback((title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  }, []);

  const { appleAvailable, socialLoading, handleAppleSignIn, handleGoogleSignInPress } = useSocialAuth({
    errorPrefix: 'Sign-Up',
    onError: onSocialError,
  });

  // Theme-aware styles
  const authColors = useMemo(() => createAuthColors(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark, authColors), [colors, isDark, authColors]);
  const buttonGradient = useMemo(() => {
    const valid: [string, string] = [colors.primary, colors.primaryDark];
    const disabled: [string, string] = [authColors.border, authColors.border];
    return { valid, disabled };
  }, [colors, authColors]);
  const inputGradient = useMemo(() => {
    const active: [string, string] = [colors.primary, colors.primaryDark];
    const inactive: [string, string] = [authColors.border, authColors.border];
    return { active, inactive };
  }, [colors, authColors]);

  // Memoized toggle handlers to prevent inline arrow functions
  const toggleRememberMe = useCallback(() => {
    setRememberMe(prev => !prev);
  }, []);

  const toggleAgreeTerms = useCallback(() => {
    setAgreeTerms(prev => !prev);
  }, []);

  const handleGoToLogin = useCallback(() => {
    navigation.navigate('Login');
  }, [navigation]);

  const handleEmailFocus = useCallback(() => setEmailFocused(true), []);
  const handleEmailBlur = useCallback(() => setEmailFocused(false), []);
  const handlePasswordFocus = useCallback(() => setPasswordFocused(true), []);
  const handlePasswordBlur = useCallback(() => setPasswordFocused(false), []);
  const handleTogglePassword = useCallback(() => setShowPassword(prev => !prev), []);
  const handleOpenTerms = useCallback(() => { WebBrowser.openBrowserAsync('https://smuppy.com/terms'); }, []);
  const handleOpenPrivacy = useCallback(() => { WebBrowser.openBrowserAsync('https://smuppy.com/privacy'); }, []);
  const handleOpenContentPolicy = useCallback(() => { WebBrowser.openBrowserAsync('https://smuppy.com/content-policy'); }, []);
  const handleCloseErrorModal = useCallback(() => setErrorModal(prev => ({ ...prev, visible: false })), []);

  const passwordValid = isPasswordValid(password);
  const strengthLevel = getPasswordStrengthLevel(password);
  const emailValid = validate.email(email);
  const isFormValid = emailValid && passwordValid && agreeTerms;

  // Password requirements checklist
  const passwordChecks = useMemo(() =>
    PASSWORD_RULES.map((rule) => ({
      id: rule.id,
      label: rule.label,
      passed: rule.test(password),
    })), [password]);

  const allChecksPassed = passwordChecks.every((check) => check.passed);

  const strengthBarStyle = useMemo(() => [
    styles.strengthBar,
    {
      width: (strengthLevel.level === 'weak' ? '25%' : strengthLevel.level === 'medium' ? '50%' : strengthLevel.level === 'strong' ? '75%' : '100%') as `${number}%`,
      backgroundColor: strengthLevel.color,
    },
  ], [styles.strengthBar, strengthLevel]);
  const strengthTextStyle = useMemo(() => [styles.strengthText, { color: strengthLevel.color }], [styles.strengthText, strengthLevel.color]);

  const handleSignup = useCallback(async () => {
    if (!isFormValid || loading) return;

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      if (isDisposableEmail(normalizedEmail)) {
        setErrorModal({
          visible: true,
          title: 'Invalid Email',
          message: 'Temporary/disposable emails are not allowed.',
        });
        return;
      }

      const typoCheck = detectDomainTypo(normalizedEmail);
      if (typoCheck.isTypo && typoCheck.suggestion) {
        setErrorModal({
          visible: true,
          title: 'Check Your Email',
          message: `Did you mean @${typoCheck.suggestion}?`,
        });
        return;
      }

      const [validationResult, userCheckResult] = await Promise.allSettled([
        awsAPI.validateEmail(normalizedEmail),
        awsAPI.checkUserExists(normalizedEmail),
      ]);

      if (!isMountedRef.current) return;

      if (validationResult.status === 'fulfilled') {
        if (!validationResult.value.valid) {
          setErrorModal({
            visible: true,
            title: 'Invalid Email',
            message: validationResult.value.error || 'Please enter a valid email address.',
          });
          return;
        }
      } else {
        setErrorModal({
          visible: true,
          title: 'Email Verification Failed',
          message: 'Unable to verify email address. Please check and try again.',
        });
        return;
      }

      if (userCheckResult.status === 'fulfilled') {
        if (!userCheckResult.value.canSignup) {
          setErrorModal({
            visible: true,
            title: 'Unable to Continue',
            message: 'Unable to create account. Please try again.',
          });
          return;
        }
      }

      const signUpResult = await backend.signUp({
        email: normalizedEmail,
        password,
        username: normalizedEmail.split('@')[0],
        fullName: '',
      });

      if (!isMountedRef.current) return;

      if (!signUpResult.confirmationRequired && !signUpResult.user) {
        setErrorModal({
          visible: true,
          title: 'Error',
          message: 'Unable to create account. Please try again.',
        });
        return;
      }

      // Record GDPR consent (fire-and-forget — user already checked the terms box)
      awsAPI.recordConsent([
        { type: 'terms_of_service', version: '1.0' },
        { type: 'privacy_policy', version: '1.0' },
      ]).catch(() => {
        // Best-effort: consent will be recorded on next login if this fails
        if (__DEV__) console.warn('[Signup] Failed to record consent');
      });

      navigation.navigate('VerifyCode', {
        email: normalizedEmail,
        password,
        rememberMe,
        accountCreated: true,
      });
    } catch {
      if (!isMountedRef.current) return;

      setErrorModal({
        visible: true,
        title: 'Error',
        message: 'An unexpected error occurred. Please try again.'
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [isFormValid, loading, email, password, rememberMe, navigation]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container} testID="signup-screen">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Spacer to replace Back button (same height as LoginScreen) */}
            <View style={styles.backBtnSpacer} />

            {/* Header */}
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Create an Account</Text>
              <Text style={styles.subtitle}>A platform to connect, inspire, track and have fun</Text>
            </View>

            {/* Email */}
            <Text style={styles.label}>Email address</Text>
            {(!emailFocused && email.length > 0 && !emailValid) ? (
              <View style={[styles.inputBox, styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={authColors.error} />
                <TextInput
                  style={styles.input}
                  placeholder="mailusersmuppy@mail.com"
                  placeholderTextColor={authColors.grayLight}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  onFocus={handleEmailFocus}
                  onBlur={handleEmailBlur}
                />
              </View>
            ) : (
              <LinearGradient
                colors={(email.length > 0 || emailFocused) ? inputGradient.active : inputGradient.inactive}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, email.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="mail-outline" size={20} color={(email.length > 0 || emailFocused) ? authColors.primary : authColors.grayLight} />
                  <TextInput
                    style={styles.input}
                    placeholder="mailusersmuppy@mail.com"
                    placeholderTextColor={authColors.grayLight}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={254}
                    onFocus={handleEmailFocus}
                    onBlur={handleEmailBlur}
                  />
                  {email.length > 0 && emailValid && <Ionicons name="checkmark-circle" size={20} color={authColors.primary} />}
                </View>
              </LinearGradient>
            )}
            {!emailFocused && email.length > 0 && !emailValid && (
              <Text style={styles.errorText}>
                {(() => {
                  if (isDisposableEmail(email)) {
                    return 'Temporary/disposable emails are not allowed';
                  }
                  const typoCheck = detectDomainTypo(email);
                  if (typoCheck.isTypo && typoCheck.suggestion) {
                    return `Did you mean @${typoCheck.suggestion}?`;
                  }
                  return 'Please enter a valid email address';
                })()}
              </Text>
            )}

            {/* Password Section with Overlay */}
            <View style={styles.passwordSection}>
              <Text style={styles.labelPassword}>Password</Text>
              <LinearGradient
                colors={(password.length > 0 || passwordFocused) ? inputGradient.active : inputGradient.inactive}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorderPassword}
              >
                <View style={[styles.inputInnerPassword, password.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || passwordFocused) ? authColors.primary : authColors.grayLight} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor={authColors.grayLight}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    maxLength={128}
                    onFocus={handlePasswordFocus}
                    onBlur={handlePasswordBlur}
                  />
                  <TouchableOpacity
                    onPress={handleTogglePassword}
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityRole="button"
                    accessibilityHint="Toggles password visibility"
                  >
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={authColors.grayLight} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              {/* Password Requirements Overlay - show when focused and not all checks passed */}
              {passwordFocused && !allChecksPassed && (
                <View style={styles.requirementsOverlay}>
                  <View style={styles.requirementsBox}>
                    <Text style={styles.requirementsTitle}>Password must contain:</Text>
                    {passwordChecks.map((check) => (
                      <View key={check.id} style={styles.requirementRow}>
                        <Ionicons
                          name={check.passed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={check.passed ? authColors.primary : authColors.grayLight}
                        />
                        <Text style={[styles.requirementText, check.passed && styles.requirementMet]}>
                          {check.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Password Strength Bar */}
            {password.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarBg}>
                  <View style={strengthBarStyle} />
                </View>
                <Text style={strengthTextStyle}>{strengthLevel.label}</Text>
              </View>
            )}

            {/* Remember Me */}
            <View style={styles.rememberRow}>
              <TouchableOpacity
                onPress={toggleRememberMe}
                activeOpacity={0.7}
                accessibilityLabel="Remember me"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                accessibilityHint="Keep me signed in on this device"
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
              </TouchableOpacity>
              <Text style={styles.checkboxLabel}>Remember me</Text>
            </View>

            {/* Signup Button */}
            <LinearGradient
              colors={isFormValid ? buttonGradient.valid : buttonGradient.disabled}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              <TouchableOpacity
                style={styles.btnInner}
                onPress={handleSignup}
                disabled={!isFormValid || loading}
                activeOpacity={0.8}
                accessibilityLabel={loading ? "Validating account" : "Get Started"}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isFormValid || loading }}
                accessibilityHint="Creates your account and continues to verification"
                testID="submit-signup-button"
              >
                <Text style={styles.btnText}>{loading ? 'Validating...' : 'Get Started'}</Text>
                {!loading && <Ionicons name="arrow-forward" size={20} color={colors.white} />}
              </TouchableOpacity>
            </LinearGradient>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons */}
            <TouchableOpacity
              style={[styles.socialBtn, socialLoading === 'google' && styles.socialBtnLoading]}
              activeOpacity={0.7}
              onPress={handleGoogleSignInPress}
              disabled={socialLoading !== null}
              accessibilityLabel="Continue with Google"
              accessibilityRole="button"
              accessibilityState={{ disabled: socialLoading !== null, busy: socialLoading === 'google' }}
              accessibilityHint="Sign up using your Google account"
              testID="social-google-button"
            >
              {socialLoading === 'google' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <GoogleLogo size={24} />
              )}
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </TouchableOpacity>

            {(Platform.OS === 'ios' && appleAvailable) && (
              <TouchableOpacity
                style={[styles.socialBtn, socialLoading === 'apple' && styles.socialBtnLoading]}
                activeOpacity={0.7}
                onPress={handleAppleSignIn}
                disabled={socialLoading !== null}
                accessibilityLabel="Continue with Apple"
                accessibilityRole="button"
                accessibilityState={{ disabled: socialLoading !== null, busy: socialLoading === 'apple' }}
                accessibilityHint="Sign up using your Apple ID"
                testID="social-apple-button"
              >
                {socialLoading === 'apple' ? (
                  <ActivityIndicator size="small" color={authColors.dark} />
                ) : (
                  <Ionicons name="logo-apple" size={26} color={authColors.dark} />
                )}
                <Text style={styles.socialBtnText}>Continue with Apple</Text>
              </TouchableOpacity>
            )}

            {/* Login Link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={handleGoToLogin}
                style={styles.loginLinkRow}
                accessibilityLabel="Log In"
                accessibilityRole="link"
                accessibilityHint="Navigate to the login screen"
              >
                <Text style={styles.loginLink}>Log In</Text>
                <Ionicons name="arrow-forward" size={14} color={authColors.primary} />
              </TouchableOpacity>
            </View>

            {/* Terms */}
            <View style={styles.termsRow}>
              <TouchableOpacity
                onPress={toggleAgreeTerms}
                activeOpacity={0.7}
                accessibilityLabel="I agree to the Terms and Conditions, Privacy Policy, and Content Policy"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreeTerms }}
                accessibilityHint="Required to create an account"
              >
                <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
                  {agreeTerms && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.termsLink} onPress={handleOpenTerms} accessibilityRole="link">Terms and Conditions</Text>
                ,{' '}
                <Text style={styles.termsLink} onPress={handleOpenPrivacy} accessibilityRole="link">Privacy Policy</Text>
                {' '}and{' '}
                <Text style={styles.termsLink} onPress={handleOpenContentPolicy} accessibilityRole="link">Content Policy</Text>.
              </Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        <ErrorModal visible={errorModal.visible} onClose={handleCloseErrorModal} title={errorModal.title} message={errorModal.message} />

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean, ac: ReturnType<typeof createAuthColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    keyboardView: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: 24 },
    backBtnSpacer: { height: 32 },

    // Header
    headerContainer: { alignItems: 'center', marginBottom: 32 },
    title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: ac.dark, textAlign: 'center', marginBottom: 4 },
    subtitle: { fontSize: 14, color: ac.gray, textAlign: 'center' },

    // Form
    label: { fontSize: 14, fontWeight: '600', color: ac.dark, marginTop: 30, marginBottom: 8 },
    labelPassword: { fontSize: 14, fontWeight: '600', color: ac.dark, marginBottom: 8, marginTop: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', height: AUTH_FORM.inputHeight, borderWidth: 1.5, borderColor: ac.border, borderRadius: AUTH_FORM.inputRadius, paddingHorizontal: 20, marginBottom: 16, backgroundColor: colors.background },
    inputGradientBorder: { borderRadius: AUTH_FORM.inputRadius, padding: 2, marginBottom: 16 },
    inputInner: { flexDirection: 'row', alignItems: 'center', height: AUTH_FORM.inputHeight - 4, borderRadius: AUTH_FORM.inputRadius - 2, paddingHorizontal: 18, backgroundColor: colors.background },
    inputGradientBorderPassword: { borderRadius: AUTH_FORM.inputRadius, padding: 2, marginBottom: 8 },
    inputInnerPassword: { flexDirection: 'row', alignItems: 'center', height: AUTH_FORM.inputHeight - 4, borderRadius: AUTH_FORM.inputRadius - 2, paddingHorizontal: 18, backgroundColor: colors.background },
    inputInnerValid: { backgroundColor: ac.validBg },
    inputError: { borderColor: ac.error, borderWidth: 2, backgroundColor: ac.errorInputBg, marginBottom: 4 },
    input: { flex: 1, fontSize: 16, color: ac.dark, marginLeft: 12 },
    errorText: { fontSize: 13, color: ac.error, marginBottom: 16, marginLeft: 8 },

    // Password Section
    passwordSection: { position: 'relative', zIndex: 100 },
    requirementsOverlay: { position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 1000, paddingTop: 4 },
    requirementsBox: { backgroundColor: colors.background, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.15, shadowRadius: 12, elevation: 8, borderWidth: 1, borderColor: ac.divider },
    requirementsTitle: { fontSize: 14, fontWeight: '600', color: ac.dark, marginBottom: 12 },
    requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    requirementText: { fontSize: 13, color: ac.grayLight },
    requirementMet: { color: ac.primary },

    // Strength
    strengthContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
    strengthBarBg: { flex: 1, height: 4, backgroundColor: ac.divider, borderRadius: 2, overflow: 'hidden' },
    strengthBar: { height: '100%', borderRadius: 2 },
    strengthText: { fontSize: 12, fontWeight: '600', minWidth: 70 },

    // Button
    btn: { height: AUTH_FORM.buttonHeight, borderRadius: AUTH_FORM.buttonRadius, marginBottom: 28 },
    btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    btnText: { color: colors.white, fontSize: 16, fontWeight: '600' },

    // Divider
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
    dividerLine: { flex: 1, height: 1, backgroundColor: ac.divider },
    dividerText: { paddingHorizontal: SPACING.sm, fontSize: 13, color: ac.gray },

    // Social
    socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: AUTH_FORM.buttonHeight, borderWidth: 1.5, borderColor: ac.divider, borderRadius: AUTH_FORM.buttonRadius, backgroundColor: colors.background, marginBottom: 12, gap: 10 },
    socialBtnLoading: { opacity: 0.7 },
    socialBtnText: { fontSize: 15, fontWeight: '500', color: ac.dark },

    // Login
    loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, marginBottom: 8 },
    loginText: { fontSize: 14, color: ac.gray },
    loginLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    loginLink: { fontSize: 14, fontWeight: '600', color: ac.primary },

    // Checkbox
    rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    checkbox: { width: 20, height: 20, borderWidth: 2, borderColor: ac.border, borderRadius: 5, marginRight: 10, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    checkboxChecked: { backgroundColor: ac.primary, borderColor: ac.primary },
    checkboxLabel: { fontSize: 13, fontWeight: '500', color: ac.dark },

    // Terms
    termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
    termsText: { flex: 1, fontSize: 12, color: ac.gray, lineHeight: 18 },
    termsLink: { color: ac.primary, fontWeight: '500' },
  });
