import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  ScrollView, KeyboardAvoidingView, Platform, Keyboard, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../config/theme';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

// Style unifié Smuppy
const FORM = {
  inputHeight: 56,
  inputRadius: 28,
  buttonHeight: 56,
  buttonRadius: 28,
};

// Validation email
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const validateEmail = (value) => {
    if (!value.trim()) return 'Email is required';
    if (!isValidEmail(value)) return 'Please enter a valid email';
    return '';
  };

  const handleEmailChange = (value) => {
    setEmail(value);
    if (emailTouched) setEmailError(validateEmail(value));
  };

  const handleEmailBlur = () => {
    setIsFocused(false);
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  };

  const handleSend = () => {
    Keyboard.dismiss();
    const error = validateEmail(email);
    setEmailTouched(true);
    setEmailError(error);
    
    if (!error) {
      console.log('Sending code to:', email);
      setShowSuccessModal(true);
    }
  };

  const handleContinue = () => {
    setShowSuccessModal(false);
    navigate('ResetCode', { email });
  };

  const isFormValid = email.trim() && isValidEmail(email);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Back */}
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Forgot password</Text>
            <Text style={styles.subtitle}>Enter your email address to recover your password</Text>
          </View>

          {/* Email */}
          <Text style={styles.label}>Email address</Text>
          <View style={[
            styles.inputBox, 
            isFocused && styles.inputFocused,
            emailTouched && emailError && styles.inputError,
            emailTouched && !emailError && email.length > 0 && styles.inputValid,
          ]}>
            <Ionicons 
              name="mail-outline" 
              size={20} 
              color={
                emailTouched && emailError 
                  ? '#FF3B30' 
                  : isFocused 
                    ? '#00cdb5' 
                    : '#9cadbc'
              } 
            />
            <TextInput 
              style={styles.input} 
              placeholder="mailusersmuppy@mail.com" 
              placeholderTextColor="#9cadbc"
              value={email} 
              onChangeText={handleEmailChange}
              onFocus={() => setIsFocused(true)}
              onBlur={handleEmailBlur}
              keyboardType="email-address" 
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSend}
            />
            {email.length > 0 && (
              <TouchableOpacity onPress={() => { setEmail(''); setEmailError(''); }}>
                <Ionicons name="close-circle" size={20} color="#9cadbc" />
              </TouchableOpacity>
            )}
          </View>
          {emailTouched && emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

          {/* Send Button */}
          <LinearGradient
            colors={isFormValid ? ['#00cdb5', '#0066ac'] : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.btn}
          >
            <TouchableOpacity
              style={styles.btnInner}
              onPress={handleSend}
              disabled={!isFormValid || disabled}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Send code</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </LinearGradient>

          {/* Back to Login */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Changed your mind? </Text>
            <TouchableOpacity onPress={() => navigate('Login')} style={styles.loginLink} disabled={disabled}>
              <Text style={styles.linkText}>Back to login</Text>
              <Ionicons name="arrow-forward" size={14} color="#00cdb5" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer} pointerEvents="none">
        <SmuppyText width={120} variant="dark" />
      </View>

      {/* Success Modal */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {/* Icon with gradient background */}
            <LinearGradient
              colors={['#00cdb5', '#0066ac']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalIcon}
            >
              <Ionicons name="mail" size={36} color={COLORS.white} />
            </LinearGradient>

            {/* Title */}
            <Text style={styles.modalTitle}>Code Sent!</Text>

            {/* Message */}
            <Text style={styles.modalMessage}>
              We've sent a verification code to
            </Text>
            <Text style={styles.modalEmail}>{email}</Text>

            {/* Button */}
            <LinearGradient
              colors={['#00cdb5', '#0066ac']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalBtn}
            >
              <TouchableOpacity 
                style={styles.modalBtnInner} 
                onPress={handleContinue}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  flex: { 
    flex: 1,
  },
  content: { 
    flexGrow: 1, 
    paddingHorizontal: SPACING.xl, 
    paddingTop: SPACING.base, 
    paddingBottom: SPACING.xl,
  },
  disabled: { 
    opacity: 0.6,
  },

  // Back
  backBtn: { 
    width: 44, 
    height: 44, 
    backgroundColor: '#0a252f', 
    borderRadius: 22, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: SPACING.xl,
  },

  // Header
  header: { 
    alignItems: 'center', 
    marginBottom: SPACING['2xl'],
  },
  title: { 
    fontFamily: 'WorkSans-Bold', 
    fontSize: 28, 
    color: '#0a252f', 
    textAlign: 'center', 
    marginBottom: SPACING.sm,
  },
  subtitle: { 
    fontSize: 14, 
    color: '#676C75', 
    textAlign: 'center',
    lineHeight: 22,
  },

  // Input - STYLE CAPSULE UNIFIÉ
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
    marginBottom: SPACING.sm, 
    backgroundColor: COLORS.white,
  },
  inputFocused: {
    borderColor: '#00cdb5',
    backgroundColor: '#F0FDFB',
  },
  inputValid: {
    borderColor: '#00cdb5',
    backgroundColor: '#E6FAF8',
  },
  inputError: { 
    borderColor: '#FF3B30',
    backgroundColor: '#FEF2F2',
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
    marginBottom: SPACING.md, 
    marginLeft: 8,
  },

  // Button - STYLE CAPSULE UNIFIÉ
  btn: { 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius, 
    marginTop: SPACING.md, 
    marginBottom: SPACING.xl,
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

  // Login link
  loginRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  loginText: { 
    fontSize: 14, 
    color: '#676C75',
  },
  loginLink: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
  },
  linkText: { 
    fontSize: 14, 
    color: '#00cdb5', 
    fontWeight: '600',
  },

  // Footer
  footer: { 
    position: 'absolute', 
    bottom: 40, 
    left: 0, 
    right: 0, 
    alignItems: 'center',
  },

  // Modal
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 24,
  },
  modalBox: { 
    width: '100%', 
    backgroundColor: COLORS.white, 
    borderRadius: 24, 
    padding: 28, 
    alignItems: 'center',
  },
  modalIcon: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 20,
    shadowColor: '#00cdb5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: { 
    fontFamily: 'WorkSans-Bold', 
    fontSize: 24, 
    color: '#0a252f', 
    marginBottom: 12,
  },
  modalMessage: { 
    fontSize: 15, 
    color: '#676C75', 
    textAlign: 'center', 
    lineHeight: 22,
  },
  modalEmail: { 
    fontSize: 15,
    color: '#00cdb5', 
    fontWeight: '600',
    marginBottom: 24,
  },
  modalBtn: { 
    width: '100%', 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius,
    overflow: 'hidden',
  },
  modalBtnInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalBtnText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: COLORS.white,
  },
});