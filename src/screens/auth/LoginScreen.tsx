import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback, Keyboard, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, GRADIENTS, FORM } from '../../config/theme';
import { ENV } from '../../config/env';
import { supabase } from '../../config/supabase';
import { SmuppyText } from '../../components/SmuppyLogo';
import { biometrics } from '../../utils/biometrics';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { checkAWSRateLimit } from '../../services/awsRateLimit';

const GoogleLogo = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </Svg>
);

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [biometricBlocked, setBiometricBlocked] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const [successModal, setSuccessModal] = useState({ visible: false, title: '', message: '' });

  useEffect(() => { checkBiometrics(); }, []);

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
    const result = await biometrics.enable();
    if (result.success) {
      setBiometricEnabled(true);
      setSuccessModal({ 
        visible: true, 
        title: `${isFaceId ? 'Face ID' : 'Touch ID'} Enabled!`, 
        message: `You can now use ${isFaceId ? 'Face ID' : 'Touch ID'} for faster login.` 
      });
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil(result.remainingSeconds / 60);
      setErrorModal({ 
        visible: true, 
        title: 'Too Many Attempts', 
        message: `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.` 
      });
    }
  }, [isFaceId]);

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
      const refreshToken = await storage.get(STORAGE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (data?.session && !error) {
          await storage.set(STORAGE_KEYS.ACCESS_TOKEN, data.session.access_token);
          await storage.set(STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token);
          return;
        }
      }
      setErrorModal({ 
        visible: true, 
        title: 'Session Expired', 
        message: 'Your session has expired. Please login with your password to continue.' 
      });
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil(result.remainingSeconds / 60);
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
    if (!email || !password) {
      setErrorModal({ 
        visible: true, 
        title: 'Missing Information', 
        message: 'Please fill in all fields to continue.' 
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-login');
    if (!awsCheck.allowed) {
      setErrorModal({
        visible: true,
        title: 'Too Many Attempts',
        message: `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${ENV.SUPABASE_URL}/functions/v1/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ENV.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${ENV.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = response.status === 429
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : 'Invalid email or password. Please try again.';
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message,
        });
        return;
      }

      const session = result?.session;
      if (!session?.access_token || !session?.refresh_token) {
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (sessionError) {
        setErrorModal({
          visible: true,
          title: 'Login Failed',
          message: 'Invalid email or password. Please try again.',
        });
        return;
      }

      await storage.set(STORAGE_KEYS.ACCESS_TOKEN, session.access_token);
      await storage.set(STORAGE_KEYS.REFRESH_TOKEN, session.refresh_token);
      await biometrics.resetAttempts();
      setBiometricBlocked(false);
    } catch (error) {
      setErrorModal({
        visible: true,
        title: 'Login Failed',
        message: 'Invalid email or password. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  }, [email, password]);

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

  const getEmailInputStyle = () => {
    if (email.length > 0) return [styles.inputBox, styles.inputValid];
    if (emailFocused) return [styles.inputBox, styles.inputFocused];
    return [styles.inputBox];
  };

  const getPasswordInputStyle = () => {
    if (password.length > 0) return [styles.inputBox, styles.inputValid];
    if (passwordFocused) return [styles.inputBox, styles.inputFocused];
    return [styles.inputBox];
  };

  const getEmailIconColor = () => {
    if (email.length > 0 || emailFocused) return COLORS.primary;
    return COLORS.grayMuted;
  };

  const getPasswordIconColor = () => {
    if (password.length > 0 || passwordFocused) return COLORS.primary;
    return COLORS.grayMuted;
  };

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
      <SafeAreaView style={styles.container}>
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
              <View style={getEmailInputStyle()}>
                <Ionicons name="mail-outline" size={20} color={getEmailIconColor()} />
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
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={getPasswordInputStyle()}>
                <Ionicons name="lock-closed-outline" size={20} color={getPasswordIconColor()} />
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
                />
                <TouchableOpacity onPress={togglePassword} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Remember Me */}
            <TouchableOpacity style={styles.rememberRow} onPress={toggleRememberMe} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <LinearGradient 
              colors={isFormValid ? GRADIENTS.primary : GRADIENTS.buttonDisabled} 
              start={GRADIENTS.primaryStart} 
              end={GRADIENTS.primaryEnd} 
              style={styles.btn}
            >
              <TouchableOpacity style={styles.btnInner} onPress={handleLogin} disabled={!isFormValid || loading} activeOpacity={0.8}>
                <Text style={styles.btnText}>{loading ? 'Logging in...' : 'Login'}</Text>
                {!loading && <Ionicons name="arrow-forward" size={20} color={COLORS.white} />}
              </TouchableOpacity>
            </LinearGradient>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
                <GoogleLogo size={28} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
                <Ionicons name="logo-apple" size={30} color={COLORS.dark} />
              </TouchableOpacity>
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

            {/* Footer */}
            <View style={styles.footer}>
              <SmuppyText width={140} variant="dark" />
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
  inputFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  inputValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: 12 },

  // Remember Me
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center', marginRight: 10, backgroundColor: COLORS.white },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rememberText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },

  // Button
  btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, marginBottom: 16 },
  btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.grayBorder },
  dividerText: { paddingHorizontal: 14, fontSize: 12, color: COLORS.gray },

  // Social
  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  socialBtn: { width: 64, height: 64, borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.grayBorder, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },

  // Forgot Password
  forgotBtn: { alignItems: 'center', marginBottom: 10 },
  forgotText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Link Row
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  linkText: { fontSize: 13, color: COLORS.gray },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Footer
  footer: { alignItems: 'center', marginTop: 'auto', paddingTop: 8, paddingBottom: 8 },

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
