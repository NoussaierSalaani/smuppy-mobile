import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback, Keyboard, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GRADIENTS, FORM, HIT_SLOP } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { GoogleLogo } from '../../components/auth';
import { createAuthColors } from '../../components/auth/authStyles';
import { useSocialAuth } from '../../hooks/useSocialAuth';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';
import { getCurrentProfile } from '../../services/database';

interface LoginScreenProps {
  navigation: {
    replace: (screen: string, params?: Record<string, unknown>) => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

const createLocalStyles = (colors: ThemeColors, authColors: ReturnType<typeof createAuthColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 },

  // Header - no back arrow
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 18 },

  // Field Group
  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.dark, marginBottom: 8 },

  // Input
  inputBox: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: colors.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, backgroundColor: colors.background },
  inputGradientBorder: { borderRadius: FORM.inputRadius, padding: 2 },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight - 4, borderRadius: FORM.inputRadius - 2, paddingHorizontal: FORM.inputPaddingHorizontal - 2, backgroundColor: colors.background },
  inputInnerValid: { backgroundColor: authColors.validBg },
  input: { flex: 1, fontSize: 16, color: colors.dark, marginLeft: 12 },

  // Remember Me
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.grayLight, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: colors.background },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  rememberText: { fontSize: 13, fontWeight: '500', color: colors.dark },

  // Button
  btnTouchable: { marginBottom: 16 },
  btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, justifyContent: 'center', alignItems: 'center' },
  btnInner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '600' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.grayBorder },
  dividerText: { paddingHorizontal: 14, fontSize: 12, color: colors.gray },

  // Social — full-width capsule buttons (consistent with SignupScreen)
  socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: FORM.buttonHeight, borderWidth: 1.5, borderColor: colors.grayBorder, borderRadius: FORM.buttonRadius, backgroundColor: colors.background, marginBottom: 12, gap: 10 },
  socialBtnLoading: { opacity: 0.7 },
  socialBtnText: { fontSize: 15, fontWeight: '500', color: colors.dark },

  // Forgot Password
  forgotBtn: { alignItems: 'center', marginBottom: 10 },
  forgotText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Link Row
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 13, color: colors.gray },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', backgroundColor: colors.background, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  modalIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.dark, marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, justifyContent: 'center', alignItems: 'center' },
  modalBtnGradient: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius },
  modalBtnInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: colors.white },
});

export default function LoginScreen({ navigation }: LoginScreenProps) {

  const { colors, isDark } = useTheme();
  const authColors = useMemo(() => createAuthColors(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createLocalStyles(colors, authColors), [colors, authColors]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

  // Refs for mount tracking and preventing race conditions
  const isMountedRef = useRef(true);
  const loadingRef = useRef(false);

  // Mount tracking
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // Social auth via shared hook
  const onSocialError = useCallback((title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  }, []);

  const { appleAvailable, socialLoading, handleAppleSignIn, handleGoogleSignInPress } = useSocialAuth({
    errorPrefix: 'Sign-In',
    onError: onSocialError,
  });

  // Navigation - replaces screen to prevent stacking
  const handleGoToSignup = useCallback(() => {
    navigation.replace('Signup');
  }, [navigation]);

  const handleForgotPassword = useCallback(() => {
    navigation.navigate('ForgotPassword');
  }, [navigation]);

  const handleLogin = useCallback(async () => {
    if (__DEV__) console.log('[Login] handleLogin called', { email: email.replace(/^(.).*@/, '$1***@'), loading });

    if (!email || !password) {
      setErrorModal({
        visible: true,
        title: 'Missing Information',
        message: 'Please fill in all fields to continue.'
      });
      return;
    }

    // Prevent double-tap: use ref for synchronous check
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-login');
      if (!awsCheck.allowed) {
        setErrorModal({
          visible: true,
          title: 'Too Many Attempts',
          message: `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`,
        });
        return;
      }

      if (awsCheck.shouldDelay && awsCheck.delayMs) {
        await new Promise(resolve => setTimeout(resolve, awsCheck.delayMs));
      }

      storage.set(STORAGE_KEYS.REMEMBER_ME, rememberMe ? 'true' : 'false').catch(() => {});

      const user = await backend.signIn({ email: normalizedEmail, password });

      if (!isMountedRef.current) return;

      if (!user) {
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
        return;
      }

      const profileResult = await getCurrentProfile(false).catch(() => ({ data: null }));

      if (!isMountedRef.current) return;

      if (!profileResult.data) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'AccountType' }],
        });
      }
    } catch (error: unknown) {
      if (!isMountedRef.current) return;

      const errorMessage = (error as Error)?.message || '';

      if (errorMessage.includes('Too many') || errorMessage.includes('rate') || errorMessage.includes('limit')) {
        setErrorModal({
          visible: true,
          title: 'Too Many Attempts',
          message: 'Please wait a few minutes before trying again.',
        });
      } else {
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
      }
    } finally {
      loadingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, rememberMe]);

  const togglePassword = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const toggleRememberMe = useCallback(() => {
    setRememberMe(prev => !prev);
  }, []);

  const closeErrorModal = useCallback(() => {
    setErrorModal(prev => ({ ...prev, visible: false }));
  }, []);

  const isFormValid = email.length > 0 && password.length > 0;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container} testID="login-screen">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Header - NO back arrow */}
            <View style={styles.header}>
              <Text style={styles.title}>{"Welcome to Smuppy"}</Text>
              <Text style={styles.subtitle}>{"Connect with creators and fans around the world"}</Text>
            </View>

            {/* Email Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{"Email"}</Text>
              <LinearGradient
                colors={(email.length > 0 || emailFocused) ? GRADIENTS.button : [colors.grayBorder, colors.grayBorder]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, email.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="mail-outline" size={20} color={(email.length > 0 || emailFocused) ? colors.primary : colors.grayMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
                    placeholderTextColor={colors.grayMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    testID="email-input"
                    maxLength={254}
                  />
                </View>
              </LinearGradient>
            </View>

            {/* Password Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{"Password"}</Text>
              <LinearGradient
                colors={(password.length > 0 || passwordFocused) ? GRADIENTS.button : [colors.grayBorder, colors.grayBorder]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, password.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || passwordFocused) ? colors.primary : colors.grayMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor={colors.grayMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCorrect={false}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    testID="password-input"
                    maxLength={128}
                  />
                  <TouchableOpacity
                    onPress={togglePassword}
                    hitSlop={HIT_SLOP.medium}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide" : "Show"}
                    accessibilityHint="Double-tap to toggle password visibility"
                  >
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={colors.grayMuted} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* Remember Me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={toggleRememberMe}
              activeOpacity={0.7}
              accessible={true}
              accessibilityRole="checkbox"
              accessibilityLabel="Remember me"
              accessibilityState={{ checked: rememberMe }}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={styles.rememberText}>{"Session Reminders"}</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              onPress={() => {
                handleLogin();
              }}
              disabled={!isFormValid || loading}
              activeOpacity={0.8}
              style={styles.btnTouchable}
              testID="submit-login-button"
              accessible={true}
              accessibilityLabel={loading ? 'Logging in, please wait' : 'Login'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isFormValid || loading }}
            >
              <LinearGradient
                colors={isFormValid ? GRADIENTS.primary : GRADIENTS.buttonDisabled}
                start={GRADIENTS.primaryStart}
                end={GRADIENTS.primaryEnd}
                style={styles.btn}
              >
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>{loading ? "Loading..." : "Log In"}</Text>
                  {!loading && <Ionicons name="arrow-forward" size={20} color={colors.white} />}
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{"Or"}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons — full-width capsules */}
            <TouchableOpacity
              style={[styles.socialBtn, socialLoading === 'google' && styles.socialBtnLoading]}
              activeOpacity={0.7}
              onPress={handleGoogleSignInPress}
              disabled={socialLoading !== null}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={socialLoading === 'google' ? 'Signing in with Google' : 'Sign in with Google'}
              accessibilityState={{ disabled: socialLoading !== null }}
              testID="social-google-button"
            >
              {socialLoading === 'google' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <GoogleLogo size={24} />
              )}
              <Text style={styles.socialBtnText}>{"Continue with Google"}</Text>
            </TouchableOpacity>
            {(Platform.OS === 'ios' && appleAvailable) && (
              <TouchableOpacity
                style={[styles.socialBtn, socialLoading === 'apple' && styles.socialBtnLoading]}
                activeOpacity={0.7}
                onPress={handleAppleSignIn}
                disabled={socialLoading !== null}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={socialLoading === 'apple' ? 'Signing in with Apple' : 'Sign in with Apple'}
                accessibilityState={{ disabled: socialLoading !== null }}
                testID="social-apple-button"
              >
                {socialLoading === 'apple' ? (
                  <ActivityIndicator size="small" color={colors.dark} />
                ) : (
                  <Ionicons name="logo-apple" size={26} color={colors.dark} />
                )}
                <Text style={styles.socialBtnText}>{"Continue with Apple"}</Text>
              </TouchableOpacity>
            )}

            {/* Forgot Password - NO cooldown */}
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotBtn}
              accessible={true}
              accessibilityRole="link"
              accessibilityLabel="Forgot password"
              accessibilityHint="Double-tap to reset your password"
            >
              <Text style={styles.forgotText}>{"Forgot password?"}</Text>
            </TouchableOpacity>

            {/* Signup Link */}
            <View style={styles.linkRow}>
              <Text style={styles.linkText}>{"Don't have an account?"} </Text>
              <TouchableOpacity
                onPress={handleGoToSignup}
                style={styles.linkBtn}
                accessible={true}
                accessibilityRole="link"
                accessibilityLabel="Sign up"
                accessibilityHint="Double-tap to create a new account"
              >
                <Text style={styles.link}>{"Sign Up"}</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>

                      </ScrollView>
        </KeyboardAvoidingView>

        {/* Error Modal */}
        <Modal visible={errorModal.visible} transparent animationType="fade" accessibilityViewIsModal={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent} accessibilityRole="alert">
              <TouchableOpacity
                style={styles.modalClose}
                onPress={closeErrorModal}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Close error message"
              >
                <Ionicons name="close" size={24} color={colors.gray} />
              </TouchableOpacity>
              <View style={[styles.modalIconBox, { backgroundColor: colors.errorLight }]}>
                <Ionicons name="alert-circle" size={40} color={colors.error} />
              </View>
              <Text style={styles.modalTitle}>{errorModal.title}</Text>
              <Text style={styles.modalMessage}>{errorModal.message}</Text>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.error }]}
                onPress={closeErrorModal}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error"
              >
                <Text style={styles.modalBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
