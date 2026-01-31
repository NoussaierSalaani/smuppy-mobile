import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback, Keyboard, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GRADIENTS, FORM } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import {
  createAuthStyles,
  createAuthColors,
  createGetInputIconColor,
  createGetButtonGradient,
} from '../../components/auth/authStyles';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';
import { getCurrentProfile } from '../../services/database';
import {
  isAppleSignInAvailable,
  signInWithApple,
  useGoogleAuth,
  handleGoogleSignIn,
} from '../../services/socialAuth';

const GoogleLogo = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </Svg>
);

interface LoginScreenProps {
  navigation: {
    replace: (screen: string, params?: Record<string, unknown>) => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

const createLocalStyles = (colors: ThemeColors, authColors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 },

  // Header - sans flèche retour
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

  // Social
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  socialBtn: { width: 64, height: 64, borderRadius: 18, borderWidth: 1.5, borderColor: colors.grayBorder, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  socialBtnLoading: { opacity: 0.7 },

  // Forgot Password
  forgotBtn: { alignItems: 'center', marginBottom: 10 },
  forgotText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Link Row
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 13, color: colors.gray },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { fontSize: 13, fontWeight: '600', color: colors.primary },

  // Footer

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
  const authStylesThemed = useMemo(() => createAuthStyles(colors, isDark), [colors, isDark]);
  const iconColor = useMemo(() => createGetInputIconColor(authColors), [authColors]);
  const btnGradient = useMemo(() => createGetButtonGradient(authColors), [authColors]);
  const styles = useMemo(() => createLocalStyles(colors, authColors), [colors, authColors]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  // Social auth state
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);

  // Google OAuth hook
  const [googleRequest, googleResponse, googlePromptAsync] = useGoogleAuth();

  // Check Apple Sign-In availability
  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Handle Google OAuth response
  useEffect(() => {
    if (googleResponse) {
      handleGoogleAuthResponse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  const handleGoogleAuthResponse = async () => {
    setSocialLoading('google');
    const result = await handleGoogleSignIn(googleResponse);

    if (result.success) {
      // Fire-and-forget — onAuthStateChange handles navigation
      storage.set(STORAGE_KEYS.REMEMBER_ME, 'true').catch(() => {});
    } else if (result.error && result.error !== 'cancelled') {
      setErrorModal({
        visible: true,
        title: 'Google Sign-In Failed',
        message: result.error,
      });
    }
    setSocialLoading(null);
  };

  // Navigation - remplace l'écran pour éviter l'empilement
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

    // Prevent double-tap: set loading BEFORE any async operation
    if (loading) return;
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Check AWS rate limit
      const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-login');
      if (!awsCheck.allowed) {
        setErrorModal({
          visible: true,
          title: 'Too Many Attempts',
          message: `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`,
        });
        setLoading(false);
        return;
      }

      // Progressive delay: if too many attempts, slow down the attacker
      if (awsCheck.shouldDelay && awsCheck.delayMs) {
        await new Promise(resolve => setTimeout(resolve, awsCheck.delayMs));
      }

      // Persist remember me flag (fire-and-forget, non-blocking)
      storage.set(STORAGE_KEYS.REMEMBER_ME, rememberMe ? 'true' : 'false').catch(() => {});

      // Use backend service which routes to AWS Cognito
      const user = await backend.signIn({ email: normalizedEmail, password });

      if (!user) {
        // signIn failed — clean up the flag we just wrote
        await storage.delete(STORAGE_KEYS.REMEMBER_ME);
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
        return;
      }

      const profileResult = await getCurrentProfile(false).catch(() => ({ data: null }));

      // Check if user has a profile - if not, navigate to onboarding
      // (onAuthStateChange handles Main navigation for users WITH profiles)
      if (!profileResult.data) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'AccountType' }],
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || '';

      // SECURITY: Generic message for ALL auth errors to prevent information leakage
      // Don't reveal if email exists, if account is unconfirmed, etc.
      if (errorMessage.includes('Too many') || errorMessage.includes('rate') || errorMessage.includes('limit')) {
        // Only exception: rate limiting (user needs to know to wait)
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
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, rememberMe, loading]);

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

  // Handle Apple Sign-In
  const handleAppleSignIn = useCallback(async () => {
    setSocialLoading('apple');
    const result = await signInWithApple();

    if (result.success) {
      storage.set(STORAGE_KEYS.REMEMBER_ME, 'true').catch(() => {});
    } else if (result.error && result.error !== 'cancelled') {
      setErrorModal({
        visible: true,
        title: 'Apple Sign-In Failed',
        message: result.error,
      });
    }
    setSocialLoading(null);
  }, []);

  // Handle Google Sign-In
  const handleGoogleSignInPress = useCallback(async () => {
    if (!googleRequest) {
      setErrorModal({
        visible: true,
        title: 'Google Sign-In Unavailable',
        message: 'Google Sign-In is not configured. Please try again later.',
      });
      return;
    }
    setSocialLoading('google');
    await googlePromptAsync();
    // Response will be handled by the useEffect
  }, [googleRequest, googlePromptAsync]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container} testID="login-screen">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            
            {/* Header - PAS de flèche retour */}
            <View style={styles.header}>
              <Text style={styles.title}>Login to Smuppy</Text>
              <Text style={styles.subtitle}>Together for personalized well-being!</Text>
            </View>

            {/* Email Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
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
                    placeholder="mailusersmuppy@mail.com"
                    placeholderTextColor={colors.grayMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    testID="email-input"
                  />
                </View>
              </LinearGradient>
            </View>

            {/* Password Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
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
                  />
                  <TouchableOpacity onPress={togglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={colors.grayMuted} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* Remember Me */}
            <TouchableOpacity style={styles.rememberRow} onPress={toggleRememberMe} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
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
              accessibilityLabel="submit-login-button"
              accessibilityRole="button"
            >
              <LinearGradient
                colors={isFormValid ? GRADIENTS.primary : GRADIENTS.buttonDisabled}
                start={GRADIENTS.primaryStart}
                end={GRADIENTS.primaryEnd}
                style={styles.btn}
              >
                <View style={styles.btnInner}>
                  <Text style={styles.btnText}>{loading ? 'Logging in...' : 'Login'}</Text>
                  {!loading && <Ionicons name="arrow-forward" size={20} color={colors.white} />}
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={[styles.socialBtn, socialLoading === 'google' && styles.socialBtnLoading]}
                activeOpacity={0.7}
                onPress={handleGoogleSignInPress}
                disabled={socialLoading !== null}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <GoogleLogo size={28} />
                )}
              </TouchableOpacity>
              {(Platform.OS === 'ios' && appleAvailable) && (
                <TouchableOpacity
                  style={[styles.socialBtn, socialLoading === 'apple' && styles.socialBtnLoading]}
                  activeOpacity={0.7}
                  onPress={handleAppleSignIn}
                  disabled={socialLoading !== null}
                >
                  {socialLoading === 'apple' ? (
                    <ActivityIndicator size="small" color={colors.dark} />
                  ) : (
                    <Ionicons name="logo-apple" size={30} color={colors.dark} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Forgot Password - PAS de cooldown */}
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Signup Link */}
            <View style={styles.linkRow}>
              <Text style={styles.linkText}>Don't have an account? </Text>
              <TouchableOpacity onPress={handleGoToSignup} style={styles.linkBtn}>
                <Text style={styles.link}>Signup</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>

                      </ScrollView>
        </KeyboardAvoidingView>

        {/* Error Modal */}
        <Modal visible={errorModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity style={styles.modalClose} onPress={closeErrorModal}>
                <Ionicons name="close" size={24} color={colors.gray} />
              </TouchableOpacity>
              <View style={[styles.modalIconBox, { backgroundColor: colors.errorLight }]}>
                <Ionicons name="alert-circle" size={40} color={colors.error} />
              </View>
              <Text style={styles.modalTitle}>{errorModal.title}</Text>
              <Text style={styles.modalMessage}>{errorModal.message}</Text>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.error }]} onPress={closeErrorModal}>
                <Text style={styles.modalBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}
