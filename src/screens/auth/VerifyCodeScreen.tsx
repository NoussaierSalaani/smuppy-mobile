import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { createProfile } from '../../services/database';
import { uploadProfileImage } from '../../services/imageUpload';
import { useUser } from '../../context/UserContext';
import { useUserStore } from '../../stores';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';
import * as backend from '../../services/backend';
import { awsAuth } from '../../services/aws-auth';

const CODE_LENGTH = 6;

export default function VerifyCodeScreen({ navigation, route }: any) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inputs = useRef<(TextInput | null)[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const isCreatingRef = useRef(false);

  // Extract params
  const {
    email, password, name, gender, dateOfBirth, accountType, interests, profileImage,
    displayName, username, bio, website, socialLinks, expertise,
    businessCategory, businessCategoryCustom, locationsMode, businessName, businessAddress, businessPhone,
    rememberMe = false,
    accountCreated: accountAlreadyCreated = false,
  } = route?.params || {};

  const { goBack, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);
  const { updateProfile: updateUserContext } = useUser();
  const setZustandUser = useUserStore((state) => state.setUser);

  // Shake animation
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
    setCode(['', '', '', '', '', '']);
    setError('');
    if (shouldFocus) {
      setTimeout(() => inputs.current[0]?.focus(), 100);
    }
  }, []);

  // Create account and send OTP
  const createAccountAndSendOTP = useCallback(async () => {
    if (accountCreated || isCreatingRef.current) return;

    isCreatingRef.current = true;
    setIsCreatingAccount(true);
    setError('');

    try {
      const result = await backend.signUp({
        email,
        password,
        username: username || email.split('@')[0],
        fullName: name,
      });

      if (result.confirmationRequired || result.user) {
        setAccountCreated(true);
      } else {
        setError('Unable to create account. Please try again.');
      }
    } catch (err: any) {
      const errorMessage = err?.message || '';
      const errorName = err?.name || '';

      if (errorMessage.includes('UsernameExists') || errorMessage.includes('AliasExists') || errorMessage.includes('already')) {
        setError('Unable to create account. Please try again or login.');
      } else if (errorName.includes('InvalidPassword') || errorMessage.includes('Password')) {
        setError('Password must be at least 8 characters with uppercase, lowercase, numbers, and special character.');
      } else if (errorMessage.includes('TooManyRequests') || errorMessage.includes('rate')) {
        setError('Too many attempts. Please wait a few minutes.');
      } else if (errorMessage.includes('Network')) {
        setError('Network error. Please check your connection.');
      } else {
        setError('Unable to create account. Please try again.');
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreatingAccount(false);
    }
  }, [email, password, username, name, accountCreated]);

  // Create account on mount
  useEffect(() => {
    if (!email || !password) {
      setError('Missing credentials. Please go back and try again.');
      return;
    }
    if (accountAlreadyCreated) {
      setAccountCreated(true);
      return;
    }
    if (!accountCreated) {
      createAccountAndSendOTP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify code
  const verifyCode = useCallback(async (fullCode: string) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();

    try {
      await storage.set(STORAGE_KEYS.JUST_SIGNED_UP, 'true');

      // Confirm signup
      const confirmed = await awsAuth.confirmSignUp(email, fullCode);
      if (!confirmed) {
        await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);
        setError('Verification failed. Please try again.');
        triggerShake();
        clearCode(true);
        return;
      }

      // Sign in
      const user = await backend.signIn({ email, password });
      if (!user) {
        await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);
        setError('Account verified but login failed. Please try logging in.');
        triggerShake();
        return;
      }

      // Upload profile image
      let avatarUrl: string | null = null;
      if (profileImage && user.id) {
        const { url } = await uploadProfileImage(profileImage, user.id);
        if (url) avatarUrl = url;
      }

      // Create profile
      const generatedUsername = email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      const profileData: Record<string, unknown> = {
        full_name: name || generatedUsername,
        username: username || generatedUsername,
        account_type: accountType || 'personal',
      };

      if (avatarUrl) profileData.avatar_url = avatarUrl;
      if (gender) profileData.gender = gender;
      if (dateOfBirth) profileData.date_of_birth = dateOfBirth;
      if (displayName) profileData.display_name = displayName;
      if (bio) profileData.bio = bio;
      if (website) profileData.website = website;
      if (socialLinks && Object.keys(socialLinks).length > 0) profileData.social_links = socialLinks;
      if (interests?.length > 0) profileData.interests = interests;
      if (expertise?.length > 0) profileData.expertise = expertise;
      if (businessName) profileData.business_name = businessName;
      if (businessCategory) profileData.business_category = businessCategory === 'Other' ? businessCategoryCustom : businessCategory;
      if (businessAddress) profileData.business_address = businessAddress;
      if (businessPhone) profileData.business_phone = businessPhone;
      if (locationsMode) profileData.locations_mode = locationsMode;

      await createProfile(profileData);

      // Update contexts
      const userData = {
        id: user.id,
        fullName: name || generatedUsername,
        displayName: displayName || name || generatedUsername,
        email,
        dateOfBirth: dateOfBirth || '',
        gender: gender || '',
        avatar: avatarUrl,
        bio: bio || '',
        username: username || generatedUsername,
        accountType: accountType || 'personal',
        interests: interests || [],
        expertise: expertise || [],
        website: website || '',
        socialLinks: socialLinks || {},
        businessName: businessName || '',
        businessCategory: businessCategory === 'Other' ? businessCategoryCustom : (businessCategory || ''),
        businessAddress: businessAddress || '',
        businessPhone: businessPhone || '',
        locationsMode: locationsMode || '',
      };
      await updateUserContext(userData);
      setZustandUser(userData);

      // Persist session
      await storage.set(STORAGE_KEYS.REMEMBER_ME, rememberMe ? 'true' : 'false');

      // Navigate to success
      navigation.reset({
        index: 0,
        routes: [{ name: 'Success', params: { name } }],
      });

    } catch (err: any) {
      await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);
      const msg = err?.message || '';

      if (msg.includes('expired') || msg.includes('ExpiredCode')) {
        setError('Code expired. Please request a new one.');
      } else if (msg.includes('invalid') || msg.includes('CodeMismatch')) {
        setError('Invalid code. Please try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
      triggerShake();
      clearCode(true);
    } finally {
      setIsVerifying(false);
    }
  }, [email, password, name, username, gender, dateOfBirth, accountType, profileImage, displayName, bio, website, socialLinks, interests, expertise, businessName, businessCategory, businessCategoryCustom, businessAddress, businessPhone, locationsMode, rememberMe, navigation, triggerShake, clearCode, updateUserContext, setZustandUser]);

  // Handle code input
  const handleChange = useCallback((text: string, index: number) => {
    if (error) setError('');
    if (text && !/^\d+$/.test(text)) return;

    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    if (text && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }

    if (text && index === CODE_LENGTH - 1 && newCode.every(c => c)) {
      verifyCode(newCode.join(''));
    }
  }, [code, error, verifyCode]);

  const handleKeyPress = useCallback((e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }, [code]);

  // Resend code
  const handleResend = useCallback(async () => {
    Keyboard.dismiss();

    if (!canAction) {
      setShowModal(true);
      return;
    }

    try {
      await awsAuth.resendConfirmationCode(email);
      tryAction(() => clearCode(false));
      setShowModal(true);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('LimitExceeded') || msg.includes('rate')) {
        setError('Too many attempts. Please wait a few minutes.');
      } else {
        setError('Failed to resend code. Please try again.');
      }
    }
  }, [canAction, tryAction, clearCode, setShowModal, email]);

  // Loading state
  if (isCreatingAccount) {
    return (
      <SafeAreaView style={styles.container}>
        <OnboardingHeader onBack={goBack} disabled currentStep={4} totalSteps={4} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Setting up your account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <OnboardingHeader onBack={goBack} disabled={disabled || isVerifying} currentStep={4} totalSteps={4} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>
              A verification code has been sent to{' '}
              <Text style={styles.emailText}>{email}</Text>
            </Text>
          </View>

          {/* Code Input */}
          {accountCreated && (
            <>
              <Text style={styles.label}>Enter code</Text>
              <Animated.View style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
                {code.map((digit, i) => {
                  const isFilled = digit !== '';
                  const isFocused = focusedIndex === i;
                  const hasError = !!error;

                  if (hasError) {
                    return (
                      <TextInput
                        key={i}
                        ref={(ref) => { inputs.current[i] = ref; }}
                        style={[styles.codeBox, styles.codeBoxError]}
                        maxLength={1}
                        keyboardType="number-pad"
                        value={digit}
                        onChangeText={(text) => handleChange(text, i)}
                        onKeyPress={(e) => handleKeyPress(e, i)}
                        onFocus={() => setFocusedIndex(i)}
                        onBlur={() => setFocusedIndex(-1)}
                        selectTextOnFocus
                        editable={!isVerifying}
                      />
                    );
                  }

                  return (
                    <LinearGradient
                      key={i}
                      colors={(isFilled || isFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.codeBoxGradient}
                    >
                      <TextInput
                        ref={(ref) => { inputs.current[i] = ref; }}
                        style={[styles.codeBoxInner, isFilled && styles.codeBoxInnerFilled]}
                        maxLength={1}
                        keyboardType="number-pad"
                        value={digit}
                        onChangeText={(text) => handleChange(text, i)}
                        onKeyPress={(e) => handleKeyPress(e, i)}
                        onFocus={() => setFocusedIndex(i)}
                        onBlur={() => setFocusedIndex(-1)}
                        selectTextOnFocus
                        editable={!isVerifying}
                      />
                    </LinearGradient>
                  );
                })}
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

              {/* Verifying indicator */}
              {isVerifying && (
                <View style={styles.verifyingBox}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.verifyingText}>Verifying...</Text>
                </View>
              )}
            </>
          )}

          {/* Error before account created */}
          {!accountCreated && error ? (
            <View style={styles.errorBox}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <CooldownModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        seconds={remainingTime || 30}
        title={canAction ? 'Code Sent!' : 'Please wait'}
        message={canAction
          ? 'A new verification code has been sent to your email.'
          : 'You can request a new code in'
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 16, color: COLORS.primary, fontWeight: '500' },

  // Header
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: '#0a252f', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  emailText: { color: COLORS.primary, fontWeight: '600' },

  // Code Input
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.md },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  codeBox: { width: 48, height: 54, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, textAlign: 'center', fontSize: 22, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxGradient: { width: 48, height: 54, borderRadius: SIZES.radiusMd, padding: 2 },
  codeBoxInner: { flex: 1, borderRadius: SIZES.radiusMd - 2, textAlign: 'center', fontSize: 22, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxInnerFilled: { backgroundColor: '#E8FBF5' },
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

  // Verifying
  verifyingBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: SPACING.lg },
  verifyingText: { fontSize: 14, color: COLORS.primary, fontWeight: '500' },
});
