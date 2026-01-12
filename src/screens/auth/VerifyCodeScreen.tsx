import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { supabase } from '../../config/supabase';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';

const CODE_LENGTH = 6; // Supabase OTP is 6 digits

export default function VerifyCodeScreen({ navigation, route }) {
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  const inputs = useRef([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  
  const email = route?.params?.email || 'mailusersmuppy@mail.com';
  const { goBack, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);

  // Animation shake
  const triggerShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Handlers
  const clearCode = useCallback((shouldFocus = false) => {
    setCode(Array(CODE_LENGTH).fill(''));
    setError('');
    if (shouldFocus) setTimeout(() => inputs.current[0]?.focus(), 100);
  }, []);

  const verifyCode = useCallback(async (fullCode) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: 'signup',
      });

      if (verifyError) {
        if (verifyError.message.includes('expired')) {
          setError('Code expired. Please request a new one.');
        } else if (verifyError.message.includes('invalid')) {
          setError('Invalid verification code. Please try again.');
        } else {
          setError(verifyError.message || 'Verification failed. Please try again.');
        }
        triggerShake();
        clearCode(true);
      } else if (data?.user) {
        // Verification successful - navigate to biometric setup
        navigation.reset({
          index: 0,
          routes: [{ name: 'EnableBiometric' }],
        });
      }
    } catch (err) {
      setError('Connection error. Please check your internet and try again.');
      triggerShake();
    } finally {
      setIsVerifying(false);
    }
  }, [email, navigation, triggerShake, clearCode]);

  const handleChange = useCallback((text, index) => {
    if (error) setError('');
    if (text && !/^\d+$/.test(text)) return;
    
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    
    if (text && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    
    if (text && index === CODE_LENGTH - 1 && newCode.join('').length === CODE_LENGTH) {
      verifyCode(newCode.join(''));
    }
  }, [code, error, verifyCode]);

  const handleKeyPress = useCallback((e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }, [code]);

  const handleFocus = useCallback((index) => {
    setFocusedIndex(index);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  const handleResend = useCallback(async () => {
    Keyboard.dismiss();

    if (!canAction) {
      setShowModal(true);
      return;
    }

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      });

      if (resendError) {
        setError(resendError.message || 'Failed to resend code. Please try again.');
      } else {
        tryAction(() => clearCode(false));
        setShowModal(true);
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    }
  }, [canAction, tryAction, clearCode, setShowModal, email]);

  // Style helper - 3 états: default, focused, filled/error
  const getBoxStyle = useCallback((index) => {
    if (error) return [styles.codeBox, styles.codeBoxError];
    if (code[index]) return [styles.codeBox, styles.codeBoxFilled];
    if (focusedIndex === index) return [styles.codeBox, styles.codeBoxFocused];
    return [styles.codeBox];
  }, [error, code, focusedIndex]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView 
          contentContainerStyle={styles.content} 
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity 
            style={[styles.backBtn, disabled && styles.disabled]} 
            onPress={goBack} 
            disabled={disabled}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Confirm your identity</Text>
            <Text style={styles.subtitle}>
              An authentication code has been sent to{' '}
              <Text style={styles.emailText}>{email}</Text> ✏️
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
                onFocus={() => handleFocus(i)}
                onBlur={handleBlur}
                selectTextOnFocus
                editable={!isVerifying}
              />
            ))}
          </Animated.View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorBox}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Resend Link */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn't receive a code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={isVerifying}>
              <Text style={[styles.resendLink, isVerifying && styles.resendDisabled]}>
                {canAction ? 'Resend Code' : `Wait ${remainingTime}s`}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer - Position absolute fixe en bas (ne monte pas avec clavier) */}
      <View style={styles.footer} pointerEvents="none">
        <SmuppyText width={140} variant="dark" />
      </View>

      {/* Cooldown Modal */}
      <CooldownModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        seconds={remainingTime || 30}
        title={canAction ? 'Code Sent!' : 'Please wait'}
        message={canAction 
          ? 'A new verification code has been sent to your email. You can request another one in'
          : 'You can request a new code in'
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING['3xl'] },
  disabled: { opacity: 0.6 },
  
  // Back Button
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },
  
  // Header - même format que SignupScreen
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: '#0a252f', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  emailText: { color: COLORS.primary, fontWeight: '600' },
  
  // Code Input - 3 états: default, focused, filled/error (6 digits for Supabase OTP)
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.md },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  codeBox: { width: 48, height: 54, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, textAlign: 'center', fontSize: 22, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  codeBoxFilled: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#E8FBF5' },
  codeBoxError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: '#FEECEC' },
  
  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA', gap: 10 },
  errorIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.error, justifyContent: 'center', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.error },
  
  // Resend
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '400', color: COLORS.dark },
  resendLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  resendDisabled: { color: COLORS.gray },
  
  // Footer - Position absolute fixe en bas (ne monte pas avec clavier)
  footer: { position: 'absolute', bottom: SPACING['3xl'], left: 0, right: 0, alignItems: 'center' },
});