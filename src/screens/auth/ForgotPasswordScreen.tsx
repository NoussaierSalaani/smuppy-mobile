import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, FORM } from '../../config/theme';
import { SmuppyText } from '../../components/SmuppyLogo';
import { supabase } from '../../config/supabase';

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// SECURITY: Generic message that doesn't reveal if email exists
const SUCCESS_MESSAGE = "Si un compte existe avec cet email, tu recevras un lien de réinitialisation.";

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Flèche retour → goBack pour animation normale
  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleEmailChange = useCallback((value) => {
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

  const handleSend = useCallback(async () => {
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
    setIsLoading(true);

    try {
      // SECURITY: Call Supabase resetPasswordForEmail
      // Supabase returns success even if email doesn't exist (by design)
      // This prevents email enumeration attacks
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: 'smuppy://reset-password',
      });

      // SECURITY: Always show success regardless of whether email exists
      // This prevents attackers from discovering valid emails
      setShowSuccessModal(true);
    } catch (error) {
      // SECURITY: Even on error, show success to prevent email enumeration
      // Log error internally but don't reveal to user
      console.error('[ForgotPassword] Error:', error);
      setShowSuccessModal(true);
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  const handleContinue = useCallback(() => {
    setShowSuccessModal(false);
    navigation.navigate('ResetCode', { email });
  }, [navigation, email]);

  const isFormValid = email.trim().length > 0;

  const getInputStyle = useCallback(() => {
    if (hasSubmitted && emailError) return [styles.inputBox, styles.inputError];
    if (email.length > 0) return [styles.inputBox, styles.inputValid];
    if (isFocused) return [styles.inputBox, styles.inputFocused];
    return [styles.inputBox];
  }, [hasSubmitted, emailError, email, isFocused]);

  const getIconColor = useCallback(() => {
    if (hasSubmitted && emailError) return COLORS.error;
    if (email.length > 0 || isFocused) return COLORS.primary;
    return COLORS.grayMuted;
  }, [hasSubmitted, emailError, email, isFocused]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            
            {/* Back Button */}
            <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Forgot password</Text>
              <Text style={styles.subtitle}>Enter your email address to recover your password</Text>
            </View>

            {/* Email Input - returnKeyType default, pas d'action onSubmitEditing */}
            <Text style={styles.label}>Email address</Text>
            <View style={getInputStyle()}>
              <Ionicons name="mail-outline" size={20} color={getIconColor()} />
              <TextInput 
                style={styles.input} 
                placeholder="mailusersmuppy@mail.com" 
                placeholderTextColor={COLORS.grayMuted}
                value={email} 
                onChangeText={handleEmailChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                keyboardType="email-address" 
                autoCapitalize="none"
                autoCorrect={false}
              />
              {email.length > 0 && (
                <TouchableOpacity onPress={handleClearEmail} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={20} color={COLORS.grayMuted} />
                </TouchableOpacity>
              )}
            </View>
            
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
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.btnText}>Send code</Text>
                    <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
                  </>
                )}
              </TouchableOpacity>
            </LinearGradient>

            {/* Back to Login */}
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Changed your mind? </Text>
              <TouchableOpacity onPress={handleGoBack} style={styles.loginLink}>
                <Text style={styles.linkText}>Back to login</Text>
                <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {/* Spacer */}
            <View style={styles.spacer} />

            {/* Footer */}
            <View style={styles.footer}>
              <SmuppyText width={140} variant="dark" />
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
                <Ionicons name="mail" size={36} color={COLORS.white} />
              </LinearGradient>
              <Text style={styles.modalTitle}>Email envoyé</Text>
              <Text style={styles.modalMessage}>{SUCCESS_MESSAGE}</Text>
              <LinearGradient
                colors={GRADIENTS.primary}
                start={GRADIENTS.primaryStart}
                end={GRADIENTS.primaryEnd}
                style={styles.modalBtn}
              >
                <TouchableOpacity style={styles.modalBtnInner} onPress={handleContinue} activeOpacity={0.8}>
                  <Text style={styles.modalBtnText}>Continuer</Text>
                  <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
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
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

  // Back Button
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },

  // Header
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 22 },

  // Input
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: 8 },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: FORM.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: FORM.inputRadius, paddingHorizontal: FORM.inputPaddingHorizontal, marginBottom: 8, backgroundColor: COLORS.white },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 2 },
  inputValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  inputError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: COLORS.errorLight },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: 12 },
  errorText: { fontSize: 13, color: COLORS.error, marginBottom: 16, marginLeft: 8 },

  // Button
  btn: { height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, marginTop: 16, marginBottom: 24 },
  btnInner: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '600' },

  // Login Link
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  loginText: { fontSize: 14, color: COLORS.gray },
  loginLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  // Spacer
  spacer: { flex: 1, minHeight: 200 },

  // Footer
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: COLORS.white, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  modalTitle: { fontFamily: 'WorkSans-Bold', fontSize: 24, color: COLORS.dark, marginBottom: 12 },
  modalMessage: { fontSize: 15, color: COLORS.gray, textAlign: 'center', lineHeight: 22, marginBottom: 24, paddingHorizontal: 8 },
  modalBtn: { width: '100%', height: FORM.buttonHeight, borderRadius: FORM.buttonRadius, overflow: 'hidden' },
  modalBtnInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});