import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { ENV } from '../../config/env';
import { supabase } from '../../config/supabase';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { createProfile } from '../../services/database';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';
import { checkAWSRateLimit } from '../../services/awsRateLimit';

const CODE_LENGTH = 6;

export default function VerifyCodeScreen({ navigation, route }) {
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inputs = useRef([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Extract all onboarding data from params
  const {
    email,
    password,
    name,
    gender,
    dateOfBirth,
    accountType,
    interests,
    businessName,
    businessAddress,
    businessPhone,
    profession,
  } = route?.params || {};

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

  // Clear code
  const clearCode = useCallback((shouldFocus = false) => {
    setCode(Array(CODE_LENGTH).fill(''));
    setError('');
    if (shouldFocus) setTimeout(() => inputs.current[0]?.focus(), 100);
  }, []);

  // Create account and send OTP
  const createAccountAndSendOTP = useCallback(async () => {
    if (accountCreated || isCreatingAccount) return;

    setIsCreatingAccount(true);
    setError('');

    try {
      const response = await fetch(`${ENV.SUPABASE_URL}/functions/v1/auth-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': ENV.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${ENV.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setError('Too many attempts. Please wait a few minutes.');
          return;
        }

        // Check if email already exists by trying to resend OTP
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email,
        });

        if (resendError) {
          // Generic message - don't reveal if email exists (anti-enumeration)
          setError('Unable to verify this email. Please try again or use a different email address.');
          return;
        }

        // Resend succeeded, account exists but not verified
        setAccountCreated(true);
        return;
      }

      setAccountCreated(true);
    } catch (err) {
      console.error('[VerifyCode] Create account error:', err);
      setError('Connection error. Please check your internet and try again.');
    } finally {
      setIsCreatingAccount(false);
    }
  }, [email, password, accountCreated, isCreatingAccount]);

  // Create account on mount
  useEffect(() => {
    if (email && password && !accountCreated) {
      createAccountAndSendOTP();
    }
  }, [email, password, accountCreated, createAccountAndSendOTP]);

  // Verify code and create profile
  const verifyCode = useCallback(async (fullCode) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();

    try {
      // Step 1: Verify OTP - try 'email' type first (for generateLink), then 'signup'
      let data, verifyError;

      // Try with type 'email' first (works with generateLink)
      const result1 = await supabase.auth.verifyOtp({
        email,
        token: fullCode,
        type: 'email',
      });

      if (result1.error) {
        // Fallback to 'signup' type
        const result2 = await supabase.auth.verifyOtp({
          email,
          token: fullCode,
          type: 'signup',
        });
        data = result2.data;
        verifyError = result2.error;
        console.log('[VerifyCode] signup type result:', result2.error?.message);
      } else {
        data = result1.data;
        verifyError = result1.error;
      }

      if (verifyError) {
        console.log('[VerifyCode] Error:', verifyError.message);
        if (verifyError.message.includes('expired')) {
          setError('Code expired. Please request a new one.');
        } else if (verifyError.message.includes('invalid')) {
          setError('Invalid verification code. Please try again.');
        } else {
          setError(verifyError.message || 'Verification failed. Please try again.');
        }
        triggerShake();
        clearCode(true);
        return;
      }

      if (!data?.user) {
        setError('Verification failed. Please try again.');
        triggerShake();
        clearCode(true);
        return;
      }

      // Step 2: Create profile with basic data
      // Only use columns that exist in profiles table: id, full_name, username, avatar_url
      const username = email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      const profileData = {
        full_name: name || username,
        username: username,
      };

      const { error: profileError } = await createProfile(profileData);

      if (profileError) {
        console.error('[VerifyCode] Profile creation error:', profileError);
        // Don't fail the flow, profile can be created later
      }

      // Step 3: Persist session
      await storage.set(STORAGE_KEYS.REMEMBER_ME, 'true');
      if (data.session) {
        await storage.set(STORAGE_KEYS.ACCESS_TOKEN, data.session.access_token);
        await storage.set(STORAGE_KEYS.REFRESH_TOKEN, data.session.refresh_token);
      }

      // Step 4: Set flag to show SuccessScreen (prevents immediate switch to Main)
      await storage.set(STORAGE_KEYS.JUST_SIGNED_UP, 'true');

      // Step 5: Navigate to Success
      navigation.reset({
        index: 0,
        routes: [{ name: 'Success', params: { name } }],
      });

    } catch (err) {
      console.error('[VerifyCode] Verification error:', err);
      setError('Connection error. Please check your internet and try again.');
      triggerShake();
    } finally {
      setIsVerifying(false);
    }
  }, [email, name, gender, dateOfBirth, accountType, interests, businessName, businessAddress, businessPhone, profession, navigation, triggerShake, clearCode]);

  // Handle code input
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

  // Resend OTP
  const handleResend = useCallback(async () => {
    Keyboard.dismiss();

    if (!canAction) {
      setShowModal(true);
      return;
    }

    try {
      const awsCheck = await checkAWSRateLimit(email, 'auth-resend');
      if (!awsCheck.allowed) {
        setError(`Too many attempts. Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes.`);
        return;
      }

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

  // Style helper
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
            disabled={disabled || isVerifying}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              {isCreatingAccount ? 'Sending verification code...' : (
                <>
                  A verification code has been sent to{' '}
                  <Text style={styles.emailText}>{email}</Text>
                </>
              )}
            </Text>
          </View>

          {/* Code Input */}
          {accountCreated && (
            <>
              <Text style={styles.label}>Enter code</Text>
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
            </>
          )}

          {/* Creating account message */}
          {isCreatingAccount && (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>Setting up your account...</Text>
            </View>
          )}

          {/* Error when account creation fails */}
          {!accountCreated && !isCreatingAccount && error ? (
            <View style={styles.errorBox}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
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

  // Header
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: '#0a252f', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  emailText: { color: COLORS.primary, fontWeight: '600' },

  // Code Input
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.md },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  codeBox: { width: 48, height: 54, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, textAlign: 'center', fontSize: 22, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  codeBoxFilled: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#E8FBF5' },
  codeBoxError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: '#FEECEC' },

  // Loading
  loadingBox: { alignItems: 'center', paddingVertical: SPACING.xl },
  loadingText: { fontSize: 16, color: COLORS.primary, fontWeight: '500' },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA', gap: 10 },
  errorIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.error, justifyContent: 'center', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.error },

  // Resend
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '400', color: COLORS.dark },
  resendLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  resendDisabled: { color: COLORS.gray },

  // Footer
  footer: { position: 'absolute', bottom: SPACING['3xl'], left: 0, right: 0, alignItems: 'center' },
});
