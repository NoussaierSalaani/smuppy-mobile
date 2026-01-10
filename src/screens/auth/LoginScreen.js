import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, Modal, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING } from '../../config/theme';
import { supabase } from '../../config/supabase';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';
import { biometrics } from '../../utils/biometrics';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';

// Style unifié Smuppy
const FORM = {
  inputHeight: 56,
  inputRadius: 28,
  buttonHeight: 56,
  buttonRadius: 28,
};

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

  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction: canForgotPassword, remainingTime: forgotPasswordRemaining, showModal: showForgotModal, setShowModal: setShowForgotModal, tryAction: tryForgotPassword } = useCooldown(30);

  useEffect(() => { checkBiometrics(); }, []);

  const checkBiometrics = async () => {
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
  };

  const isFaceId = biometricType === 'face';

  const handleEnableBiometric = async () => {
    const result = await biometrics.enable();
    if (result.success) {
      setBiometricEnabled(true);
      setSuccessModal({ visible: true, title: `${isFaceId ? 'Face ID' : 'Touch ID'} Enabled!`, message: `You can now use ${isFaceId ? 'Face ID' : 'Touch ID'} for faster login.` });
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil(result.remainingSeconds / 60);
      setErrorModal({ visible: true, title: 'Too Many Attempts', message: `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.` });
    }
  };

  const handleBiometricLogin = async () => {
    const blockStatus = await biometrics.isBlocked();
    if (blockStatus.blocked) {
      const minutes = Math.ceil(blockStatus.remainingSeconds / 60);
      setErrorModal({ visible: true, title: 'Too Many Attempts', message: `${isFaceId ? 'Face ID' : 'Touch ID'} is temporarily blocked. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} or use your password.` });
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
      setErrorModal({ visible: true, title: 'Session Expired', message: 'Your session has expired. Please login with your password to continue.' });
    } else if (result.error === 'blocked') {
      const minutes = Math.ceil(result.remainingSeconds / 60);
      setErrorModal({ visible: true, title: 'Too Many Attempts', message: `${isFaceId ? 'Face ID' : 'Touch ID'} is temporarily blocked. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} or use your password.` });
      setBiometricBlocked(true);
    } else if (result.attemptsLeft !== undefined && result.attemptsLeft > 0) {
      setErrorModal({ visible: true, title: 'Authentication Failed', message: `${isFaceId ? 'Face ID' : 'Touch ID'} failed. ${result.attemptsLeft} attempt${result.attemptsLeft > 1 ? 's' : ''} remaining.` });
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return setErrorModal({ visible: true, title: 'Missing Information', message: 'Please fill in all fields to continue.' });
    setLoading(true);
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setErrorModal({ visible: true, title: 'Login Failed', message: error.message || 'Invalid email or password. Please try again.' });
    if (data?.session) {
      await storage.set(STORAGE_KEYS.ACCESS_TOKEN, data.session.access_token);
      await storage.set(STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token);
      await biometrics.resetAttempts();
      setBiometricBlocked(false);
    }
  };

  const handleForgotPassword = () => {
    if (canForgotPassword) tryForgotPassword(() => navigate('ForgotPassword'));
    else setShowForgotModal(true);
  };

  const isFormValid = email.length > 0 && password.length > 0;

  const renderBiometricSection = () => {
    if (!biometricSupported) return null;
    if (biometricEnabled) {
      return (
        <>
          <TouchableOpacity style={[styles.biometricBtn, biometricBlocked && styles.biometricBtnDisabled]} onPress={handleBiometricLogin} activeOpacity={0.8} disabled={biometricBlocked}>
            <View style={[styles.biometricIconBox, biometricBlocked && styles.biometricIconBoxDisabled]}>
              <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={28} color={biometricBlocked ? '#9cadbc' : '#00cdb5'} />
            </View>
            <Text style={[styles.biometricText, biometricBlocked && styles.biometricTextDisabled]}>
              {biometricBlocked ? `${isFaceId ? 'Face ID' : 'Touch ID'} temporarily blocked` : `Login with ${isFaceId ? 'Face ID' : 'Touch ID'}`}
            </Text>
          </TouchableOpacity>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Or use password</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      );
    } else {
      return (
        <TouchableOpacity style={styles.enableBiometricBtn} onPress={handleEnableBiometric} activeOpacity={0.8}>
          <View style={styles.enableBiometricLeft}>
            <View style={styles.enableBiometricIcon}>
              <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={22} color="#00cdb5" />
            </View>
            <View>
              <Text style={styles.enableBiometricTitle}>Enable {isFaceId ? 'Face ID' : 'Touch ID'}</Text>
              <Text style={styles.enableBiometricSubtitle}>Login faster and more securely</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9cadbc" />
        </TouchableOpacity>
      );
    }
  };

  const renderErrorModal = () => (
    <Modal visible={errorModal.visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setErrorModal({ ...errorModal, visible: false })}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={[styles.modalIconBox, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={40} color="#FF3B30" />
          </View>
          <Text style={styles.modalTitle}>{errorModal.title}</Text>
          <Text style={styles.modalMessage}>{errorModal.message}</Text>
          <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF3B30' }]} onPress={() => setErrorModal({ ...errorModal, visible: false })}>
            <Text style={styles.modalBtnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderSuccessModal = () => (
    <Modal visible={successModal.visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={[styles.modalIconBox, { backgroundColor: '#E6FAF8' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#00cdb5" />
          </View>
          <Text style={styles.modalTitle}>{successModal.title}</Text>
          <Text style={styles.modalMessage}>{successModal.message}</Text>
          <LinearGradient colors={['#00cdb5', '#0066ac']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtnGradient}>
            <TouchableOpacity style={styles.modalBtnInner} onPress={() => setSuccessModal({ ...successModal, visible: false })}>
              <Text style={styles.modalBtnText}>Got it!</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <View style={styles.content}>
            {/* Back Button */}
            <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.headerContainer}>
              <Text style={styles.title}>Login to Smuppy</Text>
              <Text style={styles.subtitle}>Together for personalized well-being!</Text>
            </View>

            {/* Biometric Section */}
            {renderBiometricSection()}

            {/* Email Input */}
            <Text style={styles.label}>Email address</Text>
            <View style={[styles.inputBox, emailFocused && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={20} color={emailFocused ? '#00cdb5' : '#9cadbc'} />
              <TextInput 
                style={styles.input} 
                placeholder="mailusersmuppy@mail.com" 
                placeholderTextColor="#9cadbc" 
                value={email} 
                onChangeText={setEmail} 
                keyboardType="email-address" 
                autoCapitalize="none" 
                autoCorrect={false}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            {/* Password Input */}
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputBox, passwordFocused && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={20} color={passwordFocused ? '#00cdb5' : '#9cadbc'} />
              <TextInput 
                style={styles.input} 
                placeholder="••••••••••" 
                placeholderTextColor="#9cadbc" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry={!showPassword} 
                autoCorrect={false}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#9cadbc" />
              </TouchableOpacity>
            </View>

            {/* Remember Me */}
            <TouchableOpacity style={styles.rememberMeContainer} onPress={() => setRememberMe(!rememberMe)} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.rememberMeText}>Remember me</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <LinearGradient
              colors={isFormValid ? ['#00cdb5', '#0066ac'] : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <TouchableOpacity
                style={styles.btnInner}
                onPress={handleLogin}
                disabled={!isFormValid || loading}
                activeOpacity={0.8}
              >
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

            {/* Social Login */}
            <View style={styles.socialRow}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7} onPress={() => console.log('Google Login')}>
                <GoogleLogo size={24} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7} onPress={() => console.log('Apple Login')}>
                <Ionicons name="logo-apple" size={26} color="#0a252f" />
              </TouchableOpacity>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotContainer} disabled={disabled}>
              <Text style={[styles.forgotText, !canForgotPassword && styles.forgotTextDisabled]}>
                {canForgotPassword ? 'Forgot password?' : `Wait ${forgotPasswordRemaining}s`}
              </Text>
            </TouchableOpacity>

            {/* Signup Link */}
            <View style={styles.signupRow}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigate('Signup')} style={styles.signupLinkRow} disabled={disabled}>
                <Text style={styles.signupLink}>Signup</Text>
                <Ionicons name="arrow-forward" size={14} color="#00cdb5" />
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <SmuppyText width={120} variant="dark" />
            </View>
          </View>
        </KeyboardAvoidingView>

        {renderErrorModal()}
        {renderSuccessModal()}
        <CooldownModal visible={showForgotModal} onClose={() => setShowForgotModal(false)} seconds={forgotPasswordRemaining} title="Please wait" message="You recently requested a password reset. You can try again in" />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  keyboardView: { 
    flex: 1,
  },
  content: { 
    flex: 1, 
    paddingHorizontal: SPACING.xl, 
    paddingTop: SPACING.sm,
  },
  disabled: { 
    opacity: 0.6,
  },
  
  // Back Button
  backBtn: { 
    width: 44, 
    height: 44, 
    backgroundColor: '#0a252f', 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: SPACING.md,
  },
  
  // Header
  headerContainer: { 
    alignItems: 'center', 
    marginBottom: SPACING.lg,
  },
  title: { 
    fontFamily: 'WorkSans-Bold',
    fontSize: 28, 
    color: '#0a252f', 
    textAlign: 'center', 
    marginBottom: 4,
  },
  subtitle: { 
    fontSize: 14, 
    color: '#676C75', 
    textAlign: 'center',
  },
  
  // Biometric Login
  biometricBtn: { 
    alignItems: 'center', 
    paddingVertical: SPACING.md, 
    marginBottom: SPACING.sm,
  },
  biometricBtnDisabled: { 
    opacity: 0.6,
  },
  biometricIconBox: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: '#E6FAF8', 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#00cdb5', 
    marginBottom: SPACING.sm,
  },
  biometricIconBoxDisabled: { 
    backgroundColor: '#F3F4F6', 
    borderColor: '#CED3D5',
  },
  biometricText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#00cdb5',
  },
  biometricTextDisabled: { 
    color: '#9cadbc',
  },
  
  // Enable Biometric
  enableBiometricBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#F0FDF9', 
    borderRadius: 16, 
    padding: SPACING.sm, 
    marginBottom: SPACING.lg, 
    borderWidth: 1, 
    borderColor: '#D1FAE5',
  },
  enableBiometricLeft: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: SPACING.sm,
  },
  enableBiometricIcon: { 
    width: 40, 
    height: 40, 
    borderRadius: 12, 
    backgroundColor: '#E6FAF8', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  enableBiometricTitle: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#0a252f',
  },
  enableBiometricSubtitle: { 
    fontSize: 11, 
    color: '#676C75', 
    marginTop: 1,
  },
  
  // Form - STYLE CAPSULE UNIFIÉ
  label: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#0a252f', 
    marginBottom: 8,
  },
  inputBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    height: FORM.inputHeight, 
    borderWidth: 1.5, 
    borderColor: '#CED3D5', 
    borderRadius: FORM.inputRadius, 
    paddingHorizontal: 20, 
    marginBottom: SPACING.md, 
    backgroundColor: COLORS.white,
  },
  inputFocused: {
    borderColor: '#00cdb5',
    backgroundColor: '#F0FDFB',
  },
  input: { 
    flex: 1, 
    fontSize: 16, 
    color: '#0a252f', 
    marginLeft: 12,
  },
  
  // Remember Me
  rememberMeContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: SPACING.md,
  },
  checkbox: { 
    width: 22, 
    height: 22, 
    borderRadius: 6, 
    borderWidth: 2, 
    borderColor: '#CED3D5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginRight: SPACING.sm, 
    backgroundColor: COLORS.white,
  },
  checkboxChecked: { 
    backgroundColor: '#00cdb5', 
    borderColor: '#00cdb5',
  },
  rememberMeText: { 
    fontSize: 14, 
    fontWeight: '500', 
    color: '#0a252f',
  },
  
  // Button - STYLE CAPSULE UNIFIÉ
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
    color: COLORS.white, 
    fontSize: 16, 
    fontWeight: '600',
  },
  
  // Divider
  dividerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: SPACING.md,
  },
  dividerLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: '#E5E7EB',
  },
  dividerText: { 
    paddingHorizontal: SPACING.sm, 
    fontSize: 13, 
    color: '#676C75',
  },
  
  // Social
  socialRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    gap: SPACING.md, 
    marginBottom: SPACING.md,
  },
  socialBtn: { 
    width: 56, 
    height: 56, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: '#E5E7EB', 
    backgroundColor: COLORS.white, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  
  // Forgot
  forgotContainer: { 
    alignItems: 'center', 
    marginBottom: SPACING.sm,
  },
  forgotText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#00cdb5',
  },
  forgotTextDisabled: { 
    color: '#9cadbc',
  },
  
  // Signup
  signupRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: SPACING.sm,
  },
  signupText: { 
    fontSize: 14, 
    color: '#676C75',
  },
  signupLinkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
  },
  signupLink: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#00cdb5',
  },
  
  // Footer
  footer: { 
    flex: 1, 
    justifyContent: 'flex-end', 
    alignItems: 'center', 
    paddingBottom: SPACING.md,
  },
  
  // Modal
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
  },
  modalContent: { 
    width: '100%', 
    backgroundColor: COLORS.white, 
    borderRadius: 24, 
    padding: 28, 
    alignItems: 'center',
  },
  modalClose: { 
    position: 'absolute', 
    top: 16, 
    right: 16, 
    zIndex: 10,
  },
  modalIconBox: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20,
  },
  modalTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#0a252f', 
    marginBottom: 12, 
    textAlign: 'center',
  },
  modalMessage: { 
    fontSize: 14, 
    color: '#676C75', 
    textAlign: 'center', 
    lineHeight: 22, 
    marginBottom: 24,
  },
  modalBtn: { 
    width: '100%', 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius, 
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnGradient: { 
    width: '100%', 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius,
  },
  modalBtnInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: COLORS.white,
  },
});