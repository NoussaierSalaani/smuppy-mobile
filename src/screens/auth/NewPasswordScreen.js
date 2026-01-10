import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

export default function NewPasswordScreen({ navigation }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isFocusedPassword, setIsFocusedPassword] = useState(false);
  const [isFocusedConfirm, setIsFocusedConfirm] = useState(false);
  const { goBack, disabled } = usePreventDoubleNavigation(navigation);

  const isValid = password.length >= 8 && password === confirmPassword;
  
  // Password strength checks
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = () => {
    if (isValid) {
      navigation.navigate('PasswordSuccess');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.flex}
      >
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
            <Text style={styles.title}>Create new password</Text>
            <Text style={styles.subtitle}>
              Your new password must be different from previously used passwords
            </Text>
          </View>

          {/* New Password Input */}
          <Text style={styles.label}>New password</Text>
          <View style={[
            styles.inputRow,
            isFocusedPassword && styles.inputRowFocused,
            password.length > 0 && hasMinLength && styles.inputRowValid,
          ]}>
            <Ionicons 
              name="lock-closed-outline" 
              size={20} 
              color={isFocusedPassword ? '#00cdb5' : '#9cadbc'} 
              style={styles.inputIcon} 
            />
            <TextInput 
              style={styles.input} 
              placeholder="Enter new password" 
              placeholderTextColor="#9cadbc"
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry={!showPassword}
              autoComplete="off"
              textContentType="none"
              onFocus={() => setIsFocusedPassword(true)}
              onBlur={() => setIsFocusedPassword(false)}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons 
                name={showPassword ? "eye-outline" : "eye-off-outline"} 
                size={20} 
                color="#9cadbc" 
              />
            </TouchableOpacity>
          </View>

          {/* Password Requirements */}
          {password.length > 0 && (
            <View style={styles.requirements}>
              <View style={styles.requirementRow}>
                <Ionicons 
                  name={hasMinLength ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={hasMinLength ? '#00cdb5' : '#9cadbc'} 
                />
                <Text style={[styles.requirementText, hasMinLength && styles.requirementMet]}>
                  At least 8 characters
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Ionicons 
                  name={hasUpperCase && hasLowerCase ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={hasUpperCase && hasLowerCase ? '#00cdb5' : '#9cadbc'} 
                />
                <Text style={[styles.requirementText, hasUpperCase && hasLowerCase && styles.requirementMet]}>
                  Upper and lower case letters
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Ionicons 
                  name={hasSymbol ? "checkmark-circle" : "ellipse-outline"} 
                  size={16} 
                  color={hasSymbol ? '#00cdb5' : '#9cadbc'} 
                />
                <Text style={[styles.requirementText, hasSymbol && styles.requirementMet]}>
                  At least one symbol (!@#$%...)
                </Text>
              </View>
            </View>
          )}

          {/* Confirm Password Input */}
          <Text style={styles.label}>Confirm new password</Text>
          <View style={[
            styles.inputRow,
            isFocusedConfirm && styles.inputRowFocused,
            passwordsMatch && styles.inputRowValid,
            confirmPassword.length > 0 && !passwordsMatch && styles.inputRowError,
          ]}>
            <Ionicons 
              name="lock-closed-outline" 
              size={20} 
              color={isFocusedConfirm ? '#00cdb5' : '#9cadbc'} 
              style={styles.inputIcon} 
            />
            <TextInput 
              style={styles.input} 
              placeholder="Confirm your password" 
              placeholderTextColor="#9cadbc"
              value={confirmPassword} 
              onChangeText={setConfirmPassword} 
              secureTextEntry={!showConfirm}
              autoComplete="off"
              textContentType="none"
              onFocus={() => setIsFocusedConfirm(true)}
              onBlur={() => setIsFocusedConfirm(false)}
            />
            <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
              <Ionicons 
                name={showConfirm ? "eye-outline" : "eye-off-outline"} 
                size={20} 
                color="#9cadbc" 
              />
            </TouchableOpacity>
          </View>

          {/* Password Match Indicator */}
          {confirmPassword.length > 0 && (
            <View style={styles.matchIndicator}>
              <Ionicons 
                name={passwordsMatch ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={passwordsMatch ? '#00cdb5' : COLORS.error} 
              />
              <Text style={[
                styles.matchText, 
                passwordsMatch ? styles.matchTextValid : styles.matchTextError
              ]}>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <LinearGradient 
            colors={isValid ? ['#00cdb5', '#0066ac'] : ['#CED3D5', '#CED3D5']} 
            start={{ x: 0, y: 0 }} 
            end={{ x: 1, y: 0 }} 
            style={styles.btn}
          >
            <TouchableOpacity 
              style={styles.btnInner} 
              onPress={handleSubmit}
              disabled={!isValid}
              activeOpacity={0.8}
            >
              <Text style={styles.btnText}>Reset Password</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </LinearGradient>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer Logo */}
      <View style={styles.footer} pointerEvents="none">
        <SmuppyText width={140} variant="dark" />
      </View>
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
    paddingBottom: SPACING['3xl'],
  },
  disabled: { 
    opacity: 0.6,
  },
  
  // Back Button
  backBtn: { 
    width: 44, 
    height: 44, 
    backgroundColor: COLORS.dark, 
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
    marginBottom: SPACING.md,
  },
  subtitle: { 
    fontSize: 15, 
    color: '#676C75', 
    textAlign: 'center', 
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
  
  // Labels
  label: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#0a252f', 
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  
  // Input
  inputRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    height: 56, 
    borderWidth: 1.5, 
    borderColor: '#CED3D5', 
    borderRadius: 28, 
    paddingHorizontal: 20,
    backgroundColor: COLORS.white,
  },
  inputRowFocused: {
    borderColor: '#00cdb5',
    backgroundColor: '#F0FDFB',
  },
  inputRowValid: {
    borderColor: '#00cdb5',
    backgroundColor: '#E6FAF8',
  },
  inputRowError: {
    borderColor: COLORS.error,
    backgroundColor: '#FEF2F2',
  },
  inputIcon: { 
    marginRight: 12,
  },
  input: { 
    flex: 1, 
    fontSize: 16, 
    color: '#0a252f',
  },
  
  // Requirements
  requirements: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.xs,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  requirementText: {
    fontSize: 13,
    color: '#9cadbc',
  },
  requirementMet: {
    color: '#00cdb5',
  },
  
  // Match Indicator
  matchIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    paddingLeft: SPACING.xs,
  },
  matchText: {
    fontSize: 13,
  },
  matchTextValid: {
    color: '#00cdb5',
  },
  matchTextError: {
    color: COLORS.error,
  },
  
  // Button
  btn: { 
    height: 56, 
    borderRadius: 28, 
    marginTop: SPACING.xl,
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
  
  // Footer
  footer: { 
    position: 'absolute', 
    bottom: SPACING['3xl'], 
    left: 0, 
    right: 0, 
    alignItems: 'center',
  },
});