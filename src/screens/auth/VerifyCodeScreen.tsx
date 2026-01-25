import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard
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
import { checkAWSRateLimit } from '../../services/awsRateLimit';
import * as backend from '../../services/backend';
import { awsAuth } from '../../services/aws-auth';

const CODE_LENGTH = 6;

export default function VerifyCodeScreen({ navigation, route }) {
  const [code, setCode] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inputs = useRef<TextInput[]>([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const isCreatingRef = useRef(false);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract all onboarding data from params
  const {
    email,
    password,
    name,
    gender,
    dateOfBirth,
    accountType,
    interests,
    profileImage,
    // Pro Creator params
    displayName,
    username,
    bio,
    website,
    socialLinks,
    expertise,
    // Pro Business params
    businessCategory,
    businessCategoryCustom,
    locationsMode,
    businessName,
    businessAddress,
    businessPhone,
    // Session persistence
    rememberMe = false,
  } = route?.params || {};

  const { goBack, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);
  const { updateProfile: updateUserContext } = useUser();
  const setZustandUser = useUserStore((state) => state.setUser);

  // Determine step based on account type - VerifyCode is the last step
  // All account types now have 4 steps
  const { currentStep, totalSteps } = useMemo(() => {
    return { currentStep: 4, totalSteps: 4 };
  }, []);

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Clear code
  const clearCode = useCallback((shouldFocus = false) => {
    setCode(Array(CODE_LENGTH).fill(''));
    setError('');
    if (shouldFocus) {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
      focusTimeoutRef.current = setTimeout(() => inputs.current[0]?.focus(), 100);
    }
  }, []);

  // Create account and send OTP using AWS Cognito
  const createAccountAndSendOTP = useCallback(async () => {
    if (accountCreated || isCreatingRef.current) return;

    isCreatingRef.current = true;
    setIsCreatingAccount(true);
    setError('');

    try {
      // Use backend service which routes to AWS Cognito
      const result = await backend.signUp({
        email,
        password,
        username: username || email.split('@')[0],
        fullName: name,
      });

      if (result.confirmationRequired) {
        // Account created, confirmation code sent
        setAccountCreated(true);
      } else if (result.user) {
        // Account created and confirmed (auto-confirm enabled in Cognito)
        setAccountCreated(true);
      } else {
        setError('Unable to create account. Please try again.');
      }
    } catch (err: any) {
      console.error('[VerifyCode] Create account error:', err);
      console.error('[VerifyCode] Error name:', err?.name);
      console.error('[VerifyCode] Error message:', err?.message);
      console.error('[VerifyCode] Error code:', err?.code);
      console.error('[VerifyCode] Full error:', JSON.stringify(err, null, 2));

      // Handle Cognito-specific errors
      const errorMessage = err?.message || '';
      const errorName = err?.name || '';

      if (errorMessage.includes('UsernameExistsException') || errorName === 'UsernameExistsException' || errorMessage.includes('already exists')) {
        setError('An account with this email already exists. Please login instead.');
      } else if (errorMessage.includes('InvalidParameterException') || errorName === 'InvalidParameterException') {
        setError('Invalid email or password format. Please check and try again.');
      } else if (errorMessage.includes('InvalidPasswordException') || errorName === 'InvalidPasswordException') {
        setError('Password must be at least 8 characters with uppercase, lowercase, and numbers.');
      } else if (errorMessage.includes('TooManyRequestsException') || errorMessage.includes('rate')) {
        setError('Too many attempts. Please wait a few minutes.');
      } else if (errorMessage.includes('NetworkError') || errorMessage.includes('Network request failed')) {
        setError('Network error. Please check your internet connection.');
      } else {
        // Show the actual error for debugging
        setError(`Error: ${errorMessage || errorName || 'Unknown error. Please try again.'}`);
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreatingAccount(false);
    }
  }, [email, password, username, name, accountCreated]);

  // Create account on mount
  useEffect(() => {
    if (!email || !password) {
      console.error('[VerifyCode] Missing credentials:', { email: !!email, password: !!password });
      setError('Missing email or password. Please go back and try again.');
      return;
    }
    if (!accountCreated) {
      createAccountAndSendOTP();
    }
  }, [email, password, accountCreated, createAccountAndSendOTP]);

  // Verify code and create profile using AWS Cognito
  const verifyCode = useCallback(async (fullCode) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();

    try {
      // IMPORTANT: Set flag BEFORE confirmation
      await storage.set(STORAGE_KEYS.JUST_SIGNED_UP, 'true');

      // Step 1: Confirm signup with AWS Cognito
      const confirmed = await awsAuth.confirmSignUp(email, fullCode);

      if (!confirmed) {
        await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);
        setError('Verification failed. Please try again.');
        triggerShake();
        clearCode(true);
        return;
      }

      // Step 2: Sign in after confirmation to get session
      const user = await backend.signIn({ email, password });

      if (!user) {
        await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);
        setError('Account verified but login failed. Please try logging in manually.');
        triggerShake();
        return;
      }

      // Step 3: Upload profile image if exists
      let avatarUrl: string | null = null;
      if (profileImage && user.id) {
        const { url, error: uploadError } = await uploadProfileImage(profileImage, user.id);
        if (!uploadError && url) {
          avatarUrl = url;
        }
      }

      // Step 4: Create profile with all onboarding data
      const generatedUsername = email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || `user_${Date.now()}`;
      const profileData: Record<string, unknown> = {
        full_name: name || generatedUsername,
        username: username || generatedUsername,
        account_type: accountType || 'personal',
      };

      // Add avatar URL if uploaded
      if (avatarUrl) profileData.avatar_url = avatarUrl;

      // Add personal info
      if (gender) profileData.gender = gender;
      if (dateOfBirth) profileData.date_of_birth = dateOfBirth;

      // Add pro creator/business specific data
      if (displayName) profileData.display_name = displayName;
      if (bio) profileData.bio = bio;
      if (website) profileData.website = website;
      if (socialLinks && Object.keys(socialLinks).length > 0) {
        profileData.social_links = socialLinks;
      }

      // Add interests/expertise as arrays
      if (interests && interests.length > 0) {
        profileData.interests = interests;
      }
      if (expertise && expertise.length > 0) {
        profileData.expertise = expertise;
      }

      // Add business info
      if (businessName) profileData.business_name = businessName;
      if (businessCategory) profileData.business_category = businessCategory === 'Other' ? businessCategoryCustom : businessCategory;
      if (businessAddress) profileData.business_address = businessAddress;
      if (businessPhone) profileData.business_phone = businessPhone;
      if (locationsMode) profileData.locations_mode = locationsMode;

      await createProfile(profileData);

      // Step 5: Populate UserContext with onboarding data
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

      // Step 5b: Sync to Zustand store for unified state management
      setZustandUser(userData);

      // Step 6: Handle session persistence based on rememberMe
      await storage.set(STORAGE_KEYS.REMEMBER_ME, rememberMe ? 'true' : 'false');

      // Step 7: Navigate to Success
      navigation.reset({
        index: 0,
        routes: [{ name: 'Success', params: { name } }],
      });

    } catch (err: any) {
      console.error('[VerifyCode] Verification error:', err);
      await storage.delete(STORAGE_KEYS.JUST_SIGNED_UP);

      const errorMessage = err?.message || '';

      if (errorMessage.includes('expired') || errorMessage.includes('ExpiredCodeException')) {
        setError('Code expired. Please request a new one.');
      } else if (errorMessage.includes('invalid') || errorMessage.includes('CodeMismatchException')) {
        setError('Invalid verification code. Please try again.');
      } else {
        setError('Verification failed. Please check your code and try again.');
      }
      triggerShake();
      clearCode(true);
    } finally {
      setIsVerifying(false);
    }
  }, [email, password, name, username, gender, dateOfBirth, accountType, profileImage, displayName, bio, website, socialLinks, interests, expertise, businessName, businessCategory, businessCategoryCustom, businessAddress, businessPhone, locationsMode, rememberMe, navigation, triggerShake, clearCode, updateUserContext, setZustandUser]);

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

  // Resend OTP using AWS Cognito
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

      // Use AWS Cognito to resend confirmation code
      await awsAuth.resendConfirmationCode(email);
      tryAction(() => clearCode(false));
      setShowModal(true);
    } catch (err: any) {
      console.error('[VerifyCode] Resend error:', err);
      const errorMessage = err?.message || '';

      if (errorMessage.includes('LimitExceededException') || errorMessage.includes('rate')) {
        setError('Too many attempts. Please wait a few minutes.');
      } else {
        setError('Failed to resend code. Please try again.');
      }
    }
  }, [canAction, tryAction, clearCode, setShowModal, email]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - last step for all flows */}
        <OnboardingHeader onBack={goBack} disabled={disabled || isVerifying} currentStep={currentStep} totalSteps={totalSteps} />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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
                {Array.from({ length: CODE_LENGTH }, (_, i) => {
                  const isFilled = code[i] !== '';
                  const hasError = !!error;

                  if (hasError) {
                    return (
                      <TextInput
                        key={i}
                        ref={(ref) => { inputs.current[i] = ref; }}
                        style={[styles.codeBox, styles.codeBoxError]}
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
                    );
                  }

                  const isFocused = focusedIndex === i;
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
                        value={code[i]}
                        onChangeText={(text) => handleChange(text, i)}
                        onKeyPress={(e) => handleKeyPress(e, i)}
                        onFocus={() => handleFocus(i)}
                        onBlur={handleBlur}
                        selectTextOnFocus
                        editable={!isVerifying}
                      />
                    </LinearGradient>
                  );
                })}
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
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },

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
