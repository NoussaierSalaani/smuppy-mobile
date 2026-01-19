import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Modal } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, GRADIENTS } from '../../config/theme';
import { ENV } from '../../config/env';
import { SmuppyText } from '../../components/SmuppyLogo';
import ErrorModal from '../../components/ErrorModal';
import { validate, isPasswordValid, getPasswordStrengthLevel, PASSWORD_RULES, isDisposableEmail, detectDomainTypo } from '../../utils/validation';
import { validateEmailFull, EMAIL_ERROR_MESSAGES } from '../../services/emailValidation';
import { checkAWSRateLimit } from '../../services/awsRateLimit';

// Style unifié Smuppy (même que LoginScreen)
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

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [deletedAccountModal, setDeletedAccountModal] = useState({
    visible: false,
    daysRemaining: 0,
    canReactivate: false,
    fullName: '',
  });

  // Track keyboard visibility
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const closeDeletedAccountModal = useCallback(() => {
    setDeletedAccountModal(prev => ({ ...prev, visible: false }));
  }, []);

  // Check if email is available (not deleted, not already registered)
  const checkEmailAvailable = useCallback(async (emailToCheck: string): Promise<boolean> => {
    try {
      const response = await fetch(`${ENV.SUPABASE_URL}/functions/v1/check-email-available`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ENV.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: emailToCheck }),
      });

      if (!response.ok) return true; // Allow on error (will be caught later)

      const result = await response.json();

      if (!result.available) {
        if (result.reason === 'deleted') {
          // Show deleted account modal
          setDeletedAccountModal({
            visible: true,
            daysRemaining: result.days_remaining,
            canReactivate: true,
            fullName: result.full_name || '',
          });
        } else if (result.reason === 'exists') {
          // Show generic error (don't reveal email exists)
          setErrorModal({
            visible: true,
            title: 'Invalid Credentials',
            message: 'Unable to create account. Please check your information and try again.',
          });
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('Check email available error:', error);
      return true; // Allow on error
    }
  }, []);

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

  const handleSignup = async () => {
    if (!isFormValid || loading) return;

    // Prevent double-tap: set loading BEFORE any async operation
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Check if email is available (not deleted, not already registered)
      const isAvailable = await checkEmailAvailable(normalizedEmail);
      if (!isAvailable) {
        setLoading(false);
        return;
      }

      // Check AWS rate limit first (server-side protection)
      const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-signup');
      if (!awsCheck.allowed) {
        setErrorModal({
          visible: true,
          title: 'Too Many Attempts',
          message: `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`,
        });
        return;
      }

      // Advanced email validation (format + disposable + MX records)
      const emailValidation = await validateEmailFull(email);

      if (!emailValidation.valid) {
        const errorTitle = emailValidation.code === 'DISPOSABLE_EMAIL'
          ? 'Invalid Email'
          : emailValidation.code === 'INVALID_DOMAIN'
            ? 'Domain Not Found'
            : 'Invalid Email';
        setErrorModal({
          visible: true,
          title: errorTitle,
          message: emailValidation.error || EMAIL_ERROR_MESSAGES.INVALID_FORMAT
        });
        return;
      }

      // Navigate to onboarding with email and password
      // Account creation happens at the end after OTP verification
      navigation.navigate('AccountType', {
        email: emailValidation.email,
        password
      });
    } catch (err) {
      setErrorModal({
        visible: true,
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <View style={styles.content}>
            {/* Spacer pour remplacer le bouton Back (même hauteur que LoginScreen) */}
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
                <Ionicons name="mail-outline" size={20} color="#FF3B30" />
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
            ) : (
              <LinearGradient
                colors={(email.length > 0 || emailFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, email.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="mail-outline" size={20} color={(email.length > 0 || emailFocused) ? '#00cdb5' : '#9cadbc'} />
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
                  {email.length > 0 && emailValid && <Ionicons name="checkmark-circle" size={20} color="#00cdb5" />}
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
                colors={(password.length > 0 || passwordFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.inputGradientBorderPassword}
              >
                <View style={[styles.inputInnerPassword, password.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="lock-closed-outline" size={20} color={(password.length > 0 || passwordFocused) ? '#00cdb5' : '#9cadbc'} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••••"
                    placeholderTextColor="#9cadbc"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color="#9cadbc" />
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
                          color={check.passed ? '#00cdb5' : '#9cadbc'}
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
                  <View style={[
                    styles.strengthBar, 
                    { 
                      width: strengthLevel.level === 'weak' ? '25%' : strengthLevel.level === 'medium' ? '50%' : strengthLevel.level === 'strong' ? '75%' : '100%', 
                      backgroundColor: strengthLevel.color 
                    }
                  ]} />
                </View>
                <Text style={[styles.strengthText, { color: strengthLevel.color }]}>{strengthLevel.label}</Text>
              </View>
            )}

            {/* Signup Button */}
            <LinearGradient
              colors={isFormValid ? ['#00cdb5', '#0066ac'] : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.btn}
            >
              <TouchableOpacity
                style={styles.btnInner}
                onPress={handleSignup}
                disabled={!isFormValid || loading}
                activeOpacity={0.8}
              >
                <Text style={styles.btnText}>{loading ? 'Validating...' : 'Set-up your account'}</Text>
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
            <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
              <GoogleLogo size={24} />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
              <Ionicons name="logo-apple" size={26} color="#0a252f" />
              <Text style={styles.socialBtnText}>Continue with Apple</Text>
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLinkRow}>
                <Text style={styles.loginLink}>Log In</Text>
                <Ionicons name="arrow-forward" size={14} color="#00cdb5" />
              </TouchableOpacity>
            </View>

            {/* Terms - EN BAS */}
            <View style={styles.termsRow}>
              <TouchableOpacity onPress={() => setAgreeTerms(!agreeTerms)} activeOpacity={0.7}>
                <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
                  {agreeTerms && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                </View>
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => WebBrowser.openBrowserAsync('https://smuppy.com/terms')}
                >
                  Terms and Conditions
                </Text>
                ,{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => WebBrowser.openBrowserAsync('https://smuppy.com/privacy')}
                >
                  Privacy Policy
                </Text>
                {' '}and{' '}
                <Text
                  style={styles.termsLink}
                  onPress={() => WebBrowser.openBrowserAsync('https://smuppy.com/content-policy')}
                >
                  Content Policy
                </Text>.
              </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <SmuppyText width={120} variant="dark" />
            </View>
          </View>
        </KeyboardAvoidingView>

        <ErrorModal visible={errorModal.visible} onClose={() => setErrorModal({ ...errorModal, visible: false })} title={errorModal.title} message={errorModal.message} />

        {/* Deleted Account Modal */}
        <Modal visible={deletedAccountModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClose} onPress={closeDeletedAccountModal}>
                <Ionicons name="close" size={24} color={COLORS.gray} />
              </TouchableOpacity>
              <View style={styles.modalIconWarning}>
                <Ionicons name="warning" size={40} color="#F59E0B" />
              </View>
              <Text style={styles.modalTitle}>Account Deleted</Text>
              <Text style={styles.modalMessage}>
                {deletedAccountModal.fullName ? `Hi ${deletedAccountModal.fullName}, ` : ''}
                This email was recently used for an account that has been deleted.
                {'\n\n'}
                {deletedAccountModal.canReactivate ? (
                  <>
                    This email will be available for a new account in <Text style={styles.modalHighlight}>{deletedAccountModal.daysRemaining} days</Text>.
                    {'\n\n'}
                    To reactivate your previous account, contact us at:
                  </>
                ) : (
                  'This email is now available. Please try again.'
                )}
              </Text>
              {deletedAccountModal.canReactivate && (
                <View style={styles.supportEmailBtn}>
                  <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.supportEmailText}>support@smuppy.com</Text>
                </View>
              )}
              <TouchableOpacity style={styles.modalBtnWarning} onPress={closeDeletedAccountModal}>
                <Text style={styles.modalBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  
  // Spacer pour aligner avec LoginScreen (paddingTop 40 - paddingTop content 8 = 32)
  backBtnSpacer: {
    height: 32,
  },
  
  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
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
  
  // Form
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a252f',
    marginTop: 30,
    marginBottom: 8,
  },
  labelPassword: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a252f',
    marginBottom: 8,
    marginTop: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FORM.inputHeight,
    borderWidth: 1.5,
    borderColor: '#CED3D5',
    borderRadius: FORM.inputRadius,
    paddingHorizontal: 20,
    marginBottom: 16,
    backgroundColor: COLORS.white,
  },
  inputGradientBorder: {
    borderRadius: FORM.inputRadius,
    padding: 2,
    marginBottom: 16,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FORM.inputHeight - 4,
    borderRadius: FORM.inputRadius - 2,
    paddingHorizontal: 18,
    backgroundColor: COLORS.white,
  },
  inputBoxPassword: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FORM.inputHeight,
    borderWidth: 1.5,
    borderColor: '#CED3D5',
    borderRadius: FORM.inputRadius,
    paddingHorizontal: 20,
    marginBottom: 8,
    backgroundColor: COLORS.white,
  },
  inputGradientBorderPassword: {
    borderRadius: FORM.inputRadius,
    padding: 2,
    marginBottom: 8,
  },
  inputInnerPassword: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FORM.inputHeight - 4,
    borderRadius: FORM.inputRadius - 2,
    paddingHorizontal: 18,
    backgroundColor: COLORS.white,
  },
  inputInnerValid: {
    backgroundColor: '#E6FAF8',
  },
  inputError: {
    borderColor: '#FF3B30',
    borderWidth: 2,
    backgroundColor: '#FEF2F2',
    marginBottom: 4,
  },
  input: { 
    flex: 1, 
    fontSize: 16, 
    color: '#0a252f', 
    marginLeft: 12,
  },
  errorText: { 
    fontSize: 13, 
    color: '#FF3B30', 
    marginBottom: 16, 
    marginLeft: 8,
  },
  
  // Password Section Container
  passwordSection: {
    position: 'relative',
    zIndex: 100,
  },

  // Password Requirements Overlay
  requirementsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%', // Position juste en dessous du password input
    zIndex: 1000,
    paddingTop: 4,
  },
  requirementsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a252f',
    marginBottom: 12,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 13,
    color: '#9cadbc',
  },
  requirementMet: {
    color: '#00cdb5',
  },

  // Password Strength
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 10,
  },
  strengthBarBg: { 
    flex: 1, 
    height: 4, 
    backgroundColor: '#E5E7EB', 
    borderRadius: 2, 
    overflow: 'hidden',
  },
  strengthBar: { 
    height: '100%', 
    borderRadius: 2,
  },
  strengthText: { 
    fontSize: 12, 
    fontWeight: '600', 
    minWidth: 70,
  },
  
  // Button
  btn: { 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius, 
    marginBottom: 28, // FIXE 28px
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
    marginBottom: 28, // FIXE 28px
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
  
  // Social Buttons
  socialBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    height: FORM.buttonHeight, 
    borderWidth: 1.5, 
    borderColor: '#E5E7EB', 
    borderRadius: FORM.buttonRadius, 
    backgroundColor: COLORS.white, 
    marginBottom: 12, // Même que LoginScreen entre les 2 boutons
    gap: 10,
  },
  socialBtnText: { 
    fontSize: 15, 
    fontWeight: '500', 
    color: '#0a252f',
  },
  
  // Login Row
  loginRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 12, // Espace après le dernier bouton social
    marginBottom: 8, // Même que SPACING.sm de LoginScreen
  },
  loginText: { 
    fontSize: 14, 
    color: '#676C75',
  },
  loginLinkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
  },
  loginLink: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#00cdb5',
  },
  
  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    marginBottom: 8,
  },
  checkbox: { 
    width: 22, 
    height: 22, 
    borderWidth: 2, 
    borderColor: '#CED3D5', 
    borderRadius: 6, 
    marginRight: SPACING.sm, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: COLORS.white,
  },
  checkboxChecked: { 
    backgroundColor: '#00cdb5', 
    borderColor: '#00cdb5',
  },
  termsText: { 
    flex: 1, 
    fontSize: 12, 
    color: '#676C75', 
    lineHeight: 18,
  },
  termsLink: { 
    color: '#00cdb5', 
    fontWeight: '500',
  },
  
  // Footer
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: SPACING.md,
  },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: COLORS.white, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  modalIconWarning: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0a252f', marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: '#676C75', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalHighlight: { fontWeight: '700', color: '#00cdb5' },
  supportEmailBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E6FAF8', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginBottom: 16 },
  supportEmailText: { fontSize: 15, fontWeight: '600', color: '#00cdb5' },
  modalBtnWarning: { width: '100%', height: 56, borderRadius: 28, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});
