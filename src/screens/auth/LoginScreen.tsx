import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback, Keyboard, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, GRADIENTS, FORM } from '../../config/theme';
import { biometrics } from '../../utils/biometrics';
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

type BiometricType = 'face' | 'fingerprint' | 'iris' | null;

interface LoginScreenProps {
  navigation: {
    replace: (screen: string, params?: Record<string, unknown>) => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [biometricBlocked, setBiometricBlocked] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const [successModal, setSuccessModal] = useState({ visible: false, title: '', message: '' });
  // Social auth state
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'apple' | 'google' | null>(null);

  // Google OAuth hook
  const [googleRequest, googleResponse, googlePromptAsync] = useGoogleAuth();

  // Check Apple Sign-In availability and biometrics
  useEffect(() => {
    checkBiometrics();
    isAppleSignInAvailable().then(setAppleAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      try {
        const { data: profile } = await getCurrentProfile(false);
        if (!profile) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'AccountType' }],
          });
        }
      } catch {
        // Let onAuthStateChange handle it
      }
    } else if (result.error && result.error !== 'cancelled') {
      setErrorModal({
        visible: true,
        title: 'Google Sign-In Failed',
        message: result.error,
      });
    }
    setSocialLoading(null);
  };

  const checkBiometrics = useCallback(async () => {
    const available = await biometrics.isAvailable();
    setBiometricSupported(available);
    if (available) {
      const type = await biometrics.getType();
      setBiometricType(type);
      const enabled = await biometrics.isEnabled();
      setBiometricEnabled(enabled);
      if (enabled) {
        const blockStatus = await biometrics.isBlocked();
        setBiometricBlocked(blockStatus.blocked);
      }
    }
  }, []);

  const isFaceId = biometricType === 'face';

  // Navigation - remplace l'écran pour éviter l'empilement
  const handleGoToSignup = useCallback(() => {
    navigation.replace('Signup');
  }, [navigation]);

  const handleForgotPassword = useCallback(() => {
    navigation.navigate('ForgotPassword');
  }, [navigation]);

  const handleEnableBiometric = useCallback(async () => {
    // SECURITY: From login screen, we need the password to enable biometrics
    // If the user has entered their password, use it; otherwise show error
    if (!password) {
      setErrorModal({
        visible: true,
        title: 'Password Required',
        message: 'Please enter your password first to enable biometric login.'
      });
      return;
    }

    // Create a password verification function that uses AWS auth
    const verifyPassword = async (): Promise<boolean> => {
      try {
        // We need to verify this is the correct password for this account
        // Use signIn to verify (it will fail if wrong password)
        const normalizedEmail = email.trim().toLowerCase();
        await backend.signIn({ email: normalizedEmail, password });
        return true;
      } catch {
        return false;
      }
    };

    const result = await biometrics.enable(verifyPassword);
    if (result.success) {
      setBiometricEnabled(true);
      setSuccessModal({
        visible: true,
        title: `${isFaceId ? 'Face ID' : 'Touch ID'} Enabled!`,
        message: `You can now use ${isFaceId ? 'Face ID' : 'Touch ID'} for faster login.`
      });
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil((result.remainingSeconds ?? 60) / 60);
      setErrorModal({
        visible: true,
        title: 'Too Many Attempts',
        message: `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`
      });
    } else if (result.error === 'Password verification failed') {
      setErrorModal({
        visible: true,
        title: 'Verification Failed',
        message: 'The password you entered is incorrect. Please try again.'
      });
    }
  }, [isFaceId, email, password]);

  const handleBiometricLogin = useCallback(async () => {
    const blockStatus = await biometrics.isBlocked();
    if (blockStatus.blocked) {
      const minutes = Math.ceil(blockStatus.remainingSeconds / 60);
      setErrorModal({
        visible: true,
        title: 'Too Many Attempts',
        message: `${isFaceId ? 'Face ID' : 'Touch ID'} is temporarily blocked. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} or use your password.`
      });
      setBiometricBlocked(true);
      return;
    }
    const result = await biometrics.loginWithBiometrics();
    if (result.success) {
      // Check if we have a valid session via backend
      const currentUser = await backend.getCurrentUser();
      if (currentUser) {
        // Biometric login implies persistent session
        await storage.set(STORAGE_KEYS.REMEMBER_ME, 'true');
        return;
      }
      setErrorModal({
        visible: true,
        title: 'Session Expired',
        message: 'Your session has expired. Please login with your password to continue.'
      });
      // Disable biometrics since session is invalid
      setBiometricEnabled(false);
    } else if (result.error === 'session_expired') {
      // SECURITY: Biometric session expired after 30 days of inactivity
      // User must re-authenticate with password
      setErrorModal({
        visible: true,
        title: 'Session Expired',
        message: 'For your security, biometric login has been disabled after 30 days of inactivity. Please login with your password.'
      });
      setBiometricEnabled(false);
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil((result.remainingSeconds ?? 60) / 60);
      setErrorModal({
        visible: true,
        title: 'Too Many Attempts',
        message: `${isFaceId ? 'Face ID' : 'Touch ID'} is temporarily blocked. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} or use your password.`
      });
      setBiometricBlocked(true);
    } else if (result.attemptsLeft !== undefined && result.attemptsLeft > 0) {
      setErrorModal({
        visible: true,
        title: 'Authentication Failed',
        message: `${isFaceId ? 'Face ID' : 'Touch ID'} failed. ${result.attemptsLeft} attempt${result.attemptsLeft > 1 ? 's' : ''} remaining.`
      });
    }
  }, [isFaceId]);

  const handleLogin = useCallback(async () => {
    if (__DEV__) console.log('[Login] handleLogin called', { email: email.replace(/^(.).*@/, '$1***@'), loading });

    if (!email || !password) {
      console.log('[Login] Missing email or password');
      setErrorModal({
        visible: true,
        title: 'Missing Information',
        message: 'Please fill in all fields to continue.'
      });
      return;
    }

    // Prevent double-tap: set loading BEFORE any async operation
    if (loading) {
      console.log('[Login] Already loading, skipping');
      return;
    }
    console.log('[Login] Setting loading to true');
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

      // Use backend service which routes to AWS Cognito
      const user = await backend.signIn({ email: normalizedEmail, password });

      if (!user) {
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
        return;
      }

      // Parallelize post-login operations
      const [, , profileResult] = await Promise.all([
        storage.set(STORAGE_KEYS.REMEMBER_ME, rememberMe ? 'true' : 'false'),
        biometrics.resetAttempts(),
        getCurrentProfile(false).catch(() => ({ data: null })),
      ]);
      setBiometricBlocked(false);

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

  const closeSuccessModal = useCallback(() => {
    setSuccessModal(prev => ({ ...prev, visible: false }));
  }, []);

  const isFormValid = email.length > 0 && password.length > 0;

  // Handle Apple Sign-In
  const handleAppleSignIn = useCallback(async () => {
    setSocialLoading('apple');
    const result = await signInWithApple();

    if (result.success) {
      try {
        const { data: profile } = await getCurrentProfile(false);
        if (!profile) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'AccountType' }],
          });
        }
      } catch {
        // Let onAuthStateChange handle it
      }
    } else if (result.error && result.error !== 'cancelled') {
      setErrorModal({
        visible: true,
        title: 'Apple Sign-In Failed',
        message: result.error,
      });
    }
    setSocialLoading(null);
  }, [navigation]);

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

  const renderBiometricSection = () => {
    if (!biometricSupported) return null;
    if (biometricEnabled) {
      return (
        <>
          <TouchableOpacity 
            style={[styles.biometricBtn, biometricBlocked && styles.biometricBtnDisabled]} 
            onPress={handleBiometricLogin} 
            activeOpacity={0.8} 
            disabled={biometricBlocked}
          >
            <View style={[styles.biometricIconBox, biometricBlocked && styles.biometricIconBoxDisabled]}>
              <Ionicons 
                name={isFaceId ? 'scan-outline' : 'finger-print-outline'} 
                size={28} 
                color={biometricBlocked ? COLORS.grayMuted : COLORS.primary} 
              />
            </View>
            <Text style={[styles.biometricText, biometricBlocked && styles.biometricTextDisabled]}>
              {biometricBlocked 
                ? `${isFaceId ? 'Face ID' : 'Touch ID'} temporarily blocked` 
                : `Login with ${isFaceId ? 'Face ID' : 'Touch ID'}`
              }
            </Text>
          </TouchableOpacity>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or use password</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      );
    }
    return (
      <>
        <TouchableOpacity
          style={styles.biometricBtn}
          onPress={handleEnableBiometric}
          activeOpacity={0.8}
        >
          <View style={styles.biometricIconBox}>
            <Ionicons
              name={isFaceId ? 'scan-outline' : 'finger-print-outline'}
              size={28}
              color={COLORS.primary}
            />
          </View>
          <Text style={styles.biometricText}>
            Enable {isFaceId ? 'Face ID' : 'Touch ID'}
          </Text>
        </TouchableOpacity>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or use password</Text>
          <View style={styles.dividerLine} />
        </View>
      </>
    );
  };

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

            {/* Biometric Section */}
            {renderBiometricSection()}

            {/* Email Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <LinearGradient
                colors={(email.length > 0 || emailFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, email.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="mail-outline" size={20} color={(email.length > 0 || emailFocused) ? COLORS.primary : COLORS.grayMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="mailusersmuppy@mail.com"
                    placeholderTextColor={COLORS.grayMuted}
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
                colors={(password.length > 0 || passwordFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, password.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || passwordFocused) ? COLORS.primary : COLORS.grayMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor={COLORS.grayMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCorrect={false}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    testID="password-input"
                  />
                  <TouchableOpacity onPress={togglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>

            {/* Remember Me */}
            <TouchableOpacity style={styles.rememberRow} onPress={toggleRememberMe} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              onPress={() => {
                console.log('[Login] Button pressed!', { isFormValid, loading, disabled: !isFormValid || loading });
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
                  {!loading && <Ionicons name="arrow-forward" size={20} color={COLORS.white} />}
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
                  <ActivityIndicator size="small" color={COLORS.primary} />
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
                    <ActivityIndicator size="small" color={COLORS.dark} />
                  ) : (
                    <Ionicons name="logo-apple" size={30} color={COLORS.dark} />
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
                <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

                      </ScrollView>
        </KeyboardAvoidingView>

        {/* Error Modal */}
        <Modal visible={errorModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity style={styles.modalClose} onPress={closeErrorModal}>
                <Ionicons name="close" size={24} color={COLORS.gray} />
              </TouchableOpacity>
              <View style={[styles.modalIconBox, { backgroundColor: COLORS.errorLight }]}>
                <Ionicons name="alert-circle" size={40} color={COLORS.error} />
              </View>
              <Text style={styles.modalTitle}>{errorModal.title}</Text>
              <Text style={styles.modalMessage}>{errorModal.message}</Text>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.error }]} onPress={closeErrorModal}>
                <Text style={styles.modalBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Success Modal */}
        <Modal visible={successModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={[styles.modalIconBox, { backgroundColor: COLORS.backgroundValid }]}>
                <Ionicons name="checkmark-circle" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.modalTitle}>{successModal.title}</Text>
              <Text style={styles.modalMessage}>{successModal.message}</Text>
              <LinearGradient colors={GRADIENTS.primary} start={GRADIENTS.primaryStart} end={GRADIENTS.primaryEnd} style={styles.modalBtnGradient}>
                <TouchableOpacity style={styles.modalBtnInner} onPress={closeSuccessModal}>
                  <Text style={styles.modalBtnText}>Got it!</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 40, paddingBottom: 24 },

  // Header - sans flèche retour
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 18 },

  // Biometric
  biometricBtn: { alignItems: 'center', paddingVertical: 12, marginBottom: 6 },
  biometricBtnDisabled: { opacity: 0.6 },
  biometricIconBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.backgroundValid, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, marginBottom: 8 },
  biometricIconBoxDisabled: { backgroundColor: COLORS.backgroundDisabled, borderColor: COLORS.grayLight },
  biometricText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  biometricTextDisabled: { color: COLORS.grayMuted },
  enableBiometricBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundFocus, borderRadius: 14, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.buttonBorder },
  enableBiometricLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  enableBiometricIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundValid, justifyContent: 'center', alignItems: 'center' },
  enableBiometricTitle: { fontSize: 13, fontWeight: '600', color: COLORS.dark },
  enableBiometricSubtitle: { fontSize: 10, color: COLORS.gray, marginTop: 1 },

  // Field Group
  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  
  // Input
  inputBox: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, backgroundColor: COLORS.white },
  inputGradientBorder: { borderRadius: FORM.inputRadius, padding: 2 },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight - 4, borderRadius: FORM.inputRadius - 2, paddingHorizontal: FORM.inputPaddingHorizontal - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: COLORS.backgroundValid },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: 12 },

  // Remember Me
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: COLORS.white },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rememberText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },

  // Button
  btnTouchable: { marginBottom: 16 },
  btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, justifyContent: 'center', alignItems: 'center' },
  btnInner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.grayBorder },
  dividerText: { paddingHorizontal: 14, fontSize: 12, color: COLORS.gray },

  // Social
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  socialBtn: { width: 64, height: 64, borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.grayBorder, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  socialBtnLoading: { opacity: 0.7 },

  // Forgot Password
  forgotBtn: { alignItems: 'center', marginBottom: 10 },
  forgotText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Link Row
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 13, color: COLORS.gray },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Footer
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { width: '100%', backgroundColor: COLORS.white, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  modalIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.dark, marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, justifyContent: 'center', alignItems: 'center' },
  modalBtnGradient: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius },
  modalBtnInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});
