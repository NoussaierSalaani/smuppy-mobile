import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Animated, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';

const VALID_CODE = '12345';

export default function VerifyCodeScreen({ navigation, route }) {
  const [code, setCode] = useState(['', '', '', '', '']);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const inputs = useRef([]);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const email = route?.params?.email || 'mailusersmuppy@mail.com';
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const clearCode = (shouldFocus = false) => {
    setCode(['', '', '', '', '']);
    setError('');
    if (shouldFocus) setTimeout(() => inputs.current[0]?.focus(), 100);
  };

  const verifyCode = (fullCode) => {
    setIsVerifying(true);
    setError('');
    Keyboard.dismiss();
    setTimeout(() => {
      if (fullCode === VALID_CODE) {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Signup' },
            { name: 'EnableBiometric' },
          ],
        });
      } else {
        setError('Invalid verification code. Please try again.');
        triggerShake();
      }
      setIsVerifying(false);
    }, 100);
  };

  const handleChange = (text, index) => {
    if (error) setError('');
    if (text && !/^\d+$/.test(text)) return;
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    if (text && index < 4) inputs.current[index + 1].focus();
    if (text && index === 4 && newCode.join('').length === 5) verifyCode(newCode.join(''));
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) inputs.current[index - 1].focus();
  };

  const handleResend = () => {
    Keyboard.dismiss();
    setTimeout(() => {
      if (canAction) {
        tryAction(() => { clearCode(false); console.log('Resend code to:', email); });
        setShowModal(true);
      } else {
        setShowModal(true);
      }
    }, 100);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Confirm your identity</Text>
            <Text style={styles.subtitle}>
              An authentication code has been sent to <Text style={styles.emailText}>{email}</Text> ✏️
            </Text>
          </View>

          <Text style={styles.label}>Code</Text>
          <Animated.View style={[styles.codeRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[0, 1, 2, 3, 4].map((i) => (
              <TextInput
                key={i}
                ref={(ref) => inputs.current[i] = ref}
                style={[styles.codeBox, code[i] && !error && styles.codeBoxFilled, error && styles.codeBoxError]}
                maxLength={1}
                keyboardType="number-pad"
                value={code[i]}
                onChangeText={(text) => handleChange(text, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                selectTextOnFocus
                editable={!isVerifying}
              />
            ))}
          </Animated.View>

          {error ? (
            <View style={styles.errorBox}>
              <View style={styles.errorIcon}>
                <Ionicons name="alert-circle" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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

      <View style={styles.footer} pointerEvents="none">
        <SmuppyText width={140} variant="dark" />
      </View>

      <CooldownModal visible={showModal} onClose={() => setShowModal(false)} seconds={remainingTime} title="Code Sent!" message="A new verification code has been sent to your email. You can request another one in" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING['3xl'] },
  disabled: { opacity: 0.6 },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING['3xl'] },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, fontWeight: '400', color: COLORS.dark, textAlign: 'center', lineHeight: 22 },
  emailText: { color: COLORS.primary, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.md },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.md },
  codeBox: { width: 58, height: 58, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, textAlign: 'center', fontSize: 24, fontWeight: '700', color: COLORS.dark, backgroundColor: COLORS.white },
  codeBoxFilled: { borderColor: COLORS.primary, backgroundColor: '#E8FBF5' },
  codeBoxError: { borderColor: COLORS.error, backgroundColor: '#FEECEC' },
  errorBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: SPACING.lg, borderWidth: 1, borderColor: '#FECACA', gap: 10 },
  errorIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.error, justifyContent: 'center', alignItems: 'center' },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: COLORS.error },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '400', color: COLORS.dark },
  resendLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  resendDisabled: { color: COLORS.gray },
  footer: { position: 'absolute', bottom: SPACING['3xl'], left: 0, right: 0, alignItems: 'center' },
});