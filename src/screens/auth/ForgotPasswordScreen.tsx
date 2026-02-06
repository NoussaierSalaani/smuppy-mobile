import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GRADIENTS, FORM, HIT_SLOP } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// SECURITY: Generic message that doesn't reveal if email exists
const SUCCESS_MESSAGE = "If an account exists with this email, you will receive a password reset code.";

interface ForgotPasswordScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deletedAccountModal, setDeletedAccountModal] = useState({
    visible: false,
    daysRemaining: 0,
    canReactivate: false,
    fullName: '',
  });

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Back button → goBack for normal animation
  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
    if (hasSubmitted) {
      setEmailError('');
      setHasSubmitted(false);
    }
  }, [hasSubmitted]);

  const handleClearEmail = useCallback(() => {
    setEmail('');
    setEmailError('');
    setHasSubmitted(false);
  }, []);

  const closeDeletedAccountModal = useCallback(() => {
    setDeletedAccountModal(prev => ({ ...prev, visible: false }));
  }, []);

  // Note: checkDeletedAccount skipped for AWS - Cognito handles user state
  const checkDeletedAccount = useCallback(async (_emailToCheck: string): Promise<boolean> => {
    // AWS Cognito handles deleted/disabled accounts internally
    return false;
  }, []);

  const handleSend = useCallback(async () => {
    if (isLoading) return; // Prevent double-tap

    Keyboard.dismiss();
    setHasSubmitted(true);

    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email');
      return;
    }

    setEmailError('');
    setIsLoading(true); // Set loading BEFORE async operations

    const emailNormalized = email.trim().toLowerCase();

    try {
      // Check if account was deleted
      const isDeleted = await checkDeletedAccount(emailNormalized);
      if (isDeleted) {
        setIsLoading(false);
        return;
      }

      const awsCheck = await checkAWSRateLimit(emailNormalized, 'auth-forgot-password');
      if (!awsCheck.allowed) {
        setEmailError(`Too many attempts. Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`);
        return;
      }

      // Use backend service which routes to AWS Cognito
      await backend.forgotPassword(emailNormalized);

      // SECURITY: Always show success regardless of whether email exists
      // This prevents attackers from discovering valid emails
      setShowSuccessModal(true);
    } catch (error: unknown) {
      // Detect network errors - show user-friendly message instead of fake success
      const errorMessage = error instanceof Error ? error.message : '';
      const isNetworkError =
        error instanceof TypeError ||
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('Failed to fetch');

      if (isNetworkError) {
        setEmailError('Unable to send link right now. Please check your connection and try again.');
      } else {
        // Other errors: show success for anti-enumeration security
        setShowSuccessModal(true);
      }
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, isLoading]);

  const handleContinue = useCallback(() => {
    setShowSuccessModal(false);
    navigation.navigate('CheckEmail', { email });
  }, [navigation, email]);

  const isFormValid = email.trim().length > 0;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Back Button */}
            <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
              <Ionicons name="chevron-back" size={28} color={colors.dark} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Forgot password</Text>
              <Text style={styles.subtitle}>Enter your email address and we'll send you a code to reset your password</Text>
            </View>

            {/* Email Input */}
            <Text style={styles.label}>Email address</Text>
            {(hasSubmitted && emailError) ? (
              <View style={[styles.inputBox, styles.inputError]}>
                <Ionicons name="mail-outline" size={20} color={colors.error} />
                <TextInput
                  style={styles.input}
                  placeholder="mailusersmuppy@mail.com"
                  placeholderTextColor={colors.grayMuted}
                  value={email}
                  onChangeText={handleEmailChange}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {email.length > 0 && (
                  <TouchableOpacity onPress={handleClearEmail} hitSlop={HIT_SLOP.medium}>
                    <Ionicons name="close-circle" size={20} color={colors.grayMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <LinearGradient
                colors={(email.length > 0 || isFocused) ? GRADIENTS.button : [colors.grayBorder, colors.grayBorder]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.inputGradientBorder}
              >
                <View style={[styles.inputInner, email.length > 0 && styles.inputInnerValid]}>
                  <Ionicons name="mail-outline" size={20} color={(email.length > 0 || isFocused) ? colors.primary : colors.grayMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="mailusersmuppy@mail.com"
                    placeholderTextColor={colors.grayMuted}
                    value={email}
                    onChangeText={handleEmailChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {email.length > 0 && (
                    <TouchableOpacity onPress={handleClearEmail} hitSlop={HIT_SLOP.medium}>
                      <Ionicons name="close-circle" size={20} color={colors.grayMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>
            )}

            {hasSubmitted && emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

            {/* Send Button */}
            <LinearGradient
              colors={isFormValid && !isLoading ? GRADIENTS.primary : GRADIENTS.buttonDisabled}
              start={GRADIENTS.primaryStart}
              end={GRADIENTS.primaryEnd}
              style={styles.btn}
            >
              <TouchableOpacity style={styles.btnInner} onPress={handleSend} disabled={!isFormValid || isLoading} activeOpacity={0.8}>
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Text style={styles.btnText}>Send link</Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.white} />
                  </>
                )}
              </TouchableOpacity>
            </LinearGradient>

            {/* Spacer */}
            <View style={styles.spacer} />

            {/* Footer */}
            <View style={styles.footer}>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Success Modal - SECURITY: Generic message, doesn't reveal if email exists */}
        <Modal visible={showSuccessModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={GRADIENTS.primaryStart}
                end={GRADIENTS.primaryEnd}
                style={styles.modalIcon}
              >
                <Ionicons name="mail" size={36} color={colors.white} />
              </LinearGradient>
              <Text style={styles.modalTitle}>Email sent</Text>
              <Text style={styles.modalMessage}>{SUCCESS_MESSAGE}</Text>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={GRADIENTS.primaryStart}
                end={GRADIENTS.primaryEnd}
                style={styles.modalBtn}
              >
                <TouchableOpacity style={styles.modalBtnInner} onPress={handleContinue} activeOpacity={0.8}>
                  <Text style={styles.modalBtnText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.white} />
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </Modal>

        {/* Deleted Account Modal */}
        <Modal visible={deletedAccountModal.visible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <TouchableOpacity style={styles.modalClose} onPress={closeDeletedAccountModal}>
                <Ionicons name="close" size={24} color={colors.gray} />
              </TouchableOpacity>
              <View style={[styles.modalIconWarning]}>
                <Ionicons name="warning" size={40} color="#F59E0B" />
              </View>
              <Text style={styles.modalTitle}>Account Deleted</Text>
              <Text style={styles.modalMessage}>
                {deletedAccountModal.fullName ? `Hi ${deletedAccountModal.fullName}, ` : ''}
                The account linked to this email has been deleted.
                {'\n\n'}
                {deletedAccountModal.canReactivate ? (
                  <>
                    This email will be available again in <Text style={styles.modalHighlight}>{deletedAccountModal.daysRemaining} days</Text>.
                    {'\n\n'}
                    To reactivate your account, please contact us at:
                  </>
                ) : (
                  'This email is now available for a new account.'
                )}
              </Text>
              {deletedAccountModal.canReactivate && (
                <View style={styles.supportEmailBtn}>
                  <Ionicons name="mail-outline" size={18} color={colors.primary} />
                  <Text style={styles.supportEmailText}>support@smuppy.com</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.modalBtnWarning]}
                onPress={closeDeletedAccountModal}
              >
                <Text style={styles.modalBtnText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const _errorBg = isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2';
  const errorInputBg = isDark ? 'rgba(239,68,68,0.08)' : '#FEF2F2';
  const validBg = isDark ? 'rgba(14,191,138,0.15)' : '#E6FAF8';
  const warningIconBg = isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

    // Back Button
    backBtn: { alignSelf: 'flex-start', padding: 4, marginLeft: -4, marginBottom: 16 },

    // Header
    header: { alignItems: 'center', marginBottom: 32 },
    title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: colors.dark, textAlign: 'center', marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22 },

    // Input
    label: { fontSize: 14, fontWeight: '600', color: colors.dark, marginBottom: 8 },
    inputBox: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: colors.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, marginBottom: 8, backgroundColor: colors.background },
    inputGradientBorder: { borderRadius: FORM.inputRadius, padding: 2, marginBottom: 8 },
    inputInner: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight - 4, borderRadius: FORM.inputRadius - 2, paddingHorizontal: FORM.inputPaddingHorizontal - 2, backgroundColor: colors.background },
    inputInnerValid: { backgroundColor: validBg },
    inputError: { borderColor: colors.error, borderWidth: 2, backgroundColor: errorInputBg },
    input: { flex: 1, fontSize: 16, color: colors.dark, marginLeft: 12 },
    errorText: { fontSize: 13, color: colors.error, marginBottom: 16, marginLeft: 8 },

    // Button
    btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, marginTop: 16, marginBottom: 24 },
    btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    btnText: { color: colors.white, fontSize: 16, fontWeight: '600' },

    // Spacer
    spacer: { flex: 1, minHeight: 200 },

    // Footer
    footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalBox: { width: '100%', backgroundColor: colors.background, borderRadius: 24, padding: 28, alignItems: 'center' },
    modalIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
    modalTitle: { fontFamily: 'WorkSans-Bold', fontSize: 24, color: colors.dark, marginBottom: 12 },
    modalMessage: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 8 },
    modalBtn: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, overflow: 'hidden' },
    modalBtnInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    modalBtnText: { fontSize: 16, fontWeight: '600', color: colors.white },
    modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
    modalIconWarning: { width: 80, height: 80, borderRadius: 40, backgroundColor: warningIconBg, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    modalHighlight: { fontWeight: '700', color: colors.primary },
    supportEmailBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: validBg, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginBottom: 16 },
    supportEmailText: { fontSize: 15, fontWeight: '600', color: colors.primary },
    modalBtnWarning: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  });
};
