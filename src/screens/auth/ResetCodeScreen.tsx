import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../../config/theme';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';

const CODE_LENGTH = 6; // AWS Cognito OTP is 6 digits

interface ResetCodeScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route?: {
    params?: {
      email?: string;
    };
  };
}

export default function ResetCodeScreen({ navigation, route }: ResetCodeScreenProps) {
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inputs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  const email = route?.params?.email || 'mailusersmuppy@mail.com';
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);

  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const clearCode = useCallback((shouldFocus = false) => {
    setCode(Array(CODE_LENGTH).fill(''));
    setError('');
    if (shouldFocus) setTimeout(() => inputs.current[0]?.focus(), 100);
  }, []);

  const verifyCode = useCallback(async (fullCode: string) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();

    try {
      // For AWS Cognito, we don't verify here - we pass the code to NewPasswordScreen
      // The code will be verified when setting the new password via confirmForgotPassword
      // Just validate that we have 6 digits
      if (fullCode.length === CODE_LENGTH && /^\d+$/.test(fullCode)) {
        // Navigate to new password screen with the code
        navigate('NewPassword', { email, code: fullCode });
      } else {
        setError('Please enter a valid 6-digit code.');
        triggerShake();
      }
    } catch (err) {
      console.error('[ResetCode] Verification error:', err);
      setError('An error occurred. Please try again.');
      triggerShake();
    } finally {
      setIsVerifying(false);
    }
  }, [navigate, email, triggerShake]);

  const handleChange = useCallback((text: string, index: number) => {
    if (error) setError('');
    if (text && !/^\d+$/.test(text)) return;
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    if (text && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
    if (text && index === CODE_LENGTH - 1 && newCode.join('').length === CODE_LENGTH) verifyCode(newCode.join(''));
  }, [code, error, verifyCode]);

  const handleKeyPress = useCallback((e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) inputs.current[index - 1]?.focus();
  }, [code]);

  const handleResend = useCallback(async () => {
    Keyboard.dismiss();

    if (!canAction) {
      setShowModal(true);
      return;
    }

    try {
      // Check AWS rate limit first (server-side protection)
      const normalizedEmail = email.trim().toLowerCase();
      const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-resend');
      if (!awsCheck.allowed) {
        setError(`Too many attempts. Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`);
        return;
      }

      // Resend code via AWS Cognito
      await backend.forgotPassword(normalizedEmail);

      tryAction(() => clearCode(false));
      setShowModal(true);
    } catch (err) {
      console.error('[ResetCode] Resend error:', err);
      // Still show modal even on error (security: don't reveal if email exists)
      setShowModal(true);
    }
  }, [canAction, tryAction, clearCode, setShowModal, email]);

  const getBoxStyle = useCallback((index: number) => {
    if (error) return [styles.codeBox, styles.codeBoxError];
    if (code[index]) return [styles.codeBox, styles.codeBoxFilled];
    if (focusedIndex === index) return [styles.codeBox, styles.codeBoxFocused];
    return [styles.codeBox];
  }, [error, code, focusedIndex]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            
            {/* Back Button */}
            <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
              <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Verify your identity</Text>
              <Text style={styles.subtitle}>
                An authentication code has been sent to <Text style={styles.emailText}>{email}</Text> ✏️
              </Text>
            </View>

            {/* Code Input */}
            <Text style={styles.label}>Code</Text>
            <Animated.View style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { inputs.current[i] = ref; }}
                  style={getBoxStyle(i)}
                  maxLength={1}
                  keyboardType="number-pad"
                  value={code[i]}
                  onChangeText={(text) => handleChange(text, i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  onFocus={() => setFocusedIndex(i)}
                  onBlur={() => setFocusedIndex(-1)}
                  selectTextOnFocus
                  editable={!isVerifying}
                />
              ))}
            </Animated.View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <View style={styles.errorIcon}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.white} />
                </View>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Resend */}
            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn't receive a code? </Text>
              <TouchableOpacity onPress={handleResend} disabled={isVerifying}>
                <Text style={[styles.resendLink, isVerifying && styles.resendDisabled]}>
                  {canAction ? 'Resend Code' : `Wait ${remainingTime}s`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Spacer invisible - DANS le scroll, pousse le contenu */}
            <View style={styles.spacer} />

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer - HORS du KeyboardAvoidingView, ne bouge JAMAIS */}
        <View style={styles.footer}>
        </View>

        {/* Cooldown Modal */}
        <CooldownModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          seconds={remainingTime || 30}
          title={canAction ? 'Code Sent!' : 'Please wait'}
          message={canAction ? 'A new verification code has been sent to your email. You can request another one in' : 'You can request a new code in'}
        />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  disabled: { opacity: 0.6 },
  
  // Back Button
  backBtn: { alignSelf: 'flex-start', padding: 4, marginLeft: -4, marginBottom: 16 },
  
  // Header
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, fontWeight: '400', color: COLORS.dark, textAlign: 'center', lineHeight: 22 },
  emailText: { color: COLORS.primary, fontWeight: '600' },
  
  // Code Input - 6 digits for AWS Cognito OTP
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: 12 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  codeBox: { width: 48, height: 56, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, textAlign: 'center', fontSize: 22, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxFocused: { borderColor: COLORS.primary, borderWidth: 2 },
  codeBoxFilled: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  codeBoxError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: COLORS.errorLight },
  
  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.errorLight, borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.errorBorder, gap: 10 },
  errorIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.error, justifyContent: 'center', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.error },
  
  // Resend
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '400', color: COLORS.dark },
  resendLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  resendDisabled: { color: COLORS.gray },
  
  // Spacer invisible - garde l'espace dans le scroll
  spacer: { flex: 1, minHeight: 200 },

  // Footer - HORS du KeyboardAvoidingView
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
});